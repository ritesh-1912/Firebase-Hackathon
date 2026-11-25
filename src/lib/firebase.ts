import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth,
  type UserCredential,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  getBoolean,
  type RemoteConfig,
} from 'firebase/remote-config';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';

// Diagnostic notice surfaced in the UI if required Firebase env vars or initialization fail
export let firebaseInitDiagnostic: string | null = null;

// 1. Firebase configuration strictly loaded from environment variables
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

const missingVars = (
  [
    ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
  ] as const
)
  .filter(([, val]) => !val || val.startsWith('your_'))
  .map(([name]) => name);

if (missingVars.length > 0) {
  firebaseInitDiagnostic = `Missing or placeholder Firebase environment variables: ${missingVars.join(', ')}. Cloud features are running in fallback diagnostic mode.`;
  console.warn('[Firebase]', firebaseInitDiagnostic);
}

// 2. Initialize Firebase App
let initializedApp: FirebaseApp;
try {
  initializedApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  firebaseInitDiagnostic = `Firebase App initialization failed: ${msg}`;
  console.error('[Firebase]', firebaseInitDiagnostic);
  initializedApp = getApps().length > 0 ? getApps()[0] : initializeApp({ apiKey: 'unconfigured', projectId: 'unconfigured', appId: 'unconfigured' });
}
export const app: FirebaseApp = initializedApp;

// 3. Configure App Check debug token strictly BEFORE calling initializeAppCheck(...)
if (typeof self !== 'undefined') {
  const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugToken) {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken === 'true' ? true : debugToken;
  } else if (import.meta.env.DEV) {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

// 4. Initialize Firebase App Check strictly before any getAI() calls
// Uses ReCaptchaEnterpriseProvider with placeholder when running via debug token so no reCAPTCHA key is required
let appCheckInstance: AppCheck | null = null;
if (typeof window !== 'undefined') {
  try {
    const recaptchaSiteKey =
      import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
      import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY ||
      'debug-mode-placeholder';
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[Firebase] App Check initialization warning:', error);
    if (!firebaseInitDiagnostic) {
      firebaseInitDiagnostic = `Firebase App Check initialization warning: ${msg}`;
    }
  }
}
export const appCheck = appCheckInstance;

// 5. Initialize Firebase Auth (supporting Anonymous and Google Sign-In)
export const auth: Auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export async function signInAnonymouslyUser(): Promise<UserCredential> {
  return signInAnonymously(auth);
}

export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleAuthProvider);
}

export async function signOutUser(): Promise<void> {
  return signOut(auth);
}

// 6. Initialize Firestore with offline persistence enabled
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// 7. Initialize Remote Config
let remoteConfigInstance: RemoteConfig | null = null;
if (typeof window !== 'undefined') {
  try {
    remoteConfigInstance = getRemoteConfig(app);
    remoteConfigInstance.settings = {
      minimumFetchIntervalMillis: import.meta.env.DEV ? 10_000 : 3_600_000,
      fetchTimeoutMillis: 10_000,
    };
    remoteConfigInstance.defaultConfig = {
      default_inference_mode: 'prefer_on_device',
      auto_pii_firewall: true,
    };
    // Fetch and activate remote parameters in background
    fetchAndActivate(remoteConfigInstance).catch((err) => {
      console.warn('[Firebase] Remote Config fetchAndActivate warning:', err);
    });
  } catch (error) {
    console.warn('[Firebase] Remote Config initialization warning:', error);
  }
}
export const remoteConfig = remoteConfigInstance;

/**
 * Reads the auto_pii_firewall parameter from Firebase Remote Config with fallback to true
 */
export async function getAutoPiiFirewallEnabled(): Promise<boolean> {
  if (!remoteConfigInstance) {
    return true;
  }
  try {
    await fetchAndActivate(remoteConfigInstance);
    return getBoolean(remoteConfigInstance, 'auto_pii_firewall');
  } catch (err) {
    console.warn('[Firebase] Failed to fetch remote config auto_pii_firewall:', err);
    return true;
  }
}

export async function getDefaultInferenceMode(): Promise<'prefer_on_device' | 'only_on_device' | 'only_in_cloud'> {
  if (!remoteConfigInstance) {
    return 'prefer_on_device';
  }
  try {
    await fetchAndActivate(remoteConfigInstance);
    const mode = getString(remoteConfigInstance, 'default_inference_mode');
    if (mode === 'only_on_device' || mode === 'only_in_cloud' || mode === 'prefer_on_device') {
      return mode;
    }
  } catch (err) {
    console.warn('[Firebase] Failed to fetch remote config default_inference_mode:', err);
  }
  return 'prefer_on_device';
}
