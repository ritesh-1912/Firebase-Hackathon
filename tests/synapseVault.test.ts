// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Hoisted Mocks for Firebase AI Logic, Firestore, Remote Config & App Check
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  getGenerativeModelMock: vi.fn(),
  getAIMock: vi.fn(() => ({ __mockAI: true })),
  setDocMock: vi.fn(async () => undefined),
  deleteDocMock: vi.fn(async () => undefined),
  docMock: vi.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') })),
  collectionMock: vi.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') })),
  getAutoPiiFirewallEnabledMock: vi.fn(async () => true),
  getDefaultInferenceModeMock: vi.fn(async () => 'prefer_on_device' as const),
}));

vi.mock('firebase/ai', () => ({
  getAI: mocks.getAIMock,
  GoogleAIBackend: class GoogleAIBackend {},
  getGenerativeModel: mocks.getGenerativeModelMock.mockImplementation((_ai: unknown, cfg: any) => ({
    model: cfg?.model,
    generateContent: mocks.generateContentMock,
  })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mocks.collectionMock,
  doc: mocks.docMock,
  setDoc: mocks.setDocMock,
  deleteDoc: mocks.deleteDocMock,
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('../src/lib/firebase', () => ({
  app: { name: '[DEFAULT]' },
  appCheck: { __mockAppCheck: true },
  db: { __mockDb: true },
  auth: { __mockAuth: true },
  getAutoPiiFirewallEnabled: mocks.getAutoPiiFirewallEnabledMock,
  getDefaultInferenceMode: mocks.getDefaultInferenceModeMock,
}));

import { applyClientPiiFirewall, pcmToWavBlob } from '../src/services/piiFirewall';
import { parseUploadedFile, parsePdfFile } from '../src/services/documentParser';
import {
  checkChromePromptAPIAvailability,
  redactAndExtractLocal,
  queryLocalWorkspace,
  runInference,
  generateAudioBriefing,
  runSideBySideBenchmark,
} from '../src/services/hybridAI';
import { saveWorkspace, updateWorkspace } from '../src/services/workspaceStore';
import { SAMPLE_HELIOS_CASE_STUDY } from '../src/components/SourceVault';

// Polyfill File.prototype.text / arrayBuffer if missing in jsdom File instances
function createTestFile(content: string | Uint8Array, name: string, type: string): File {
  const blobPart = typeof content === 'string' ? content : (content as unknown as BlobPart);
  const file = new File([blobPart], name, { type });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: async () =>
        typeof content === 'string' ? content : new TextDecoder().decode(content),
    });
  }
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => {
        const bytes =
          typeof content === 'string' ? new TextEncoder().encode(content) : content;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    });
  }
  return file;
}

