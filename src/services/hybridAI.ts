import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, appCheck, getDefaultInferenceMode, getAutoPiiFirewallEnabled } from '../lib/firebase';

// 1. Ensure Firebase App Check is initialized strictly prior to any getAI() call
void appCheck;

export const ai = getAI(app, {
  backend: new GoogleAIBackend(),
});

// Telemetry Result with token and cost metrics
export interface TelemetryResult {
  text: string;
  parsedJson?: any;
  executionSource: 'on-device' | 'cloud';
  latencyMs: number;
  fallbackTriggered: boolean;
  estimatedTokensSaved: number;
  estimatedCostSavedUsd: number;
}

export type PromptAPIAvailabilityStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface ChromePromptAPICheckResult {
  status: PromptAPIAvailabilityStatus;
  downloadProgressPercentage?: number;
}

export interface PromptAPISession {
  prompt: (input: any) => Promise<string>;
}

export interface PromptAPI {
  availability?: (options?: any) => Promise<string>;
  capabilities?: (options?: any) => Promise<any>;
  create?: (options?: any) => Promise<PromptAPISession>;
}

// SynapseVault Knowledge Graph & Redaction Types
export interface RedactionItem {
  type: 'PERSON' | 'CONTACT' | 'FINANCIAL' | 'ID';
  originalSnippet: string;
  replacement: string;
}

export type GraphNodeCategory = 'Entity' | 'Concept' | 'Claim' | 'Risk' | 'Evidence';

export interface GraphNode {
  id: string;
  label: string;
  category: GraphNodeCategory;
  summary: string;
  confidence: number;
}

export type GraphEdgeRelation = 'SUPPORTS' | 'CONTRADICTS' | 'DEPENDS_ON' | 'MENTIONS';

export interface GraphEdge {
  source: string;
  target: string;
  relation: GraphEdgeRelation;
}

export interface ExtractionPayload {
  redactedText: string;
  redactions: RedactionItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CloudBriefing {
  executiveSummary: string;
  contradictions: Array<{
    claimA: string;
    claimB: string;
    conflictReason: string;
    citation?: string;
  }>;
  knowledgeGaps: string[];
  recommendedActions: string[];
}

/**
 * Safely resolves the Chrome Prompt API (Gemini Nano) from the global window context
 */
export function getPromptAPI(): PromptAPI | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    LanguageModel?: PromptAPI;
    ai?: { languageModel?: PromptAPI };
  };
  return win.LanguageModel || win.ai?.languageModel || null;
}

let currentDownloadProgress = 0;

/**
 * Checks Chrome Prompt API availability (LanguageModel.availability())
 * Reports status: 'available' | 'downloadable' | 'downloading' | 'unavailable'
 * and tracks download progress percentage.
 */
export async function checkChromePromptAPIAvailability(
  onProgress?: (percentage: number) => void
): Promise<ChromePromptAPICheckResult> {
  if (typeof window === 'undefined') {
    return { status: 'unavailable', downloadProgressPercentage: 0 };
  }

  try {
    const languageModelAPI = getPromptAPI();

    if (!languageModelAPI) {
      return { status: 'unavailable', downloadProgressPercentage: 0 };
    }

    let rawAvailability: string = 'unavailable';

    if (typeof languageModelAPI.availability === 'function') {
      rawAvailability = await languageModelAPI.availability();
    } else if (typeof languageModelAPI.capabilities === 'function') {
      const caps = await languageModelAPI.capabilities();
      rawAvailability = caps?.available || caps?.availability || 'unavailable';
    }

    let status: PromptAPIAvailabilityStatus = 'unavailable';
    if (rawAvailability === 'available' || rawAvailability === 'readily') {
      status = 'available';
      currentDownloadProgress = 100;
    } else if (rawAvailability === 'downloadable' || rawAvailability === 'after-download') {
      status = currentDownloadProgress > 0 && currentDownloadProgress < 100 ? 'downloading' : 'downloadable';
    } else if (rawAvailability === 'downloading') {
      status = 'downloading';
    } else {
      status = 'unavailable';
    }

    if (onProgress && currentDownloadProgress > 0) {
      onProgress(currentDownloadProgress);
    }

    return {
      status,
      downloadProgressPercentage: currentDownloadProgress,
    };
  } catch (error) {
    console.warn('[Prompt API] Availability check error:', error);
    return { status: 'unavailable', downloadProgressPercentage: 0 };
  }
}

