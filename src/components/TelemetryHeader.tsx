import React, { useState, useRef, useEffect } from 'react';
import type { PromptAPIAvailabilityStatus, TelemetryResult } from '../services/hybridAI';
import { PanelLeft, ChevronDown } from 'lucide-react';
import type { User } from 'firebase/auth';

export type InferenceModeSetting = 'prefer_on_device' | 'only_on_device' | 'only_in_cloud';
export type StudioView = 'canvas' | 'redactions' | 'briefing';

interface TelemetryHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  redactionsCount: number;
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
  const [engineOpen, setEngineOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const engineRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (engineRef.current && !engineRef.current.contains(e.target as Node)) {
        setEngineOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEngineOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Concise engine dot & label
  const engineIndicator = (() => {
    if (lastTelemetry) {
      if (lastTelemetry.executionSource === 'on-device') {
        return {
          dotColor: '#166534',
          label: `Local · ${lastTelemetry.latencyMs}ms`,
        };
      }
      return {
        dotColor: '#1D4ED8',
        label: `Cloud · ${lastTelemetry.latencyMs}ms`,
      };
    }
    if (activeMode === 'only_in_cloud') {
      return { dotColor: '#1D4ED8', label: 'Cloud' };
    }
    if (promptApiStatus === 'available') {
      return { dotColor: '#166534', label: 'Local' };
    }
    return { dotColor: '#1D4ED8', label: 'Cloud' };
  })();

  const userInitial = user
    ? user.isAnonymous
      ? 'J'
      : (user.displayName || user.email || 'U').charAt(0).toUpperCase()
    : '';

  return (
    <header className="h-12 shrink-0 sticky top-0 z-50 bg-[#FFFFFF] border-b border-[#E6E6E2] px-4 flex items-center justify-between gap-4 select-none">
      {/* Left: Sidebar toggle + Newsreader wordmark */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-[#63635E] hover:text-[#141413] hover:bg-[#F3F3EF] transition duration-150 cursor-pointer"
          title={sidebarOpen ? 'Hide sources sidebar' : 'Show sources sidebar'}
          aria-label="Toggle sources sidebar"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <span className="font-serif font-medium text-[17px] tracking-tight text-[#141413]">
          SynapseVault
        </span>
      </div>

      {/* Center: Simple underline navigation tabs */}
      <nav aria-label="Workspace sections" className="h-full flex items-stretch gap-6 text-[13px]">
        {(
          [
            { id: 'canvas', label: 'Canvas' },
            {
              id: 'redactions',
              label: redactionsCount > 0 ? `Redactions (${redactionsCount})` : 'Redactions',
            },
            { id: 'briefing', label: 'Briefing' },
          ] as const
        ).map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectView(tab.id)}
              className={`h-full px-1 inline-flex items-center font-medium border-b-2 transition duration-150 cursor-pointer ${
                isActive
                  ? 'border-[#141413] text-[#141413]'
                  : 'border-transparent text-[#63635E] hover:text-[#141413]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Right: Understated engine trigger + simple account button */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Engine Status Trigger & Popover */}
        <div className="relative" ref={engineRef}>
          <button
            type="button"
            onClick={() => setEngineOpen((prev) => !prev)}
            className="h-8 px-2.5 rounded-md border border-[#E6E6E2] hover:border-[#CFCFC9] bg-[#FFFFFF] flex items-center gap-2 text-[13px] text-[#141413] transition duration-150 cursor-pointer"
            title="Inference routing and diagnostics"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: engineIndicator.dotColor }}
            />
            <span className="font-mono tabular-nums text-[12px] text-[#141413]">
              {engineIndicator.label}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#94948E]" />
          </button>

          {engineOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[#FFFFFF] border border-[#E6E6E2] rounded-lg shadow-lg p-4 z-50 space-y-4 text-[13px] text-[#141413]">
              {/* Routing Mode Radio Options */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[#141413]">Routing Mode</span>
                  {manualOverride ? (
                    <button
                      type="button"
                      onClick={onResetToRemoteConfig}
                      className="text-[12px] text-[#63635E] hover:text-[#141413] underline cursor-pointer"
                    >
                      Reset ({remoteConfigMode})
                    </button>
                  ) : (
                    <span className="text-[12px] text-[#94948E]">Remote Config</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {(
                    [
                      {
                        id: 'prefer_on_device',
                        label: 'Auto Hybrid',
                        desc: 'Prefer Gemini Nano, cloud fallback',
                      },
                      {
                        id: 'only_on_device',
                        label: 'Strict Local',
                        desc: 'On-device only',
                      },
                      {
                        id: 'only_in_cloud',
                        label: 'Cloud Only',
                        desc: 'Gemini 3.8 Flash',
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-start gap-2.5 py-1 cursor-pointer group"
                    >
                      <input
                        type="radio"
                        name="routing-mode"
                        checked={activeMode === opt.id}
                        onChange={() => onSetMode(opt.id, true)}
                        className="mt-0.5 accent-[#141413] cursor-pointer"
                      />
                      <div className="leading-tight">
                        <div className="text-[13px] font-medium text-[#141413]">{opt.label}</div>
                        <div className="text-[12px] text-[#63635E]">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#E6E6E2] pt-3 space-y-1.5 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#63635E]">Gemini Nano</span>
                  <span className="font-mono tabular-nums text-[#141413]">
                    {promptApiStatus === 'available' && 'Ready'}
                    {promptApiStatus === 'downloading' && `Downloading ${downloadProgress}%`}
                    {promptApiStatus === 'downloadable' && 'Downloadable'}
                    {promptApiStatus === 'unavailable' && 'Unavailable'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#63635E]">Connection</span>
                  <span className="font-mono text-[#141413]">
                    {isOnline ? 'Online' : 'Offline'} · {firestoreSyncState}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#63635E]">Local Runs / Saved</span>
                  <span className="font-mono tabular-nums text-[#141413]">
                    {cumulativeSavings.totalLocalRuns} · ${cumulativeSavings.totalCostSavedUsd.toFixed(4)}
                  </span>
                </div>
              </div>

              {promptApiStatus === 'unavailable' && (
                <p className="text-[12px] text-[#63635E] leading-relaxed border-t border-[#E6E6E2] pt-3">
                  Chrome Prompt API is inactive in this browser; requests fall back to cloud
                  inference. Enable{' '}
                  <code className="font-mono text-[11px] text-[#141413]">
                    #prompt-api-for-gemini-nano
                  </code>{' '}
                  in Chrome 139+ for local execution.
                </p>
              )}

              {firebaseDiagnostic && (
                <p className="text-[12px] text-[#B91C1C] leading-relaxed border-t border-[#E6E6E2] pt-3">
                  {firebaseDiagnostic}
                </p>
              )}

              <div className="border-t border-[#E6E6E2] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setEngineOpen(false);
                    onOpenBenchmark();
                  }}
                  className="w-full py-1.5 px-3 rounded-md border border-[#E6E6E2] hover:border-[#CFCFC9] bg-[#FFFFFF] text-[12px] font-medium text-[#141413] text-center transition duration-150 cursor-pointer"
                >
                  Run local vs. cloud benchmark
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Account Control */}
        <div className="relative" ref={accountRef}>
          {authLoading ? (
            <span className="text-[12px] text-[#94948E]">...</span>
          ) : user ? (
            <>
              <button
                type="button"
                onClick={() => setAccountOpen((prev) => !prev)}
                className="w-7 h-7 rounded-full border border-[#E6E6E2] hover:border-[#CFCFC9] bg-[#F3F3EF] text-[12px] font-medium text-[#141413] flex items-center justify-center transition duration-150 cursor-pointer"
                title={user.isAnonymous ? 'Judge session (Anonymous)' : user.displayName || user.email || 'Account'}
              >
                {userInitial}
              </button>

              {accountOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#FFFFFF] border border-[#E6E6E2] rounded-lg shadow-lg p-3 z-50 space-y-2.5 text-[12px]">
                  <div className="border-b border-[#E6E6E2] pb-2">
                    <div className="font-medium text-[#141413] truncate">
                      {user.isAnonymous ? 'Guest Judge' : user.displayName || 'Signed in'}
                    </div>
                    {user.email && (
                      <div className="text-[#63635E] truncate">{user.email}</div>
                    )}
                  </div>

                  {user.isAnonymous && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onGoogleSignIn();
                      }}
                      className="w-full text-left py-1 text-[#141413] hover:underline cursor-pointer"
                    >
                      Sign in with Google
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onSignOut();
                    }}
                    className="w-full text-left py-1 text-[#63635E] hover:text-[#B91C1C] cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="text-[13px] font-medium text-[#141413] hover:text-[#63635E] transition duration-150 cursor-pointer"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
