import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import originalConfig from './firebase-config.json';
import { isEmulator, runtime } from './runtime';

export { isEmulator };
const config = isEmulator ? { ...originalConfig, projectId: 'demo-keimoes-rides', storageBucket: 'demo-keimoes-rides.appspot.com' } : originalConfig;
export const app = initializeApp(config);
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
if (isEmulator) {
  connectAuthEmulator(auth, `http://${runtime.emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, runtime.emulatorHost, 8080);
  connectStorageEmulator(storage, runtime.emulatorHost, 9199);
  connectFunctionsEmulator(functions, runtime.emulatorHost, 5001);
}
