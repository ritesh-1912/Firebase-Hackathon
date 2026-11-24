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
  Database,
  Cloud,
  Sparkles,
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
  cumulativeSavings: {
    totalLocalRuns: number;
    totalTokensSaved: number;
    totalCostSavedUsd: number;
  };
  isOnline: boolean;
  firestoreSyncState: 'Synced' | 'Offline Cache Active';
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
  cumulativeSavings,
  isOnline,
  firestoreSyncState,
  user,
  authLoading,
  onGoogleSignIn,
  onSignOut,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-lg select-none">
      {/* 3-Section Persistent HUD Grid */}
      <div className="px-5 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Left Section: Brand Identity + Network Status + Firestore Sync State (4 cols) */}
        <div className="md:col-span-4 flex items-center space-x-3">
          <div className="flex items-center space-x-2.5">
            <div className="bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 p-1.5 rounded-lg text-white shadow-sm shadow-indigo-500/20">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm tracking-tight text-white">SynapseVault</span>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold px-2 py-0.5 rounded-full text-[10px]">
                  #BuildHybridAI
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Local-First Multimodal Research OS</p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          {/* Network & Firestore Status Pills */}
          <div className="flex items-center space-x-1.5">
            <span
              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </span>

            <span
              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                firestoreSyncState === 'Synced'
                  ? 'bg-slate-900 text-slate-300 border-slate-700'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
              title="Firestore multi-tab offline persistence state"
            >
              <Database className="w-3 h-3 text-cyan-400" />
              <span>{firestoreSyncState}</span>
            </span>
          </div>
        </div>

        {/* Center Section: On-Device Model Indicator + Interactive Routing Segmented Control (4 cols) */}
        <div className="md:col-span-4 flex flex-col items-center justify-center space-y-1">
          {/* On-Device Model Live Status */}
          <div className="flex items-center space-x-2 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                promptApiStatus === 'available'
                  ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50'
                  : promptApiStatus === 'downloading'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-400'
              }`}
            />
            <span className="font-semibold text-slate-200">
              {promptApiStatus === 'available' && 'Gemini Nano 4 Ready (On-Device)'}
              {promptApiStatus === 'downloading' && `Gemini Nano Downloading (${downloadProgress}%)`}
              {promptApiStatus === 'downloadable' && 'Gemini Nano Downloadable'}
              {promptApiStatus === 'unavailable' && 'Cloud Fallback Active'}
            </span>
            <span className="text-slate-600 font-mono">•</span>
            <span className="text-[10px] text-slate-400">
              {manualOverride ? 'Manual' : `Remote (${remoteConfigMode})`}
            </span>
            {manualOverride && (
              <button
                onClick={onResetToRemoteConfig}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                title="Reset routing to Remote Config default parameter"
              >
                Reset
              </button>
            )}
          </div>

          {/* Interactive Routing Mode Segmented Control */}
          <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[11px]">
            <button
              onClick={() => onSetMode('prefer_on_device', true)}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer flex items-center space-x-1 ${
                activeMode === 'prefer_on_device'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Auto Hybrid: Prefer On-Device Nano, fallback to Cloud"
            >
              <Zap className="w-3 h-3 text-cyan-300" />
              <span>Auto Hybrid</span>
            </button>
            <button
              onClick={() => onSetMode('only_on_device', true)}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer flex items-center space-x-1 ${
                activeMode === 'only_on_device'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Strict Local: Force 100% on-device execution (Offline testing)"
            >
              <Cpu className="w-3 h-3 text-emerald-300" />
              <span>Strict Local</span>
            </button>
            <button
              onClick={() => onSetMode('only_in_cloud', true)}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer flex items-center space-x-1 ${
                activeMode === 'only_in_cloud'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Cloud Compare: Force gemini-3.8-flash for latency comparison"
            >
              <Cloud className="w-3 h-3 text-purple-300" />
              <span>Cloud Compare</span>
            </button>
          </div>
        </div>

        {/* Right Section: Live Metrics Strip + Local Privacy & Cost Savings + Judge Auth (4 cols) */}
        <div className="md:col-span-4 flex items-center justify-end space-x-3 text-xs">
          {/* Live Metrics Strip */}
          <div className="hidden lg:flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-lg">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <div className="text-[11px] flex items-center space-x-1.5">
              <span
                className={`font-bold px-1.5 py-0.2 rounded text-[10px] uppercase ${
                  lastTelemetry?.executionSource === 'on-device'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                }`}
              >
                {lastTelemetry?.executionSource || 'IDLE'}
              </span>
              <span className="font-mono text-slate-300 font-semibold">
                {lastTelemetry ? `${lastTelemetry.latencyMs}ms` : '--'}
              </span>
            </div>

            <div className="h-4 w-px bg-slate-800" />

            {/* Cumulative Privacy & Cost Savings */}
            <div
              className="text-[10px] text-cyan-300 font-mono font-medium flex items-center space-x-1"
              title={`Total on-device runs: ${cumulativeSavings.totalLocalRuns}. Estimated tokens saved: ${cumulativeSavings.totalTokensSaved}`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{cumulativeSavings.totalLocalRuns} local</span>
              <span className="text-emerald-400 font-bold">
                (+${cumulativeSavings.totalCostSavedUsd.toFixed(4)})
              </span>
            </div>
          </div>

          {/* Judge Authentication Pill */}
          {authLoading ? (
            <span className="text-slate-500 text-[11px]">Loading...</span>
          ) : user ? (
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-full px-2.5 py-1 text-xs">
              <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-300 text-[11px] font-medium max-w-[100px] truncate">
                {user.isAnonymous ? 'Judge' : user.displayName || user.email}
              </span>
              {user.isAnonymous && (
                <button
                  onClick={onGoogleSignIn}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-semibold"
                  title="Upgrade to full Google Account"
                >
                  Upgrade
                </button>
              )}
              <button
                onClick={onSignOut}
                className="text-slate-400 hover:text-rose-400 transition"
                title="Sign Out"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={onGoogleSignIn}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg text-xs font-medium transition"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
