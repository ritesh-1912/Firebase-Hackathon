import React, { useState, useEffect } from 'react';
import {
  auth,
  signInAnonymouslyUser,
  signInWithGoogle,
  signOutUser,
  getDefaultInferenceMode,
} from './lib/firebase';
import {
  runHybridInference,
  runLocalOnlyInference,
  runCloudOnlyInference,
  runInference,
  checkChromePromptAPIAvailability,
  type TelemetryResult,
  type PromptAPIAvailabilityStatus,
} from './services/hybridAI';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Cpu,
  Cloud,
  Zap,
  ShieldCheck,
  User as UserIcon,
  LogIn,
  LogOut,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ArrowRight,
  Code,
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Chrome Prompt API Status
  const [promptApiStatus, setPromptApiStatus] = useState<PromptAPIAvailabilityStatus>('unavailable');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  // Inference State
  const [prompt, setPrompt] = useState('Explain the benefits of Hybrid AI architecture in one sentence.');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mode, setMode] = useState<'hybrid' | 'local' | 'cloud' | 'remote_config'>('hybrid');
  const [remoteConfigMode, setRemoteConfigMode] = useState<string>('prefer_on_device');
  const [structuredOutput, setStructuredOutput] = useState(false);

  // Telemetry & Results
  const [loading, setLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Listen for Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Check Prompt API Availability & Fetch Remote Config Default Mode
  useEffect(() => {
    checkChromePromptAPIAvailability((pct) => setDownloadProgress(pct))
      .then((res) => {
        setPromptApiStatus(res.status);
        if (res.downloadProgressPercentage) {
          setDownloadProgress(res.downloadProgressPercentage);
        }
      })
      .catch(console.error);

    getDefaultInferenceMode().then(setRemoteConfigMode);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleRunInference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setTelemetry(null);

    const schema = structuredOutput
      ? {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            confidenceScore: { type: 'number' },
          },
          required: ['summary', 'tags'],
        }
      : undefined;

    try {
      let result: TelemetryResult;
      if (mode === 'hybrid') {
        result = await runHybridInference(prompt, imageFile || undefined);
      } else if (mode === 'local') {
        result = await runLocalOnlyInference(prompt, schema, imageFile || undefined);
      } else if (mode === 'cloud') {
        result = await runCloudOnlyInference(prompt, imageFile || undefined);
      } else {
        result = await runInference(prompt, {
          imageFile: imageFile || undefined,
          responseSchema: schema,
        });
      }
      setTelemetry(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during inference.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-amber-500 to-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Hybrid AI Service
            </h1>
            <p className="text-xs text-slate-400">#BuildHybridAI 2026 • Firebase AI Logic + Chrome Prompt API</p>
          </div>
        </div>

        {/* Auth status & actions */}
        <div className="flex items-center space-x-3">
          {authLoading ? (
            <div className="text-xs text-slate-500">Checking auth...</div>
          ) : user ? (
            <div className="flex items-center space-x-3 bg-slate-800/80 border border-slate-700/60 rounded-full px-3 py-1.5 text-xs">
              <UserIcon className="w-4 h-4 text-emerald-400" />
              <span className="font-medium text-slate-300">
                {user.isAnonymous ? 'Anonymous User' : user.displayName || user.email}
              </span>
              <button
                onClick={() => signOutUser()}
                className="text-slate-400 hover:text-rose-400 transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => signInAnonymouslyUser()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
              >
                Guest Sign-In
              </button>
              <button
                onClick={() => signInWithGoogle()}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Google Sign-In</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration & Status (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* On-Device Status Card */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>Chrome Prompt API (Gemini Nano)</span>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  promptApiStatus === 'available'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : promptApiStatus === 'downloading'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : promptApiStatus === 'downloadable'
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                {promptApiStatus.toUpperCase()}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Reports status from{' '}
              <code className="text-slate-300 font-mono bg-slate-800 px-1 py-0.5 rounded">
                LanguageModel.availability()
              </code>
              . When available, inferences execute with zero cloud latency and full privacy.
            </p>

            {downloadProgress > 0 && downloadProgress < 100 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Downloading Gemini Nano</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Firebase Infrastructure Card */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
              <Cloud className="w-4 h-4 text-indigo-400" />
              <span>Firebase Core & AI Logic</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  App Check (reCAPTCHA v3)
                </span>
                <span className="text-emerald-400 font-mono">Initialized Before getAI</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Cloud Model</span>
                <span className="text-slate-200 font-mono">gemini-3.8-flash</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Remote Config Default</span>
                <span className="text-amber-400 font-mono">{remoteConfigMode}</span>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400">Firestore Persistence</span>
                <span className="text-emerald-400 font-mono">Multi-Tab Cache Active</span>
              </div>
            </div>
          </div>

          {/* Inference Mode Selection */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Inference Mode Routing
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMode('hybrid')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  mode === 'hybrid'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                }`}
              >
                <span className="font-semibold text-slate-200 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-indigo-400" /> Prefer On-Device
                </span>
                <span className="text-[11px] text-slate-400">Tries local first, falls back to cloud</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('local')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  mode === 'local'
                    ? 'border-emerald-500 bg-emerald-500/10 text-white'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                }`}
              >
                <span className="font-semibold text-slate-200 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" /> Only On-Device
                </span>
                <span className="text-[11px] text-slate-400">Strict local execution with JSON schema</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('cloud')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  mode === 'cloud'
                    ? 'border-sky-500 bg-sky-500/10 text-white'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                }`}
              >
                <span className="font-semibold text-slate-200 flex items-center gap-1">
                  <Cloud className="w-3.5 h-3.5 text-sky-400" /> Only In Cloud
                </span>
                <span className="text-[11px] text-slate-400">gemini-3.8-flash via Firebase AI Logic</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('remote_config')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  mode === 'remote_config'
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                }`}
              >
                <span className="font-semibold text-slate-200 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-amber-400" /> Remote Config
                </span>
                <span className="text-[11px] text-slate-400">Synced dynamically from parameter</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Form & Telemetry Display (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleRunInference}
            className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4"
          >
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
                Prompt Input
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-none"
                placeholder="Enter prompt..."
              />
            </div>

            {/* Multimodal Image Input & Structured Output Options */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center space-x-3">
                <label className="cursor-pointer flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:border-slate-700 text-xs font-medium text-slate-300 transition">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>{imageFile ? imageFile.name.slice(0, 15) + '...' : 'Add Image (JPEG/PNG)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>

                {imageFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Remove
                  </button>
                )}

                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={structuredOutput}
                    onChange={(e) => setStructuredOutput(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                  />
                  <span>Structured Output Schema</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/25 transition disabled:opacity-50"
              >
                {loading ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <span>Run Inference</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {imagePreview && (
              <div className="mt-2">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-36 rounded-lg border border-slate-800 object-contain bg-black/40"
                />
              </div>
            )}
          </form>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start space-x-3 text-rose-300 text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">Execution Error</p>
                <p className="text-xs mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Telemetry & Results Display */}
          {telemetry && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-sm text-slate-200">Execution Telemetry</span>
                </div>

                <div className="flex items-center space-x-2">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                      telemetry.executionSource === 'on-device'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {telemetry.executionSource === 'on-device' ? (
                      <Cpu className="w-3.5 h-3.5" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5" />
                    )}
                    <span>{telemetry.executionSource.toUpperCase()}</span>
                  </span>

                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                    {telemetry.latencyMs} ms
                  </span>

                  {telemetry.fallbackTriggered && (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Fallback Triggered
                    </span>
                  )}
                </div>
              </div>

              {/* Output Content */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Model Output
                </label>
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 font-mono whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                  {telemetry.text}
                </div>
              </div>

              {/* Parsed JSON (if structured output) */}
              {telemetry.parsedJson && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Parsed Structured JSON Object</span>
                  </label>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-400 font-mono overflow-x-auto">
                    {JSON.stringify(telemetry.parsedJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
