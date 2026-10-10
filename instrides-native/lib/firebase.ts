import { getApps, getApp, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyC_VBffGyCoopsZZiPTZowx8d7fhFQ8_-w',
  authDomain: 'in-strides.firebaseapp.com',
  projectId: 'in-strides',
  storageBucket: 'in-strides.firebasestorage.app',
  messagingSenderId: '974987405170',
  appId: '1:974987405170:web:c1f100b44bb85efed7dfeb',
};

const isNew = !getApps().length;
const app = isNew ? initializeApp(firebaseConfig) : getApp();

export const auth = isNew
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(app);

export const db = getFirestore(app);
