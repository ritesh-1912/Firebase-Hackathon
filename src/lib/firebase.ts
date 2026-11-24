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
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';

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

// 2. Initialize Firebase App
export const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

// 3. Configure App Check debug token BEFORE initializing App Check
// Supports local judging, emulators, and CI environments without hardcoding secrets
if (typeof self !== 'undefined') {
  const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken === 'true' ? true : debugToken;
  } else if (import.meta.env.DEV) {
    // In local development mode, automatically generate a debug token in browser console
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

// 4. Initialize Firebase App Check strictly before any getAI() calls
let appCheckInstance: AppCheck | null = null;
if (typeof window !== 'undefined') {
  const recaptchaSiteKey = import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY;
  if (recaptchaSiteKey) {
    try {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.warn('[Firebase] App Check initialization warning:', error);
    }
  } else if (import.meta.env.DEV || import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
    // If running in development or debug environment, initialize with debug provider
    try {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('debug-provider-local'),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.info('[Firebase] App Check debug provider notice:', error);
    }
  } else {
    console.info('[Firebase] App Check: No VITE_FIREBASE_RECAPTCHA_SITE_KEY provided in environment.');
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