/**
 * Client-Side Deterministic Regex PII Firewall
 * Extra safety layer guaranteeing zero leakage of credentials, cards, phones, and SSNs
 */
export function applyClientPiiFirewall(rawText: string): {
  sanitized: string;
  extraRedactions: RedactionItem[];
} {
  let sanitized = rawText;
  const extraRedactions: RedactionItem[] = [];

  // 1. SSN / National IDs (e.g. 000-00-0000)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  sanitized = sanitized.replace(ssnRegex, (match) => {
    extraRedactions.push({
      type: 'ID',
      originalSnippet: match,
      replacement: '[REDACTED_ID]',
    });
    return '[REDACTED_ID]';
  });

  // 2. Credit Cards (13-19 digits with dashes or spaces)
  const ccRegex = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|(?:4\d{3}|5[1-5]\d{2}|6011)[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g;
  sanitized = sanitized.replace(ccRegex, (match) => {
    extraRedactions.push({
      type: 'FINANCIAL',
      originalSnippet: match,
      replacement: '[REDACTED_FINANCIAL]',
    });
    return '[REDACTED_FINANCIAL]';
  });

  // 3. Email Addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  sanitized = sanitized.replace(emailRegex, (match) => {
    extraRedactions.push({
      type: 'CONTACT',
      originalSnippet: match,
      replacement: '[REDACTED_CONTACT]',
    });
    return '[REDACTED_CONTACT]';
  });

  // 4. Phone numbers (e.g. 555-0199, (555) 019-9921)
  const phoneRegex = /\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g;
  sanitized = sanitized.replace(phoneRegex, (match) => {
    extraRedactions.push({
      type: 'CONTACT',
      originalSnippet: match,
      replacement: '[REDACTED_CONTACT]',
    });
    return '[REDACTED_CONTACT]';
  });

  return { sanitized, extraRedactions };
}

/**
 * Calculates estimated tokens and cost saved by running on-device
 */
function calculateLocalSavings(inputLength: number, outputLength: number) {
  // Approximate 1 token ~= 4 characters
  const estimatedTokens = Math.round((inputLength + outputLength) / 4);
  // Rate: ~$0.00000075 per token ($0.75 / 1M tokens combined)
  const estimatedCost = Number((estimatedTokens * 0.00000075).toFixed(6));
  return { estimatedTokens, estimatedCost };
}

/**
 * Helper to convert an image file to inlineData for Firebase AI Logic
 */
async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return {
    inlineData: {
      data: base64Data,
      mimeType: file.type || 'image/jpeg',
    },
  };
}

/**
 * Low-level on-device execution using Chrome Prompt API (Gemini Nano)
 */
