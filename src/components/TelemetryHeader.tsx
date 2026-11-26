import React, { useState, useRef, useEffect } from 'react';
import type { PromptAPIAvailabilityStatus, TelemetryResult } from '../services/hybridAI';
import {
  PanelLeft,
  Cpu,
  Zap,
  Cloud,
  BarChart3,
  ChevronDown,
  User as UserIcon,
  LogOut,
  RotateCcw,
  Info,
  Check,
  Database,
} from 'lucide-react';
import type { User } from 'firebase/auth';

export type InferenceModeSetting = 'prefer_on_device' | 'only_on_device' | 'only_in_cloud';
export type StudioView = 'graph' | 'firewall' | 'brief';

interface TelemetryHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  redactionsCount: number;
  hasCloudBriefing: boolean;
  promptApiStatus: PromptAPIAvailabilityStatus;
  downloadProgress: number;
  activeMode: InferenceModeSetting;
  remoteConfigMode: InferenceModeSetting;
  manualOverride: boolean;
  onSetMode: (mode: InferenceModeSetting, isManual: boolean) => void;
  onResetToRemoteConfig: () => void;
  onOpenBenchmark: () => void;
  lastTelemetry: TelemetryResult | null;
  cumulativeSavings: {
    totalLocalRuns: number;
    totalTokensSaved: number;
    totalCostSavedUsd: number;
  };
  isOnline: boolean;
  firestoreSyncState: 'Synced' | 'Offline Cache Active';
  firebaseDiagnostic: string | null;
  user: User | null;
  authLoading: boolean;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
}

