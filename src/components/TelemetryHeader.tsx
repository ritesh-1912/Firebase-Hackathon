import React from 'react';
import type { PromptAPIAvailabilityStatus, TelemetryResult } from '../services/hybridAI';
import {
  Cpu,
  Zap,
  Radio,
  Wifi,
  WifiOff,
  User as UserIcon,
  LogOut,
  Shield,
  Layers,
} from 'lucide-react';
import type { User } from 'firebase/auth';

export type InferenceModeSetting = 'prefer_on_device' | 'only_on_device' | 'only_in_cloud';

interface TelemetryHeaderProps {
  promptApiStatus: PromptAPIAvailabilityStatus;
  downloadProgress: number;
  activeMode: InferenceModeSetting;
  remoteConfigMode: InferenceModeSetting;
  manualOverride: boolean;
  onSetMode: (mode: InferenceModeSetting, isManual: boolean) => void;
  onResetToRemoteConfig: () => void;
  lastTelemetry: TelemetryResult | null;
  isOnline: boolean;
  user: User | null;
  authLoading: boolean;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
}

export const TelemetryHeader: React.FC<TelemetryHeaderProps> = ({
  promptApiStatus,
  downloadProgress,
  activeMode,
  remoteConfigMode,
  manualOverride,
  onSetMode,
  onResetToRemoteConfig,
  lastTelemetry,
  isOnline,
  user,
  authLoading,
  onGoogleSignIn,
  onSignOut,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-md">
      {/* Top Bar: Brand, Network, and Auth */}
      <div className="px-6 py-2.5 flex items-center justify-between border-b border-slate-800/60 text-xs">
        {/* Brand & Project Tag */}
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-amber-500 via-indigo-500 to-purple-600 p-1.5 rounded-lg text-white shadow-sm">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-tight text-white">HybridAudit AI</span>
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium px-2 py-0.5 rounded-full text-[10px]">
                #BuildHybridAI 2026
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Offline-First Document & Field Inspection Intelligence</p>
          </div>
        </div>

        {/* Network & Auth Controls */}
        <div className="flex items-center space-x-3">
          {/* Offline / Online Network Indicator */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Network Online' : 'Offline (Local Cache Active)'}</span>
          </div>

          {/* Judge Authentication Badge */}
          {authLoading ? (
            <span className="text-slate-500 text-xs">Authenticating...</span>
          ) : user ? (
            <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700/80 rounded-full px-3 py-1">
              <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-300 font-medium max-w-[130px] truncate">
                {user.isAnonymous ? 'Judge (Anonymous)' : user.displayName || user.email}
              </span>
              {user.isAnonymous && (
                <button
                  onClick={onGoogleSignIn}
                  className="ml-1 text-[10px] text-indigo-400 hover:text-indigo-300 underline font-semibold"
                  title="Upgrade to full Google Account"
                >
                  Upgrade
                </button>
              )}
              <button
                onClick={onSignOut}
                className="text-slate-400 hover:text-rose-400 transition ml-1"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onGoogleSignIn}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg text-xs font-medium transition"
            >
              Sign In with Google
            </button>
          )}
        </div>
      </div>

      {/* Persistent Hybrid Telemetry Bar */}
      <div className="px-6 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-slate-950/70 text-xs">
        {/* Metric 1: Real-time On-Device Model Status (3 cols) */}
        <div className="md:col-span-3 flex items-center space-x-2.5">
          <div className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-emerald-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              On-Device Model Status
            </div>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  promptApiStatus === 'available'
                    ? 'bg-emerald-400 animate-pulse'
                    : promptApiStatus === 'downloading'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-rose-400'
                }`}
              />
              <span className="font-semibold text-slate-200">
                {promptApiStatus === 'available' && 'Available (Gemini Nano)'}
                {promptApiStatus === 'downloading' && `Downloading (${downloadProgress}%)`}
                {promptApiStatus === 'downloadable' && 'Downloadable via Prompt API'}
                {promptApiStatus === 'unavailable' && 'Unavailable - Cloud Fallback Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Active Inference Mode & Controller (3 cols) */}
        <div className="md:col-span-3 flex items-center space-x-2.5 border-l border-slate-800/80 pl-3">
          <div className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider flex items-center gap-1">
              <span>Active Mode:</span>
              <span className="font-mono text-indigo-300 font-bold">{activeMode}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                  manualOverride
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {manualOverride ? 'Manual Override' : `Remote Config (${remoteConfigMode})`}
              </span>
              {manualOverride && (
                <button
                  onClick={onResetToRemoteConfig}
                  className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                  title="Reset to Remote Config default parameter"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Metric 3: Live Metrics from Most Recent Request (3 cols) */}
        <div className="md:col-span-3 flex items-center space-x-2.5 border-l border-slate-800/80 pl-3">
          <div className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-amber-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Last Request Telemetry
            </div>
            {lastTelemetry ? (
              <div className="flex items-center space-x-2 mt-0.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    lastTelemetry.executionSource === 'on-device'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  }`}
                >
                  {lastTelemetry.executionSource}
                </span>
                <span className="font-mono text-slate-300 font-medium">
                  {lastTelemetry.latencyMs} ms
                </span>
                {lastTelemetry.fallbackTriggered ? (
                  <span className="text-[10px] text-amber-400 bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/30">
                    Fallback
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/20 px-1 py-0.2 rounded border border-emerald-500/30">
                    Direct
                  </span>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-[11px] mt-0.5">No requests run yet</div>
            )}
          </div>
        </div>

        {/* Mode Override Controls for Evaluators (3 cols) */}
        <div className="md:col-span-3 flex flex-col items-end border-l border-slate-800/80 pl-3">
          <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3 text-slate-400" />
            <span>Evaluator Override</span>
          </div>
          <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              onClick={() => onSetMode('only_on_device', true)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${
                activeMode === 'only_on_device' && manualOverride
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Force Only On-Device (Verify offline/local execution)"
            >
              Force Local
            </button>
            <button
              onClick={() => onSetMode('prefer_on_device', true)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${
                activeMode === 'prefer_on_device' && manualOverride
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Prefer On-Device (Hybrid with cloud fallback)"
            >
              Hybrid
            </button>
            <button
              onClick={() => onSetMode('only_in_cloud', true)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${
                activeMode === 'only_in_cloud' && manualOverride
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Force Only In Cloud (Compare latency and gemini-3.8-flash deep reasoning)"
            >
              Force Cloud
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
