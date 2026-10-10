import { getApps, getApp, initializeApp } from '@firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from '@firebase/auth';
import { getFirestore } from '@firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyC_VBffGyCoopsZZiPTZowx8d7fhFQ8_-w',
  authDomain: 'in-strides.firebaseapp.com',
  projectId: 'in-strides',
  storageBucket: 'in-strides.firebasestorage.app',
  messagingSenderId: '974987405170',
  appId: '1:974987405170:web:c1f100b44bb85efed7dfeb',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth throws if already initialized (e.g. HMR); fall back to getAuth
let _auth;
try {
  _auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  _auth = getAuth(app);
}

export const auth = _auth;
export const db = getFirestore(app);