export const TelemetryHeader: React.FC<TelemetryHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  activeView,
  onSelectView,
  redactionsCount,
  hasCloudBriefing,
  promptApiStatus,
  downloadProgress,
  activeMode,
  remoteConfigMode,
  manualOverride,
  onSetMode,
  onResetToRemoteConfig,
  onOpenBenchmark,
  lastTelemetry,
  cumulativeSavings,
  isOnline,
  firestoreSyncState,
  firebaseDiagnostic,
  user,
  authLoading,
  onGoogleSignIn,
  onSignOut,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [popoverOpen]);

  // Determine sleek status pill label and indicator color
  const pillInfo = (() => {
    if (lastTelemetry) {
      if (lastTelemetry.executionSource === 'on-device') {
        return {
          dot: 'bg-emerald-400',
          label: `On-Device · ${lastTelemetry.latencyMs}ms`,
        };
      }
      return {
        dot: 'bg-indigo-400',
        label: `Cloud Fallback · ${lastTelemetry.latencyMs}ms`,
      };
    }
    if (promptApiStatus === 'available') {
      return { dot: 'bg-emerald-400', label: 'On-Device Ready' };
    }
    if (promptApiStatus === 'downloading') {
      return { dot: 'bg-amber-400 animate-pulse', label: `Nano ${downloadProgress}%` };
    }
    if (promptApiStatus === 'downloadable') {
      return { dot: 'bg-amber-400', label: 'Nano Downloadable' };
    }
    return { dot: 'bg-indigo-400', label: 'Cloud Fallback' };
  })();

  const hasSubtleNotice = promptApiStatus === 'unavailable' || Boolean(firebaseDiagnostic);

  return (
    <header className="h-[52px] shrink-0 sticky top-0 z-50 bg-[#09090B]/95 backdrop-blur-md border-b border-white/[0.08] px-4 flex items-center justify-between gap-3 select-none">
      {/* 1. Left Group: Sidebar toggle + Wordmark + Compact Network/Sync Dot */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`p-1.5 rounded-lg border transition duration-150 cursor-pointer ${
            sidebarOpen
              ? 'bg-[#18181B] border-white/[0.08] text-[#F4F4F5]'
              : 'bg-transparent border-transparent text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181B]'
          }`}
          title={sidebarOpen ? 'Hide Source Vault' : 'Show Source Vault'}
          aria-label="Toggle Source Vault Sidebar"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#18181B] border border-white/[0.1] flex items-center justify-center text-indigo-400">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-[14px] tracking-tight text-[#F4F4F5]">
            SynapseVault
          </span>
        </div>

        <div className="h-3.5 w-px bg-white/[0.08] hidden sm:block" />

        <div
          className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[#A1A1AA] px-2 py-0.5 rounded-full bg-[#111114] border border-white/[0.06]"
          title={`Network: ${isOnline ? 'Online' : 'Offline'} · Firestore: ${firestoreSyncState}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span>{isOnline ? 'Online' : 'Offline Local'}</span>
        </div>
      </div>

      {/* 2. Center Group: Clean Segmented View Switcher */}
      <nav
        aria-label="Workspace View"
        className="flex items-center bg-[#111114] p-0.5 rounded-lg border border-white/[0.08] text-xs"
      >
        <button
          type="button"
          onClick={() => onSelectView('graph')}
          className={`px-3 py-1 rounded-md font-medium transition duration-150 cursor-pointer ${
            activeView === 'graph'
              ? 'bg-[#18181B] text-[#F4F4F5] border border-white/[0.08]'
              : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
          }`}
        >
          Graph
        </button>

        <button
          type="button"
          onClick={() => onSelectView('firewall')}
          className={`px-3 py-1 rounded-md font-medium transition duration-150 cursor-pointer flex items-center gap-1.5 ${
            activeView === 'firewall'
              ? 'bg-[#18181B] text-[#F4F4F5] border border-white/[0.08]'
              : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
          }`}
        >
          <span>Privacy Firewall</span>
          {redactionsCount > 0 && (
            <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400">
              {redactionsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectView('brief')}
          className={`px-3 py-1 rounded-md font-medium transition duration-150 cursor-pointer flex items-center gap-1.5 ${
            activeView === 'brief'
              ? 'bg-[#18181B] text-[#F4F4F5] border border-white/[0.08]'
              : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
          }`}
        >
          <span>Cloud Brief</span>
          {hasCloudBriefing && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" title="Synthesis ready" />
          )}
        </button>
      </nav>

      {/* 3. Right Group: Hybrid Status Pill + Benchmark + Auth */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Hybrid Status Pill & Telemetry Popover */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setPopoverOpen((prev) => !prev)}
            className="h-8 px-2.5 rounded-lg bg-[#111114] hover:bg-[#18181B] border border-white/[0.08] flex items-center gap-2 text-xs text-[#F4F4F5] transition duration-150 cursor-pointer"
            title="Inspect Hybrid Routing, On-Device Status & Savings"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${pillInfo.dot}`} />
            <span className="font-mono tabular-nums text-[11px] font-medium hidden md:inline">
              {pillInfo.label}
            </span>
            {hasSubtleNotice && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber-400"
                title="Environment / browser fallback note inside"
              />
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#A1A1AA] transition duration-150 ${
                popoverOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Telemetry & Routing Dropdown Popover */}
          {popoverOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[#18181B] border border-white/[0.08] rounded-xl p-4 shadow-2xl z-50 space-y-4 text-xs">
              {/* Routing Mode Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                    Routing Mode
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#A1A1AA]">
                    <span>{manualOverride ? 'Manual' : `Remote (${remoteConfigMode})`}</span>
                    {manualOverride && (
                      <button
                        type="button"
                        onClick={onResetToRemoteConfig}
                        className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 cursor-pointer"
                        title="Reset to Firebase Remote Config default"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1 bg-[#111114] p-1 rounded-lg border border-white/[0.06]">
                  {(
                    [
                      {
                        id: 'prefer_on_device',
                        label: 'Auto Hybrid',
                        desc: 'Prefer Gemini Nano, cloud fallback',
                        icon: Zap,
                      },
                      {
                        id: 'only_on_device',
                        label: 'Strict Local',
                        desc: '100% on-device (air-gapped test)',
                        icon: Cpu,
                      },
                      {
                        id: 'only_in_cloud',
                        label: 'Cloud Compare',
                        desc: 'Force Gemini 3.8 Flash',
                        icon: Cloud,
                      },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = activeMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetMode(opt.id, true)}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-md text-left transition duration-150 cursor-pointer ${
                          active
                            ? 'bg-[#18181B] text-[#F4F4F5] border border-white/[0.08]'
                            : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <div>
                            <div className="font-medium text-xs leading-tight">{opt.label}</div>
                            <div className="text-[10px] text-[#A1A1AA]">{opt.desc}</div>
                          </div>
                        </div>
                        {active && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* On-Device Model & Browser Status */}
              <div className="pt-3 border-t border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#A1A1AA]">Gemini Nano</span>
                  <span className="font-mono tabular-nums text-[#F4F4F5]">
                    {promptApiStatus === 'available' && 'Ready'}
                    {promptApiStatus === 'downloading' && `Downloading ${downloadProgress}%`}
                    {promptApiStatus === 'downloadable' && 'Downloadable'}
                    {promptApiStatus === 'unavailable' && 'Unavailable'}
                  </span>
                </div>

                {promptApiStatus === 'downloading' && (
                  <div className="w-full h-1 bg-[#111114] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-150"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#A1A1AA] flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    <span>Firestore Cache</span>
                  </span>
                  <span className="font-mono text-[#F4F4F5]">{firestoreSyncState}</span>
                </div>

                {promptApiStatus === 'unavailable' && (
                  <div className="p-2.5 rounded-lg bg-[#111114] border border-white/[0.06] flex items-start gap-2 text-[11px] text-[#A1A1AA] leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      On-device Prompt API not active in this browser. Using cloud fallback cleanly.
                      Enable <code className="font-mono text-[#F4F4F5]">#prompt-api-for-gemini-nano</code> in Chrome 139+ for local inference.
                    </span>
                  </div>
                )}

                {firebaseDiagnostic && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-[11px] text-amber-200 leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{firebaseDiagnostic}</span>
                  </div>
                )}
              </div>

              {/* Cumulative Local Savings */}
              <div className="pt-3 border-t border-white/[0.08] grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#111114] border border-white/[0.06] rounded-lg p-2">
                  <div className="font-mono tabular-nums font-semibold text-xs text-[#F4F4F5]">
                    {cumulativeSavings.totalLocalRuns}
                  </div>
                  <div className="text-[10px] text-[#A1A1AA]">Local Runs</div>
                </div>
                <div className="bg-[#111114] border border-white/[0.06] rounded-lg p-2">
                  <div className="font-mono tabular-nums font-semibold text-xs text-[#F4F4F5]">
                    {cumulativeSavings.totalTokensSaved}
                  </div>
                  <div className="text-[10px] text-[#A1A1AA]">Tokens Saved</div>
                </div>
                <div className="bg-[#111114] border border-white/[0.06] rounded-lg p-2">
                  <div className="font-mono tabular-nums font-semibold text-xs text-emerald-400">
                    ${cumulativeSavings.totalCostSavedUsd.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-[#A1A1AA]">Est. Saved</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Compact Benchmark Button */}
        <button
          type="button"
          onClick={onOpenBenchmark}
          className="h-8 px-2.5 rounded-lg bg-[#111114] hover:bg-[#18181B] border border-white/[0.08] text-xs font-medium text-[#F4F4F5] flex items-center gap-1.5 transition duration-150 cursor-pointer"
          title="Compare Local vs. Cloud Performance"
        >
          <BarChart3 className="w-3.5 h-3.5 text-[#A1A1AA]" />
          <span className="hidden lg:inline">Benchmark</span>
        </button>

        {/* Compact Auth / Profile Control */}
        {authLoading ? (
          <div className="h-8 px-2.5 rounded-lg bg-[#111114] border border-white/[0.08] flex items-center text-[11px] text-[#A1A1AA]">
            ...
          </div>
        ) : user ? (
          <div className="h-8 px-2.5 rounded-lg bg-[#111114] border border-white/[0.08] flex items-center gap-2 text-xs">
            <UserIcon className="w-3.5 h-3.5 text-[#A1A1AA]" />
            <span className="text-[11px] font-medium text-[#F4F4F5] max-w-[84px] truncate hidden sm:inline">
              {user.isAnonymous ? 'Judge' : user.displayName || user.email}
            </span>
            {user.isAnonymous && (
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                title="Upgrade to Google Sign-In"
              >
                Sign in
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="text-[#A1A1AA] hover:text-rose-400 transition duration-150 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onGoogleSignIn}
            className="h-8 px-3 rounded-lg bg-[#F4F4F5] hover:bg-white text-[#09090B] text-xs font-medium transition duration-150 cursor-pointer"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
};