describe('1. Document Parser (documentParser.ts)', () => {
  it('parses plain text and Markdown files into indexed chunks', async () => {
    const mdContent = '# Battery Incident\n\nCell reached 88C.\n\nVent ruptured at 38.2 PSI.';
    const mdFile = createTestFile(mdContent, 'incident.md', 'text/markdown');
    const txtFile = createTestFile('Single paragraph log.', 'notes.txt', 'text/plain');

    const mdParsed = await parseUploadedFile(mdFile);
    expect(mdParsed.fileType).toBe('markdown');
    expect(mdParsed.chunks).toHaveLength(3);
    expect(mdParsed.chunks[1].text).toContain('88C');

    const txtParsed = await parseUploadedFile(txtFile);
    expect(txtParsed.fileType).toBe('text');
    expect(txtParsed.chunks).toHaveLength(1);
    expect(txtParsed.fullText).toBe('Single paragraph log.');
  });

  it('handles JPEG/PNG image ingestion for multimodal inference', async () => {
    const imgBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const imgFile = createTestFile(imgBytes, 'thermal-scan.png', 'image/png');

    const parsed = await parseUploadedFile(imgFile);
    expect(parsed.fileType).toBe('image');
    expect(parsed.imageFile).toBe(imgFile);
    expect(parsed.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(parsed.fullText).toContain('thermal-scan.png');
  });

  it('recovers gracefully from malformed/corrupt PDFs without throwing', async () => {
    const corruptPdf = createTestFile(
      '%PDF-1.4\nCORRUPT_BINARY_STREAM\nRecovered ASCII Telemetry: Pack 4B reached 88C\n%%EOF',
      'corrupted.pdf',
      'application/pdf'
    );

    const parsed = await parsePdfFile(corruptPdf);
    expect(parsed.fileType).toBe('pdf');
    expect(parsed.chunks.length).toBeGreaterThanOrEqual(1);
    expect(parsed.fullText).toContain('PDF Recovery Notice');
    expect(parsed.fullText).toContain('Recovered ASCII Telemetry: Pack 4B reached 88C');
  });
});

describe('2. Hybrid AI Routing, Schema Parsing & Fallback (hybridAI.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).LanguageModel;
    delete (window as any).ai;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.getAutoPiiFirewallEnabledMock.mockResolvedValue(true);
    mocks.getDefaultInferenceModeMock.mockResolvedValue('prefer_on_device');
  });

  afterEach(() => {
    delete (window as any).LanguageModel;
    delete (window as any).ai;
  });

  it('reports Chrome Prompt API availability across available, downloadable, and unavailable states', async () => {
    const none = await checkChromePromptAPIAvailability();
    expect(none.status).toBe('unavailable');

    (window as any).LanguageModel = {
      availability: vi.fn(async () => 'available'),
    };
    const ready = await checkChromePromptAPIAvailability();
    expect(ready.status).toBe('available');

    (window as any).LanguageModel = {
      availability: vi.fn(async () => 'downloadable'),
    };
    const dl = await checkChromePromptAPIAvailability();
    expect(dl.status).toBe('downloadable');
  });

  it('executes prefer_on_device locally with structured JSON parsing and 0 cloud egress', async () => {
    const destroyMock = vi.fn();
    (window as any).LanguageModel = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        inputQuota: 4096,
        inputUsage: 0,
        measureInputUsage: vi.fn(async () => 250),
        prompt: vi.fn(async () =>
          JSON.stringify({
            redactedText: 'Engineer [REDACTED_PERSON] logged 88C.',
            redactions: [
              {
                type: 'PERSON',
                originalSnippet: 'Marcus Vance',
                replacement: '[REDACTED_PERSON]',
              },
            ],
            nodes: [
              {
                id: 'n1',
                label: 'Pack #4B',
                category: 'Entity',
                summary: 'Battery pack under test',
                confidence: 0.96,
              },
            ],
            edges: [],
          })
        ),
        destroy: destroyMock,
      })),
    };

    const res = await redactAndExtractLocal(
      'Lead Test Engineer: Marcus Vance logged 88C.',
      undefined,
      'prefer_on_device'
    );

    expect(res.executionSource).toBe('on-device');
    expect(res.fallbackTriggered).toBe(false);
    expect(res.estimatedTokensSaved).toBeGreaterThan(0);
    expect(res.extraction.nodes[0].label).toBe('Pack #4B');
    expect(res.extraction.redactedText).toContain('[REDACTED_PERSON]');
    expect(mocks.generateContentMock).not.toHaveBeenCalled();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it('automatically falls back to Cloud gemini-3.8-flash when LanguageModel is unavailable or returns Chromium echo stub', async () => {
    (window as any).LanguageModel = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        prompt: vi.fn(
          async () =>
            'On-device model is not available in Chromium, this API is just echoing back the input.'
        ),
        destroy: vi.fn(),
      })),
    };

    mocks.generateContentMock.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            redactedText: 'Lead Test Engineer: [REDACTED_PERSON] (SSN: [REDACTED_ID])',
            redactions: [],
            nodes: [
              {
                id: 'n1',
                label: 'Thermal Spike 88C',
                category: 'Risk',
                summary: 'Exceeded 65C threshold',
                confidence: 0.95,
              },
            ],
            edges: [],
          }),
      },
    });

    const res = await redactAndExtractLocal(
      'Lead Test Engineer: Marcus Vance (SSN: 000-88-2194)',
      undefined,
      'prefer_on_device'
    );

    expect(res.executionSource).toBe('cloud');
    expect(res.fallbackTriggered).toBe(true);
    expect(res.estimatedTokensSaved).toBe(0);
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(1);
    // Ensure pre-cloud PII firewall stripped SSN and name BEFORE calling cloud model
    const sentPrompt = mocks.generateContentMock.mock.calls[0][0] as string;
    expect(sentPrompt).not.toContain('000-88-2194');
    expect(sentPrompt).not.toContain('Marcus Vance');
  });

  it('enforces only_on_device without cloud fallback and supports only_in_cloud mode', async () => {
    await expect(
      redactAndExtractLocal('Test content', undefined, 'only_on_device')
    ).rejects.toThrow(/not supported/i);
    expect(mocks.generateContentMock).not.toHaveBeenCalled();

    mocks.generateContentMock.mockResolvedValue({
      response: { text: () => 'Cloud Q&A answer: 88C.' },
    });

    const cloudRes = await runInference('What temperature?', { mode: 'only_in_cloud' });
    expect(cloudRes.executionSource).toBe('cloud');
    expect(cloudRes.fallbackTriggered).toBe(false);
    expect(cloudRes.text).toContain('88C');

    const qaRes = await queryLocalWorkspace('Temp?', 'Pack reached 88C', 'prefer_on_device');
    expect(qaRes.executionSource).toBe('cloud');
    expect(qaRes.fallbackTriggered).toBe(true);
  });

  it('falls back to Web Speech API for audio briefing when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: speakMock, cancel: cancelMock },
    });
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      constructor(t: string) {
        this.text = t;
      }
    };

    const audioRes = await generateAudioBriefing('Executive briefing summary.');
    expect(audioRes.usedFallback).toBe(true);
    expect(speakMock).toHaveBeenCalledTimes(1);
  });
});

