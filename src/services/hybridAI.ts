import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, getDefaultInferenceMode } from '../lib/firebase';

// 1. Initialize Firebase AI Logic using GoogleAIBackend strictly after App Check
export const ai = getAI(app, {
  backend: new GoogleAIBackend(),
});

// Telemetry Result matching the required schema
export interface TelemetryResult {
  text: string;
  parsedJson?: any;
  executionSource: 'on-device' | 'cloud';
  latencyMs: number;
  fallbackTriggered: boolean;
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

// Global download progress tracker for active model downloads
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

    // Map Chrome Prompt API status strings to required standard
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
 * Executes inference on-device using Chrome Prompt API (Gemini Nano)
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
    throw new Error('Chrome Prompt API (LanguageModel) is not supported in this browser.');
  }

  const availabilityResult = await checkChromePromptAPIAvailability();
  if (availabilityResult.status === 'unavailable') {
    throw new Error('Chrome Prompt API is currently unavailable on this device.');
  }

  if (typeof languageModelAPI.create !== 'function') {
    throw new Error('Chrome Prompt API create method is not supported in this browser.');
  }

  // Create session with download monitor if supported
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
    fullPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON conforming to the following JSON schema:\n${schemaString}\nDo not include code blocks or markdown wrappers.`;
  }

  let rawOutput = '';

  // Single-turn image or text input
  if (options?.imageFile) {
    if (typeof (createImageBitmap) !== 'undefined') {
      try {
        const imageBitmap = await createImageBitmap(options.imageFile);
        // Check if multimodal Prompt API supports array input
        rawOutput = await session.prompt([
          { type: 'text', value: fullPrompt },
          { type: 'image', value: imageBitmap },
        ]);
      } catch {
        // If image input not supported on local model, throw so hybrid mode falls back cleanly
        throw new Error('Multimodal image input is not supported by this on-device model.');
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
 * Executes cloud inference via Firebase AI Logic using gemini-3.8-flash
 */
async function executeInCloud(
  prompt: string,
  imageFile?: File,
  responseSchema?: any
): Promise<{ text: string; parsedJson?: any }> {
  // Use gemini-3.8-flash
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

/**
 * 1. runHybridInference(prompt, imageFile?)
 * Uses mode: "prefer_on_device" with fallback to gemini-3.8-flash.
 */
export async function runHybridInference(prompt: string, imageFile?: File): Promise<TelemetryResult> {
  const startTime = performance.now();

  try {
    // Attempt on-device first
    const localResult = await executeOnDevice(prompt, { imageFile });
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      text: localResult.text,
      parsedJson: localResult.parsedJson,
      executionSource: 'on-device',
      latencyMs,
      fallbackTriggered: false,
    };
  } catch (localError) {
    console.info('[Hybrid AI] On-device execution unavailable or failed; falling back to cloud gemini-3.8-flash:', localError);

    // Fallback to cloud Gemini 3.8 Flash
    const cloudResult = await executeInCloud(prompt, imageFile);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      text: cloudResult.text,
      parsedJson: cloudResult.parsedJson,
      executionSource: 'cloud',
      latencyMs,
      fallbackTriggered: true,
    };
  }
}

/**
 * 2. runLocalOnlyInference(prompt, responseSchema?)
 * Uses mode: "only_on_device" supporting structured JSON/enum output and single-turn text/image (JPEG/PNG) inputs.
 * Strictly avoids falling back to the cloud.
 */
export async function runLocalOnlyInference(
  prompt: string,
  responseSchema?: any,
  imageFile?: File
): Promise<TelemetryResult> {
  const startTime = performance.now();

  const localResult = await executeOnDevice(prompt, {
    imageFile,
    responseSchema,
  });

  const latencyMs = Math.round(performance.now() - startTime);

  return {
    text: localResult.text,
    parsedJson: localResult.parsedJson,
    executionSource: 'on-device',
    latencyMs,
    fallbackTriggered: false,
  };
}

/**
 * 3. runCloudOnlyInference(prompt)
 * Uses mode: "only_in_cloud" with gemini-3.8-flash.
 */
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
  };
}

/**
 * Universal dispatcher that binds default routing behavior to
 * Firebase Remote Config parameter `default_inference_mode`.
 */
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
