import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const hasFirebaseConfig = requiredKeys.every((key) => Boolean(firebaseConfig[key]));

const rawFirebaseTarget = import.meta.env.VITE_FIREBASE_TARGET;
const firebaseTarget =
  rawFirebaseTarget === 'emulators' || rawFirebaseTarget === 'cloud'
    ? rawFirebaseTarget
    : null;
const hasExplicitTarget = firebaseTarget !== null;

let runtimeBlockedReason = null;
if (!hasExplicitTarget) {
  runtimeBlockedReason = 'missing-explicit-target';
} else if (firebaseTarget === 'emulators' && !import.meta.env.DEV) {
  runtimeBlockedReason = 'emulators-not-allowed-in-production';
} else if (!hasFirebaseConfig) {
  runtimeBlockedReason = 'missing-firebase-config';
}

const shouldInitializeFirebase = runtimeBlockedReason === null;
const shouldUseEmulators = shouldInitializeFirebase && firebaseTarget === 'emulators';
const shouldUseCloud = shouldInitializeFirebase && firebaseTarget === 'cloud';

if (rawFirebaseTarget && !hasExplicitTarget) {
  console.warn(
    `[Firebase] VITE_FIREBASE_TARGET="${rawFirebaseTarget}" no es valido. Usa "emulators" o "cloud". Inicializacion bloqueada.`
  );
}
if (runtimeBlockedReason === 'missing-explicit-target') {
  console.warn(
    '[Firebase] Inicializacion bloqueada: define VITE_FIREBASE_TARGET=emulators o VITE_FIREBASE_TARGET=cloud de forma explicita.'
  );
}
if (runtimeBlockedReason === 'emulators-not-allowed-in-production') {
  console.error(
    '[Firebase] Inicializacion bloqueada: el destino "emulators" no esta permitido en produccion. No se conectara a Cloud.'
  );
}
if (runtimeBlockedReason === 'missing-firebase-config' && hasExplicitTarget) {
  console.warn(
    '[Firebase] Inicializacion bloqueada: faltan variables VITE_FIREBASE_* requeridas.'
  );
}

const missingConfigMessage =
  'Firebase no esta inicializado. Define VITE_FIREBASE_TARGET=emulators|cloud y las variables VITE_FIREBASE_* requeridas (ver .env.example).';

const notConfiguredProxy = new Proxy(
  {},
  {
    get() {
      throw new Error(missingConfigMessage);
    },
  }
);

let firebaseApp = null;
let auth = notConfiguredProxy;
let db = notConfiguredProxy;
let storage = notConfiguredProxy;
let functions = notConfiguredProxy;
let emulatorsConnected = false;
const emulatorGlobalKey = '__agrostyle_firebase_emulators_connected__';

function connectEmulatorsIfNeeded(appAuth, appDb, appStorage, appFunctions) {
  if (!shouldUseEmulators) return;
  if (emulatorsConnected || globalThis[emulatorGlobalKey]) {
    emulatorsConnected = true;
    return;
  }

  const authUrl =
    import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
  const firestoreHost =
    import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
  const firestorePort = Number(
    import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080
  );
  const storageHost =
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1';
  const storagePort = Number(
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199
  );
  const functionsHost =
    import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1';
  const functionsPort = Number(
    import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001
  );

  try {
    connectAuthEmulator(appAuth, authUrl, { disableWarnings: true });
  } catch (error) {
    console.warn('[Firebase] Auth emulator ya configurado o no disponible.', error);
  }
  try {
    connectFirestoreEmulator(appDb, firestoreHost, firestorePort);
  } catch (error) {
    console.warn('[Firebase] Firestore emulator ya configurado o no disponible.', error);
  }
  try {
    connectStorageEmulator(appStorage, storageHost, storagePort);
  } catch (error) {
    console.warn('[Firebase] Storage emulator ya configurado o no disponible.', error);
  }
  try {
    connectFunctionsEmulator(appFunctions, functionsHost, functionsPort);
  } catch (error) {
    console.warn('[Firebase] Functions emulator ya configurado o no disponible.', error);
  }

  emulatorsConnected = true;
  globalThis[emulatorGlobalKey] = true;
  console.info('[Firebase] Modo emuladores locales activo.', {
    authUrl,
    firestore: `${firestoreHost}:${firestorePort}`,
    storage: `${storageHost}:${storagePort}`,
    functions: `${functionsHost}:${functionsPort}`,
  });
}

if (shouldInitializeFirebase) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  storage = getStorage(firebaseApp);
  functions = getFunctions(firebaseApp);
  connectEmulatorsIfNeeded(auth, db, storage, functions);
}

const configured = shouldInitializeFirebase;
const useEmulators = shouldUseEmulators;

export function isFirebaseConfigured() {
  return configured;
}

export function isUsingFirebaseEmulators() {
  return useEmulators;
}

export function getFirebaseApp() {
  if (!firebaseApp) throw new Error(missingConfigMessage);
  return firebaseApp;
}

export { auth, db, firebaseApp, functions, storage };