describe('3. Privacy Firewall & Firestore Enforcement (workspaceStore.ts & piiFirewall.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAutoPiiFirewallEnabledMock.mockResolvedValue(true);
  });

  it('redacts all PII across Project Helios documents and preserves technical metrics', () => {
    const combined = SAMPLE_HELIOS_CASE_STUDY.map((d) => d.content).join('\n\n');
    const { sanitized, extraRedactions } = applyClientPiiFirewall(combined);

    for (const secret of [
      '000-88-2194',
      '4111-9012-3382-7714',
      'mvance@helios-energy.internal',
      'erostova@nexacell.tech',
      '555-0149',
      '555-0182',
      '555-0199',
      'Marcus Vance',
      'Elena Rostova',
      'Jonathan Hayes',
      '#AUD-9912',
      '#NEXA-TOK-99218-SEC',
    ]) {
      expect(sanitized).not.toContain(secret);
    }

    expect(extraRedactions.length).toBeGreaterThanOrEqual(10);

    const techOnly =
      'Pack #4B reached 88°C vs 65°C rated limit under 3C discharge; BMIC-891 ref QA-SIGNOFF-2026-Q4.';
    const cleanCheck = applyClientPiiFirewall(techOnly);
    expect(cleanCheck.sanitized).toBe(techOnly);
    expect(cleanCheck.extraRedactions).toHaveLength(0);
  });

  it('strips unredacted PII before writing to Firestore in saveWorkspace and updateWorkspace', async () => {
    await saveWorkspace('judge-uid-123', {
      id: 'ws-1',
      name: 'Helios Investigation',
      sources: [],
      redactedText: 'Lead Test Engineer: Marcus Vance (SSN: 000-88-2194, Cell: 555-0149)',
      redactionsCount: 0,
      nodes: [],
      edges: [],
      isOfflineCreated: false,
      createdAt: 1000,
      updatedAt: 1000,
    });

    expect(mocks.setDocMock).toHaveBeenCalledTimes(1);
    const savedPayload = (mocks.setDocMock.mock.calls[0] as unknown as any[])[1];
    expect(savedPayload.redactedText).not.toContain('Marcus Vance');
    expect(savedPayload.redactedText).not.toContain('000-88-2194');
    expect(savedPayload.redactedText).not.toContain('555-0149');
    expect(savedPayload.redactedText).toContain('[REDACTED_PERSON]');
    expect(savedPayload.redactedText).toContain('[REDACTED_ID]');

    await updateWorkspace('judge-uid-123', 'ws-1', {
      redactedText: 'Email: erostova@nexacell.tech Secret-Key #NEXA-TOK-99218-SEC',
    });

    const updatedPayload = (mocks.setDocMock.mock.calls[1] as unknown as any[])[1];
    expect(updatedPayload.redactedText).not.toContain('erostova@nexacell.tech');
    expect(updatedPayload.redactedText).not.toContain('#NEXA-TOK-99218-SEC');
  });

  it('constructs valid 44-byte RIFF/WAVE header for 24kHz mono PCM audio', async () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const blob = pcmToWavBlob(pcm, 24000);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + pcm.byteLength);

    const buf = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(buf.buffer);
    expect(String.fromCharCode(...buf.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...buf.slice(8, 12))).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(40, true)).toBe(pcm.byteLength);
  });
});

describe('4. Benchmark, Sample Case Study & Compliance Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).LanguageModel;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('validates Project Helios case study has 3 documents, PII, and a deliberate contradiction', () => {
    expect(SAMPLE_HELIOS_CASE_STUDY).toHaveLength(3);
    const [fieldLog, specSheet, auditMemo] = SAMPLE_HELIOS_CASE_STUDY;

    expect(fieldLog.content).toContain('88°C');
    expect(specSheet.content).toContain('65°C');
    expect(auditMemo.content).toContain('CONTRADICTION CLAIM');
    expect(auditMemo.content).toContain('zero thermal limit excursions above 65°C');
  });

  it('computes side-by-side benchmark telemetry cleanly with 0 B local egress and offline cloud edge case', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const offlineBench = await runSideBySideBenchmark('Sample test text', false);
    expect(offlineBench.local.networkBytesSent).toBe(0);
    expect(offlineBench.local.estimatedCostUsd).toBe(0);
    expect(offlineBench.cloud.success).toBe(false);
    expect(offlineBench.cloud.error).toMatch(/offline/i);
  });

  it('enforces repository security, .gitignore exclusions, App Check ordering, and Firestore rules', () => {
    const root = process.cwd();
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.firebase\/$/m);

    const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
    expect(license).toContain('Apache License');
    expect(license).toContain('Version 2.0');

    const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
    expect(rules).toMatch(/allow read, write: if false;/);
    expect(rules).toMatch(/allow read, write: if isOwner\(userId\);/);

    const hybridAiSrc = fs.readFileSync(path.join(root, 'src/services/hybridAI.ts'), 'utf8');
    const appCheckRefIdx = hybridAiSrc.indexOf('void appCheck;');
    const getAiIdx = hybridAiSrc.indexOf('getAI(app');
    expect(appCheckRefIdx).toBeGreaterThan(-1);
    expect(getAiIdx).toBeGreaterThan(appCheckRefIdx);
  });
});
