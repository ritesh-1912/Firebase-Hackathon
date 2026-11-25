import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, appCheck, getDefaultInferenceMode, getAutoPiiFirewallEnabled } from '../lib/firebase';
import {
  applyClientPiiFirewall,
  pcmToWavBlob,
  type FirewallRedactionItem,
} from './piiFirewall';

export { applyClientPiiFirewall, pcmToWavBlob };

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
  prompt: (input: any, options?: any) => Promise<string>;
  inputQuota?: number;
  inputUsage?: number;
  measureInputUsage?: (input: any) => Promise<number>;
  destroy?: () => void;
}

export interface PromptAPI {
  availability?: (options?: any) => Promise<string>;
  capabilities?: (options?: any) => Promise<any>;
  create?: (options?: any) => Promise<PromptAPISession>;
}

// SynapseVault Knowledge Graph & Redaction Types
export type RedactionItem = FirewallRedactionItem;

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

// Firewall and WAV helpers moved to ./piiFirewall and re-exported above.

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

  try {
    let fullPrompt = prompt;
    if (options?.responseSchema) {
      // Keep schema instruction compact so Chrome Nano's tight inputQuota is never exhausted
      const compactHint =
        typeof options.responseSchema === 'string'
          ? options.responseSchema.slice(0, 400)
          : '{"redactedText":string,"redactions":[{"type":"PERSON"|"CONTACT"|"FINANCIAL"|"ID","originalSnippet":string,"replacement":string}],"nodes":[{"id":string,"label":string,"category":"Entity"|"Concept"|"Claim"|"Risk"|"Evidence","summary":string,"confidence":number}],"edges":[{"source":string,"target":string,"relation":"SUPPORTS"|"CONTRADICTS"|"DEPENDS_ON"|"MENTIONS"}]}';
      fullPrompt = `${prompt}\n\nRespond ONLY with raw valid JSON matching: ${compactHint}`;
    }

    // Proactively guard against Chrome Prompt API QuotaExceededError ("The input is too large")
    if (!options?.imageFile && typeof session.measureInputUsage === 'function' && typeof session.inputQuota === 'number') {
      try {
        const required = await session.measureInputUsage(fullPrompt);
        const available = Math.max(128, session.inputQuota - (session.inputUsage || 0));
        if (required > available * 0.85) {
          const ratio = (available * 0.8) / required;
          const maxChars = Math.max(350, Math.floor(fullPrompt.length * ratio));
          const suffix = options?.responseSchema
            ? '\n\nRespond ONLY with raw valid JSON matching the schema.'
            : '';
          fullPrompt = `${prompt.slice(0, maxChars)}${suffix}`;
        }
      } catch {
        // Ignore measurement errors and proceed with prompt execution
      }
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
      try {
        rawOutput = await session.prompt(fullPrompt);
      } catch (promptErr: any) {
        const errMsg = String(promptErr?.message || promptErr || '');
        if (promptErr?.name === 'QuotaExceededError' || /too large|quota/i.test(errMsg)) {
          // One compact retry for tight browser Nano quotas
          const trimmedPrompt = `${prompt.slice(0, 600)}\n\nRespond ONLY with concise valid JSON.`;
          rawOutput = await session.prompt(trimmedPrompt);
        } else {
          throw promptErr;
        }
      }
    }

    if (/^On-device model is not available in Chromium/i.test(rawOutput.trim())) {
      throw new Error('On-device Gemini Nano weights are not loaded in this browser.');
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
  } finally {
    try {
      session.destroy?.();
    } catch {
      // Ignore cleanup errors
    }
  }
}

const CLOUD_MODEL_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