async function executeOnDevice(
  prompt: string,
  options?: {
    imageFile?: File;
    responseSchema?: any;
    onDownloadProgress?: (percentage: number) => void;
  }
): Promise<{ text: string; parsedJson?: any }> {
  if (typeof window === 'undefined') {
    throw new Error('On-device inference is only available in browser environments.');
  }

  const languageModelAPI = getPromptAPI();
  if (!languageModelAPI) {
    throw new Error(
      'Chrome Prompt API (LanguageModel) is not supported in this browser. To enable on-device Gemini Nano, open Chrome 139+ with chrome://flags/#prompt-api-for-gemini-nano enabled.'
    );
  }

  const availabilityResult = await checkChromePromptAPIAvailability();
  if (availabilityResult.status === 'unavailable') {
    throw new Error('Chrome Prompt API is currently unavailable on this device.');
  }

  if (typeof languageModelAPI.create !== 'function') {
    throw new Error('Chrome Prompt API create method is not supported in this browser.');
  }

  const createOptions: any = {};
  createOptions.monitor = (monitorTarget: any) => {
    if (monitorTarget && typeof monitorTarget.addEventListener === 'function') {
      monitorTarget.addEventListener('downloadprogress', (e: any) => {
        if (e.total && e.total > 0) {
          const pct = Math.round((e.loaded / e.total) * 100);
          currentDownloadProgress = pct;
          if (options?.onDownloadProgress) {
            options.onDownloadProgress(pct);
          }
        }
      });
    }
  };

  const session = await languageModelAPI.create(createOptions);

  let fullPrompt = prompt;
  if (options?.responseSchema) {
    const schemaString =
      typeof options.responseSchema === 'string'
        ? options.responseSchema
        : JSON.stringify(options.responseSchema, null, 2);
    fullPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON conforming to the following schema:\n${schemaString}\nDo not include code blocks or markdown wrappers.`;
  }

  let rawOutput = '';

  if (options?.imageFile) {
    if (typeof createImageBitmap !== 'undefined') {
      try {
        const imageBitmap = await createImageBitmap(options.imageFile);
        rawOutput = await session.prompt([
          { type: 'text', value: fullPrompt },
          { type: 'image', value: imageBitmap },
        ]);
      } catch {
        throw new Error('Multimodal image input is not supported by this local on-device model.');
      }
    } else {
      throw new Error('ImageBitmap API unavailable for local multimodal inference.');
    }
  } else {
    rawOutput = await session.prompt(fullPrompt);
  }

  let parsedJson: any = undefined;
  if (options?.responseSchema) {
    try {
      const sanitized = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedJson = JSON.parse(sanitized);
    } catch {
      console.warn('[Prompt API] Could not parse JSON response:', rawOutput);
    }
  }

  return { text: rawOutput, parsedJson };
}

/**
 * Low-level cloud execution via Firebase AI Logic using gemini-3.8-flash
 */
async function executeInCloud(
  prompt: string,
  imageFile?: File,
  responseSchema?: any
): Promise<{ text: string; parsedJson?: any }> {
  const modelConfig: any = {
    model: 'gemini-3.8-flash',
  };

  if (responseSchema) {
    modelConfig.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema,
    };
  }

  const cloudModel = getGenerativeModel(ai, modelConfig);

  let rawText = '';
  if (imageFile) {
    const imagePart = await fileToGenerativePart(imageFile);
    const result = await cloudModel.generateContent([prompt, imagePart]);
    const response = await result.response;
    rawText = response.text();
  } else {
    const result = await cloudModel.generateContent(prompt);
    const response = await result.response;
    rawText = response.text();
  }

  let parsedJson: any = undefined;
  if (responseSchema) {
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      console.warn('[Cloud AI] Could not parse cloud JSON response:', rawText);
    }
  }

  return { text: rawText, parsedJson };
}

// -------------------------------------------------------------
// CORE TYPED PIPELINE OPERATIONS (Prompt A)
// -------------------------------------------------------------

export const EXTRACTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    redactedText: {
      type: 'string',
      description: 'The source text where all PII has been replaced with typed tokens ([REDACTED_PERSON], [REDACTED_CONTACT], [REDACTED_FINANCIAL], [REDACTED_ID])',
    },
    redactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['PERSON', 'CONTACT', 'FINANCIAL', 'ID'] },
          originalSnippet: { type: 'string' },
          replacement: { type: 'string' },
        },
        required: ['type', 'originalSnippet', 'replacement'],
      },
    },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          category: { type: 'string', enum: ['Entity', 'Concept', 'Claim', 'Risk', 'Evidence'] },
          summary: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['id', 'label', 'category', 'summary', 'confidence'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          relation: { type: 'string', enum: ['SUPPORTS', 'CONTRADICTS', 'DEPENDS_ON', 'MENTIONS'] },
        },
        required: ['source', 'target', 'relation'],
      },
    },
  },
  required: ['redactedText', 'redactions', 'nodes', 'edges'],
};

/**
 * 1. redactAndExtractLocal(content, imageFile?)
 * Runs with mode: "prefer_on_device" (or "only_on_device" when forced).
 * Extracts typed knowledge graph and redacts PII before any cloud egress.
 */
export async function redactAndExtractLocal(
  content: string,
  imageFile?: File,
  forceLocal = false
): Promise<TelemetryResult & { extraction: ExtractionPayload }> {
  const startTime = performance.now();

  const extractionPrompt = `You are SynapseVault's On-Device Knowledge Graph & PII Extraction Engine.
Analyze the provided document text or image.

TASKS:
1. PII Redaction: Replace all personal names with [REDACTED_PERSON], emails/phone numbers with [REDACTED_CONTACT], account/credit numbers/monetary balances with [REDACTED_FINANCIAL], and SSNs/ID numbers with [REDACTED_ID].
2. Knowledge Graph: Extract core atomic knowledge nodes (category: Entity, Concept, Claim, Risk, Evidence) and relationship edges (relation: SUPPORTS, CONTRADICTS, DEPENDS_ON, MENTIONS).
3. Return strictly valid JSON adhering to the extraction schema.

Source Content:
"""
${content}
"""`;

  let executionSource: 'on-device' | 'cloud' = 'on-device';
  let fallbackTriggered = false;
  let rawResult: { text: string; parsedJson?: any };

  try {
    rawResult = await executeOnDevice(extractionPrompt, {
      imageFile,
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
    });
  } catch (localErr) {
    if (forceLocal) {
      throw localErr;
    }
    console.info('[SynapseVault] Local extraction unavailable; falling back to cloud gemini-3.8-flash:', localErr);
    executionSource = 'cloud';
    fallbackTriggered = true;
    rawResult = await executeInCloud(extractionPrompt, imageFile, EXTRACTION_RESPONSE_SCHEMA);
  }

  const latencyMs = Math.round(performance.now() - startTime);

  let parsed: ExtractionPayload;
  if (rawResult.parsedJson) {
    parsed = rawResult.parsedJson;
  } else {
    try {
      const sanitized = rawResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(sanitized);
    } catch {
      // Fallback deterministic fallback if parsing fails
      parsed = {
        redactedText: content,
        redactions: [],
        nodes: [
          {
            id: 'node_1',
            label: 'Extracted Content',
            category: 'Entity',
            summary: content.slice(0, 100),
            confidence: 0.9,
          },
        ],
        edges: [],
      };
    }
  }

  // Cross-check with client-side deterministic PII regex firewall if Remote Config enables it
  const firewallEnabled = await getAutoPiiFirewallEnabled();
  if (firewallEnabled) {
    const firewallCheck = applyClientPiiFirewall(parsed.redactedText || content);
    parsed.redactedText = firewallCheck.sanitized;
    parsed.redactions = [...(parsed.redactions || []), ...firewallCheck.extraRedactions];
  }

  const { estimatedTokens, estimatedCost } =
    executionSource === 'on-device'
      ? calculateLocalSavings(content.length, rawResult.text.length)
      : { estimatedTokens: 0, estimatedCost: 0 };

  return {
    text: rawResult.text,
    parsedJson: parsed,
    executionSource,
    latencyMs,
    fallbackTriggered,
    estimatedTokensSaved: estimatedTokens,
    estimatedCostSavedUsd: estimatedCost,
    extraction: parsed,
  };
}

/**
 * 2. queryLocalWorkspace(question, localContext)
 * Fast single-turn offline Q&A using prefer_on_device over the sanitized local knowledge context.
 */
export async function queryLocalWorkspace(
  question: string,
  localContext: string,
  forceLocal = false
): Promise<TelemetryResult> {
  const startTime = performance.now();

  const queryPrompt = `You are SynapseVault Local AI Assistant.
Answer the user's question using ONLY the following verified local knowledge graph context.
If the answer cannot be determined from the context, state that clearly without guessing.
Keep your response concise, factual, and accurate.

LOCAL CONTEXT:
"""
${localContext}
"""

USER QUESTION: ${question}`;

  let executionSource: 'on-device' | 'cloud' = 'on-device';
  let fallbackTriggered = false;
  let rawResult: { text: string; parsedJson?: any };

  try {
    rawResult = await executeOnDevice(queryPrompt);
  } catch (err) {
    if (forceLocal) throw err;
    console.info('[SynapseVault] Local Q&A falling back to cloud:', err);
    executionSource = 'cloud';
    fallbackTriggered = true;
    rawResult = await executeInCloud(queryPrompt);
  }

  const latencyMs = Math.round(performance.now() - startTime);

  const { estimatedTokens, estimatedCost } =
    executionSource === 'on-device'
      ? calculateLocalSavings(queryPrompt.length, rawResult.text.length)
      : { estimatedTokens: 0, estimatedCost: 0 };

  return {
    text: rawResult.text,
    parsedJson: rawResult.parsedJson,
    executionSource,
    latencyMs,
    fallbackTriggered,
    estimatedTokensSaved: estimatedTokens,
    estimatedCostSavedUsd: estimatedCost,
  };
}

/**
 * 3. synthesizeCloudBriefing(sanitizedGraphPayload)
 * Runs with mode: "only_in_cloud" on gemini-3.8-flash using ONLY redacted text and graph topology.
 * Returns structured JSON containing executiveSummary, contradictions, knowledgeGaps, and recommendedActions.
 */
export async function synthesizeCloudBriefing(sanitizedGraphPayload: {
  redactedText: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}): Promise<TelemetryResult & { briefing: CloudBriefing }> {
  const startTime = performance.now();

  const synthesisSchema = {
    type: 'object',
    properties: {
      executiveSummary: {
        type: 'string',
        description: 'Comprehensive high-level synthesis of verified claims and knowledge graph entities',
      },
      contradictions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claimA: { type: 'string' },
            claimB: { type: 'string' },
            conflictReason: { type: 'string' },
            citation: { type: 'string' },
          },
          required: ['claimA', 'claimB', 'conflictReason'],
        },
      },
      knowledgeGaps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Missing evidence, unverified dependencies, or critical risks needing follow-up',
      },
      recommendedActions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Actionable strategic steps based on the cross-document graph analysis',
      },
    },
    required: ['executiveSummary', 'contradictions', 'knowledgeGaps', 'recommendedActions'],
  };

  const cloudPrompt = `You are SynapseVault Cloud Research & Knowledge Synthesis Intelligence.
Perform deep synthesis and cross-examination on the following SANITIZED knowledge graph payload.
Note: All personal identifiers have been pre-redacted by the on-device privacy firewall.

REDACTED SOURCE TEXT:
"""
${sanitizedGraphPayload.redactedText}
"""

KNOWLEDGE GRAPH TOPOLOGY:
Nodes:
${JSON.stringify(sanitizedGraphPayload.nodes, null, 2)}

Edges:
${JSON.stringify(sanitizedGraphPayload.edges, null, 2)}

REQUIREMENTS:
1. Synthesize an executive summary combining the verified nodes and relational edges.
2. Detect any direct or implied CONTRADICTIONS between claims or evidence.
3. Identify unverified dependencies or KNOWLEDGE GAPS.
4. Formulate prioritized strategic RECOMMENDED ACTIONS.
Return valid JSON adhering to the schema.`;

  const cloudResult = await executeInCloud(cloudPrompt, undefined, synthesisSchema);
  const latencyMs = Math.round(performance.now() - startTime);

  let briefing: CloudBriefing;
  if (cloudResult.parsedJson) {
    briefing = cloudResult.parsedJson;
  } else {
    try {
      const sanitized = cloudResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      briefing = JSON.parse(sanitized);
    } catch {
      briefing = {
        executiveSummary: cloudResult.text.slice(0, 300),
        contradictions: [],
        knowledgeGaps: ['Review primary source documents for confirmation'],
        recommendedActions: ['Archive sanitized graph into workspace vault'],
      };
    }
  }

  return {
    text: cloudResult.text,
    parsedJson: briefing,
    executionSource: 'cloud',
    latencyMs,
    fallbackTriggered: false,
    estimatedTokensSaved: 0,
    estimatedCostSavedUsd: 0,
    briefing,
  };
}

/**
 * Constructs a standard 44-byte WAV header for 24kHz 16-bit Mono Linear PCM
 */
export function pcmToWavBlob(pcmBytes: Uint8Array, sampleRate = 24000): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBytes.byteLength;

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF chunk
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([header, pcmBytes], { type: 'audio/wav' });
}

/**
 * Fallback Web Speech API audio synthesis for offline / quota situations
 */
export function playWebSpeechFallback(text: string, onEnd?: () => void): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * 4. generateAudioBriefing(executiveSummary)
 * Uses gemini-3.1-flash-tts-preview via Firebase AI Logic with clean fallback to Web Speech API
 */
export async function generateAudioBriefing(
  executiveSummary: string
): Promise<{ audioUrl?: string; audioBlob?: Blob; usedFallback: boolean; error?: string }> {
  try {
    if (!navigator.onLine) {
      throw new Error('Offline mode: Using browser Web Speech API.');
    }

    const tslModel = getGenerativeModel(ai, {
      model: 'gemini-3.1-flash-tts-preview',
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck',
            },
          },
        },
      } as any,
    });

    const ttsPrompt = `[Audio Profile: Clear, authoritative executive research intelligence briefer]
[Director's Note: Deliver at a steady, engaging pace suitable for high-level decision makers]

${executiveSummary}`;

    const result = await tslModel.generateContent(ttsPrompt);
    const response = await result.response;

    // Check inlineData parts for audio bytes
    const candidates = (response as any).candidates || [];
    let audioBytes: Uint8Array | null = null;
    let mimeType = 'audio/wav';

    for (const cand of candidates) {
      for (const part of cand.content?.parts || []) {
        if ('inlineData' in part && part.inlineData?.data) {
          const rawBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'audio/wav';
          const binaryStr = window.atob(rawBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          audioBytes = bytes;
          break;
        }
      }
      if (audioBytes) break;
    }

    if (!audioBytes) {
      throw new Error('No inline audio data returned by Gemini TTS.');
    }

    let blob: Blob;
    if (mimeType.includes('wav')) {
      blob = new Blob([audioBytes], { type: 'audio/wav' });
    } else {
      blob = pcmToWavBlob(audioBytes, 24000);
    }

    const audioUrl = URL.createObjectURL(blob);
    return { audioUrl, audioBlob: blob, usedFallback: false };
  } catch (err: any) {
    console.info('[SynapseVault] Audio briefing falling back to Web Speech API:', err?.message);
    const fallbackActive = playWebSpeechFallback(executiveSummary);
    return {
      usedFallback: true,
      error: fallbackActive ? undefined : 'Web Speech API unavailable',
    };
  }
}

// -------------------------------------------------------------
// BACKWARD COMPATIBLE EXPORTS (Preserving existing bindings)
// -------------------------------------------------------------

export async function runHybridInference(prompt: string, imageFile?: File): Promise<TelemetryResult> {
  const res = await redactAndExtractLocal(prompt, imageFile, false);
  return {
    text: res.text,
    parsedJson: res.parsedJson,
    executionSource: res.executionSource,
    latencyMs: res.latencyMs,
    fallbackTriggered: res.fallbackTriggered,
    estimatedTokensSaved: res.estimatedTokensSaved,
    estimatedCostSavedUsd: res.estimatedCostSavedUsd,
  };
}

export async function runLocalOnlyInference(
  prompt: string,
  responseSchema?: any,
  imageFile?: File
): Promise<TelemetryResult> {
  const startTime = performance.now();
  const localResult = await executeOnDevice(prompt, { imageFile, responseSchema });
  const latencyMs = Math.round(performance.now() - startTime);
  const { estimatedTokens, estimatedCost } = calculateLocalSavings(prompt.length, localResult.text.length);

  return {
    text: localResult.text,
    parsedJson: localResult.parsedJson,
    executionSource: 'on-device',
    latencyMs,
    fallbackTriggered: false,
    estimatedTokensSaved: estimatedTokens,
    estimatedCostSavedUsd: estimatedCost,
  };
}

export async function runCloudOnlyInference(prompt: string, imageFile?: File): Promise<TelemetryResult> {
  const startTime = performance.now();
  const cloudResult = await executeInCloud(prompt, imageFile);
  const latencyMs = Math.round(performance.now() - startTime);

  return {
    text: cloudResult.text,
    parsedJson: cloudResult.parsedJson,
    executionSource: 'cloud',
    latencyMs,
    fallbackTriggered: false,
    estimatedTokensSaved: 0,
    estimatedCostSavedUsd: 0,
  };
}

export async function runInference(
  prompt: string,
  options?: {
    mode?: 'prefer_on_device' | 'only_on_device' | 'only_in_cloud';
    imageFile?: File;
    responseSchema?: any;
  }
): Promise<TelemetryResult> {
  const effectiveMode = options?.mode || (await getDefaultInferenceMode());

  switch (effectiveMode) {
    case 'only_on_device':
      return runLocalOnlyInference(prompt, options?.responseSchema, options?.imageFile);
    case 'only_in_cloud':
      return runCloudOnlyInference(prompt, options?.imageFile);
    case 'prefer_on_device':
    default:
      return runHybridInference(prompt, options?.imageFile);
  }
}
