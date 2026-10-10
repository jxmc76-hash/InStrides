import type { Auth } from '@firebase/auth';
import type { Firestore } from '@firebase/firestore';
import type { FirebaseApp } from '@firebase/app';

// Config only — no Firebase imports at module load time.
// expo-router 57 eagerly evaluates all route modules during startup; any
// Firebase initialisation that runs at import-time fails because the module
// registry is still being assembled. All real work is deferred to first use.

const firebaseConfig = {
  apiKey: 'AIzaSyC_VBffGyCoopsZZiPTZowx8d7fhFQ8_-w',
  authDomain: 'in-strides.firebaseapp.com',
  projectId: 'in-strides',
  storageBucket: 'in-strides.firebasestorage.app',
  messagingSenderId: '974987405170',
  appId: '1:974987405170:web:c1f100b44bb85efed7dfeb',
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function lazyApp(): FirebaseApp {
  if (!_app) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApps, getApp, initializeApp } = require('@firebase/app');
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return _app!;
}

function lazyAuth(): Auth {
  if (!_auth) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const authMod = require('@firebase/auth');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    try {
      _auth = authMod.initializeAuth(lazyApp(), {
        persistence: authMod.getReactNativePersistence(AsyncStorage),
      });
    } catch {
      _auth = authMod.getAuth(lazyApp());
    }
  }
  return _auth!;
}

function lazyDb(): Firestore {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFirestore } = require('@firebase/firestore');
    _db = getFirestore(lazyApp());
  }
  return _db!;
}

// Proxy exports: look like Auth/Firestore but initialise on first property access.
// All callers (onAuthStateChanged, signIn, getFirestore doc refs, etc.) work
// unchanged because every property access goes to the real initialised object.
export const auth: Auth = new Proxy({} as Auth, {
  get(_, prop) { return Reflect.get(lazyAuth(), prop as string); },
  set(_, prop, value) { return Reflect.set(lazyAuth(), prop as string, value); },
});

export const db: Firestore = new Proxy({} as Firestore, {
  get(_, prop) { return Reflect.get(lazyDb(), prop as string); },
});