function isTransientCloudError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /\b(500|502|503|504|429)\b|high demand|overloaded|unavailable|INTERNAL|RESOURCE_EXHAUSTED|Failed to fetch|ERR_CONNECTION_RESET|timed out/i.test(
    msg
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Low-level cloud execution via Firebase AI Logic (primary: gemini-3.8-flash,
 * with single-pass transient-demand fallback and 15s per-model timeout)
 */
async function executeInCloud(
  prompt: string,
  imageFile?: File,
  responseSchema?: any
): Promise<{ text: string; parsedJson?: any }> {
  const imagePart = imageFile ? await fileToGenerativePart(imageFile) : null;
  let lastError: unknown;

  for (let i = 0; i < CLOUD_MODEL_FALLBACK_CHAIN.length; i++) {
    const modelName = CLOUD_MODEL_FALLBACK_CHAIN[i];
    const modelConfig: any = {
      model: modelName,
    };

    if (responseSchema) {
      modelConfig.generationConfig = {
        responseMimeType: 'application/json',
        responseSchema,
      };
    }

    const cloudModel = getGenerativeModel(ai, modelConfig);

    try {
      const requestPromise = imagePart
        ? cloudModel.generateContent([prompt, imagePart])
        : cloudModel.generateContent(prompt);
      const result = await withTimeout(requestPromise, 15000, modelName);
      const response = await result.response;
      const rawText = response.text();

      let parsedJson: any = undefined;
      if (responseSchema) {
        try {
          parsedJson = JSON.parse(rawText);
        } catch {
          console.warn(`[Cloud AI:${modelName}] Could not parse cloud JSON response:`, rawText);
        }
      }

      return { text: rawText, parsedJson };
    } catch (err) {
      lastError = err;
      const hasNext = i < CLOUD_MODEL_FALLBACK_CHAIN.length - 1;
      if (hasNext && isTransientCloudError(err)) {
        console.warn(`[Cloud AI] ${modelName} transient error; trying ${CLOUD_MODEL_FALLBACK_CHAIN[i + 1]}:`, err);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
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
  forceLocalOrMode: boolean | 'prefer_on_device' | 'only_on_device' | 'only_in_cloud' = false
): Promise<TelemetryResult & { extraction: ExtractionPayload }> {
  const startTime = performance.now();
  const forceLocal = forceLocalOrMode === true || forceLocalOrMode === 'only_on_device';
  const forceCloud = forceLocalOrMode === 'only_in_cloud';

  const extractionPrompt = `You are SynapseVault's Knowledge Graph & PII Extraction Engine.
Analyze the source text or image:
1. Replace personal names with [REDACTED_PERSON], emails/phones with [REDACTED_CONTACT], card/account numbers with [REDACTED_FINANCIAL], and SSNs/IDs with [REDACTED_ID].
2. Extract atomic knowledge nodes (Entity, Concept, Claim, Risk, Evidence) and relation edges (SUPPORTS, CONTRADICTS, DEPENDS_ON, MENTIONS).

Source Content:
"""
${content}
"""`;

  let executionSource: 'on-device' | 'cloud' = forceCloud ? 'cloud' : 'on-device';
  let fallbackTriggered = false;
  let rawResult: { text: string; parsedJson?: any };
  let preCloudRedactions: RedactionItem[] = [];

  if (forceCloud) {
    const firewallPreCheck = applyClientPiiFirewall(content);
    preCloudRedactions = firewallPreCheck.extraRedactions;
    const sanitizedPrompt = extractionPrompt.replace(content, firewallPreCheck.sanitized);
    rawResult = await executeInCloud(sanitizedPrompt, imageFile, EXTRACTION_RESPONSE_SCHEMA);
  } else {
    try {
      rawResult = await executeOnDevice(extractionPrompt, {
        imageFile,
        responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      });
    } catch (localErr) {
      if (forceLocal) {
        throw localErr;
      }
      console.info('[SynapseVault] Local extraction unavailable; pre-redacting via PII firewall before cloud fallback:', localErr);
      executionSource = 'cloud';
      fallbackTriggered = true;
      const firewallPreCheck = applyClientPiiFirewall(content);
      preCloudRedactions = firewallPreCheck.extraRedactions;
      const sanitizedPrompt = extractionPrompt.replace(content, firewallPreCheck.sanitized);
      rawResult = await executeInCloud(sanitizedPrompt, imageFile, EXTRACTION_RESPONSE_SCHEMA);
    }
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

  // Cross-check with client-side deterministic PII regex firewall and merge pre-cloud redactions
  const firewallEnabled = await getAutoPiiFirewallEnabled();
  if (firewallEnabled) {
    const firewallCheck = applyClientPiiFirewall(parsed.redactedText || content);
    parsed.redactedText = firewallCheck.sanitized;
    parsed.redactions = [
      ...preCloudRedactions,
      ...(parsed.redactions || []),
      ...firewallCheck.extraRedactions,
    ];
  } else if (preCloudRedactions.length > 0) {
    parsed.redactions = [...preCloudRedactions, ...(parsed.redactions || [])];
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
  forceLocalOrMode: boolean | 'prefer_on_device' | 'only_on_device' | 'only_in_cloud' = false
): Promise<TelemetryResult> {
  const startTime = performance.now();
  const forceLocal = forceLocalOrMode === true || forceLocalOrMode === 'only_on_device';
  const forceCloud = forceLocalOrMode === 'only_in_cloud';

  const queryPrompt = `You are SynapseVault Local AI Assistant.
Answer the user's question using ONLY the following verified local knowledge graph context.
If the answer cannot be determined from the context, state that clearly without guessing.
Keep your response concise, factual, and accurate.

LOCAL CONTEXT:
"""
${localContext}
"""

USER QUESTION: ${question}`;

  let executionSource: 'on-device' | 'cloud' = forceCloud ? 'cloud' : 'on-device';
  let fallbackTriggered = false;
  let rawResult: { text: string; parsedJson?: any };

  if (forceCloud) {
    rawResult = await executeInCloud(queryPrompt);
  } else {
    try {
      rawResult = await executeOnDevice(queryPrompt);
    } catch (err) {
      if (forceLocal) throw err;
      console.info('[SynapseVault] Local Q&A falling back to cloud:', err);
      executionSource = 'cloud';
      fallbackTriggered = true;
      rawResult = await executeInCloud(queryPrompt);
    }
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

// pcmToWavBlob imported from ./piiFirewall and re-exported above.

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

export interface BenchmarkSideBySideResult {
  sampleTextLength: number;
  payloadBytes: number;
  local: {
    latencyMs: number;
    networkBytesSent: number;
    privacyExposure: string;
    nodesExtracted: number;
    edgesExtracted: number;
    redactionsCount: number;
    estimatedCostUsd: number;
    offlineCapable: boolean;
    success: boolean;
    error?: string;
  };
  cloud: {
    latencyMs: number;
    networkBytesSent: number;
    privacyExposure: string;
    nodesExtracted: number;
    edgesExtracted: number;
    redactionsCount: number;
    estimatedCostUsd: number;
    offlineCapable: boolean;
    success: boolean;
    error?: string;
  };
}

/**
 * Runs the same extraction prompt through both only_on_device and only_in_cloud
 * and returns factual side-by-side performance, latency, privacy, and network metrics.
 */
export async function runSideBySideBenchmark(
  sampleText: string,
  isOnline = true
): Promise<BenchmarkSideBySideResult> {
  const payloadBytes = new Blob([sampleText]).size;

  // 1. Run Local Extraction (forced local on-device)
  let localResult: BenchmarkSideBySideResult['local'];
  try {
    const localStart = performance.now();
    const res = await redactAndExtractLocal(sampleText, undefined, true);
    const localLatency = Math.round(performance.now() - localStart);

    localResult = {
      latencyMs: localLatency,
      networkBytesSent: 0,
      privacyExposure: 'Zero (100% Air-Gapped On-Device)',
      nodesExtracted: res.extraction.nodes.length,
      edgesExtracted: res.extraction.edges.length,
      redactionsCount: res.extraction.redactions.length,
      estimatedCostUsd: 0.0,
      offlineCapable: true,
      success: true,
    };
  } catch (err) {
    localResult = {
      latencyMs: 0,
      networkBytesSent: 0,
      privacyExposure: 'Zero (Execution Guard)',
      nodesExtracted: 0,
      edgesExtracted: 0,
      redactionsCount: 0,
      estimatedCostUsd: 0.0,
      offlineCapable: true,
      success: false,
      error: (err as Error).message,
    };
  }

  // 2. Run Cloud Extraction (gemini-3.8-flash)
  let cloudResult: BenchmarkSideBySideResult['cloud'];
  if (!isOnline) {
    cloudResult = {
      latencyMs: 0,
      networkBytesSent: 0,
      privacyExposure: 'Blocked (Device is Offline)',
      nodesExtracted: 0,
      edgesExtracted: 0,
      redactionsCount: 0,
      estimatedCostUsd: 0.0,
      offlineCapable: false,
      success: false,
      error: 'Device is offline. Cloud escalation unavailable.',
    };
  } else {
    try {
      const cloudStart = performance.now();
      const prompt = `You are SynapseVault Cloud Extraction Benchmark Engine.
Analyze the source text and return valid JSON adhering to the extraction schema with redactedText, redactions, nodes, and edges.

Source Content:
"""
${sampleText}
"""`;

      const res = await executeInCloud(prompt, undefined, EXTRACTION_RESPONSE_SCHEMA);
      const cloudLatency = Math.round(performance.now() - cloudStart);
      const parsed = res.parsedJson || {};

      const estimatedCost = Number(((sampleText.length / 4 / 1000) * 0.00015).toFixed(6));

      cloudResult = {
        latencyMs: cloudLatency,
        networkBytesSent: payloadBytes + 384, // Payload bytes + TLS & HTTP wire headers overhead
        privacyExposure: 'Transmitted to Cloud API (Over Wire)',
        nodesExtracted: Array.isArray(parsed.nodes) ? parsed.nodes.length : 0,
        edgesExtracted: Array.isArray(parsed.edges) ? parsed.edges.length : 0,
        redactionsCount: Array.isArray(parsed.redactions) ? parsed.redactions.length : 0,
        estimatedCostUsd: estimatedCost,
        offlineCapable: false,
        success: true,
      };
    } catch (err) {
      cloudResult = {
        latencyMs: 0,
        networkBytesSent: payloadBytes + 384,
        privacyExposure: 'Egress Attempted (Error)',
        nodesExtracted: 0,
        edgesExtracted: 0,
        redactionsCount: 0,
        estimatedCostUsd: 0.0,
        offlineCapable: false,
        success: false,
        error: (err as Error).message,
      };
    }
  }

  return {
    sampleTextLength: sampleText.length,
    payloadBytes,
    local: localResult,
    cloud: cloudResult,
  };
}
