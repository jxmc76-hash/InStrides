import { getApps, getApp, initializeApp } from '@firebase/app';
import { getAuth } from '@firebase/auth';
import { getFirestore } from '@firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC_VBffGyCoopsZZiPTZowx8d7fhFQ8_-w',
  authDomain: 'in-strides.firebaseapp.com',
  projectId: 'in-strides',
  storageBucket: 'in-strides.firebasestorage.app',
  messagingSenderId: '974987405170',
  appId: '1:974987405170:web:c1f100b44bb85efed7dfeb',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
