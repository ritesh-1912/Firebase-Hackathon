import { useState, useEffect } from 'react';
import {
  auth,
  signInAnonymouslyUser,
  signInWithGoogle,
  signOutUser,
  getDefaultInferenceMode,
} from './lib/firebase';
import {
  checkChromePromptAPIAvailability,
  type TelemetryResult,
  type PromptAPIAvailabilityStatus,
} from './services/hybridAI';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { TelemetryHeader, type InferenceModeSetting } from './components/TelemetryHeader';
import { SynapseWorkspace } from './components/SynapseWorkspace';
import { WorkspacesHistory } from './components/WorkspacesHistory';
import {
  subscribeToWorkspaces,
  type WorkspaceRecord,
} from './services/workspaceStore';

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Network state (navigator.onLine)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Chrome Prompt API State
  const [promptApiStatus, setPromptApiStatus] = useState<PromptAPIAvailabilityStatus>('unavailable');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  // Inference Mode Configuration (Remote Config vs Evaluator Manual Override)
  const [remoteConfigMode, setRemoteConfigMode] = useState<InferenceModeSetting>('prefer_on_device');
  const [activeMode, setActiveMode] = useState<InferenceModeSetting>('prefer_on_device');
  const [manualOverride, setManualOverride] = useState<boolean>(false);

  // Live Telemetry from the most recent request
  const [lastTelemetry, setLastTelemetry] = useState<TelemetryResult | null>(null);

  // Persistent Firestore Workspaces
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceRecord | null>(null);

  // 1. Auto-authenticate judges via Anonymous Auth on first load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthLoading(false);
      } else {
        try {
          setAuthLoading(true);
          const cred = await signInAnonymouslyUser();
          setUser(cred.user);
        } catch (err) {
          console.warn('[Auth] Anonymous auto-auth error:', err);
        } finally {
          setAuthLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Network connectivity listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 3. Check Chrome Prompt API availability & fetch Remote Config parameter
  useEffect(() => {
    checkChromePromptAPIAvailability((pct) => setDownloadProgress(pct))
      .then((res) => {
        setPromptApiStatus(res.status);
        if (res.downloadProgressPercentage) {
          setDownloadProgress(res.downloadProgressPercentage);
        }
      })
      .catch((err) => {
        console.warn('[App] Prompt API availability check warning:', err);
      });

    getDefaultInferenceMode().then((mode) => {
      setRemoteConfigMode(mode);
      if (!manualOverride) {
        setActiveMode(mode);
      }
    });
  }, [manualOverride]);

  // 4. Real-time Firestore workspaces listener with offline persistence
  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      return;
    }

    const unsubscribe = subscribeToWorkspaces(
      user.uid,
      (list) => {
        setWorkspaces(list);
        if (list.length > 0 && !currentWorkspace) {
          setCurrentWorkspace(list[0]);
        }
      },
      (err) => {
        console.warn('[App] Realtime workspaces subscription warning:', err);
      }
    );

    return () => unsubscribe();
  }, [user, currentWorkspace]);

  // Mode override handlers
  const handleSetMode = (mode: InferenceModeSetting, isManual: boolean) => {
    setActiveMode(mode);
    setManualOverride(isManual);
  };

  const handleResetToRemoteConfig = () => {
    setManualOverride(false);
    setActiveMode(remoteConfigMode);
  };

  const handleRecordTelemetry = (telemetry: TelemetryResult) => {
    setLastTelemetry(telemetry);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* 1. Hybrid Telemetry Bar (Persistent Header) */}
      <TelemetryHeader
        promptApiStatus={promptApiStatus}
        downloadProgress={downloadProgress}
        activeMode={activeMode}
        remoteConfigMode={remoteConfigMode}
        manualOverride={manualOverride}
        onSetMode={handleSetMode}
        onResetToRemoteConfig={handleResetToRemoteConfig}
        lastTelemetry={lastTelemetry}
        isOnline={isOnline}
        user={user}
        authLoading={authLoading}
        onGoogleSignIn={() => signInWithGoogle()}
        onSignOut={() => signOutUser()}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {user ? (
          <>
            {/* 2. SynapseVault Core Pipeline Workspace */}
            <SynapseWorkspace
              uid={user.uid}
              activeMode={activeMode}
              isOnline={isOnline}
              promptApiStatus={promptApiStatus}
              currentWorkspace={currentWorkspace}
              onWorkspaceUpdated={(ws) => setCurrentWorkspace(ws)}
              onRecordTelemetry={handleRecordTelemetry}
              onSwitchMode={(mode) => handleSetMode(mode, true)}
            />

            {/* 3. Firestore Offline Persistence Workspaces History */}
            <WorkspacesHistory
              workspaces={workspaces}
              selectedWorkspaceId={currentWorkspace ? currentWorkspace.id : null}
              onSelectWorkspace={(ws) => setCurrentWorkspace(ws)}
              uid={user.uid}
            />
          </>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs">Initializing anonymous session for evaluator...</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center text-xs text-slate-500">
        <span>SynapseVault • #BuildHybridAI Hackathon 2026 • </span>
        <span className="text-emerald-400 font-mono">Chrome Prompt API (Gemini Nano)</span>
        <span> + </span>
        <span className="text-indigo-400 font-mono">Firebase AI Logic (Gemini 3.8 Flash + TTS)</span>
      </footer>
    </div>
  );
}
