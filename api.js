import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, query, where, orderBy, limit, limitToLast, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, functions } from './firebase';

function safeError(error) {
  const code = String(error?.code || 'unknown').replace(/^functions\//, '');
  const descriptions = {
    unavailable: 'Cannot reach the ride service. Check your connection and try again.',
    'deadline-exceeded': 'The service took too long. Check your active ride before retrying.',
    unauthenticated: 'Sign in again to continue.',
    'permission-denied': error?.message?.includes('Firebase') ? 'You do not have access to this action.' : error?.message,
    'storage/unauthorized': 'This photo or document is private, or your application is already locked for review.',
    'storage/unknown': 'The upload could not finish. Check your connection and Firebase Storage setup.',
    'storage/object-not-found': 'This photo has not been uploaded yet.',
    'storage/retry-limit-exceeded': 'The upload timed out. Please try again.',
    internal: 'The service could not complete this action. Please try again.'
  };
  const message = descriptions[code] || error?.message || 'Something went wrong. Please try again.';
  const next = new Error(message);
  next.code = code;
  return next;
}

export const api = Object.fromEntries([
  'saveProfile', 'submitDriverApplication', 'reviewDriver', 'setAvailability',
  'publishLocation', 'requestRide', 'acceptRide', 'transitionRide', 'rateRide'
].map(name => [name, async data => {
  try { return (await httpsCallable(functions, name, { timeout: 20000 })(data)).data; }
  catch (error) { throw safeError(error); }
}]));

const record = snapshot => snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
const records = snapshot => snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
const errorCallback = callback => error => callback?.(safeError(error));
export const watchProfile = (uid, callback, onError) => onSnapshot(doc(db, 'kr_users', uid), snap => callback(record(snap)), errorCallback(onError));
export const watchApplication = (uid, callback, onError) => onSnapshot(doc(db, 'kr_driverApplications', uid), snap => callback(record(snap)), errorCallback(onError));
export const watchRide = (id, callback, onError) => onSnapshot(doc(db, 'kr_rides', id), snap => callback(record(snap)), errorCallback(onError));
export const watchRequests = (callback, onError) => onSnapshot(query(collection(db, 'kr_rideRequests'), orderBy('createdAt', 'desc'), limit(30)), snap => callback(records(snap)), errorCallback(onError));
export const watchDrivers = (callback, onError) => onSnapshot(query(collection(db, 'kr_publicDrivers'), where('verified', '==', true), limit(100)), snap => callback(records(snap)), errorCallback(onError));
export const watchHistory = (uid, role, callback, onError) => onSnapshot(query(collection(db, 'kr_rides'), where(role === 'driver' ? 'driverId' : 'passengerId', '==', uid), orderBy('createdAt', 'desc'), limit(30)), snap => callback(records(snap)), errorCallback(onError));
export const watchApplications = (callback, onError) => onSnapshot(query(collection(db, 'kr_driverApplications'), where('status', '==', 'pending'), orderBy('submittedAt', 'asc'), limit(30)), snap => callback(records(snap)), errorCallback(onError));
export const watchMessages = (rideId, callback, onError) => onSnapshot(query(collection(db, 'kr_rides', rideId, 'messages'), orderBy('createdAt', 'asc'), limitToLast(50)), snap => callback(records(snap)), errorCallback(onError));

export async function sendMessage(rideId, text) {
  const clean = String(text || '').trim();
  if (!auth.currentUser) throw new Error('Sign in to send a message.');
  if (!clean || clean.length > 500) throw new Error('Messages must be between 1 and 500 characters.');
  try { await addDoc(collection(db, 'kr_rides', rideId, 'messages'), { senderId: auth.currentUser.uid, text: clean, createdAt: serverTimestamp() }); }
  catch (error) { throw safeError(error); }
}

export async function uploadDriverFile(kind, file) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading your documents.');
  if (!['portrait', 'license', 'permit'].includes(kind)) throw new Error('Unsupported document type.');
  if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP photo.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Each photo must be smaller than 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  try {
    const result = await httpsCallable(functions, 'uploadDriverFile', { timeout: 60000 })({ kind, contentType: file.type, base64: btoa(binary) });
    return result.data.path;
  }
  catch (error) { throw safeError(error); }
}

async function privateImage(path) {
  if (!path || typeof path !== 'string' || !/^(driver-portraits|driver-documents)\/[A-Za-z0-9_-]+\/(portrait|license|permit)$/.test(path)) throw new Error('Invalid document path.');
  try {
    const [, driverId, kind] = path.split('/');
    const response = await httpsCallable(functions, 'getDriverFile', { timeout: 60000 })({ driverId, kind });
    const { base64, contentType } = response.data;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || typeof base64 !== 'string' || base64.length > 7 * 1024 * 1024) throw new Error('The document response could not be read.');
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: contentType }));
  }
  catch (error) { throw safeError(error); }
}
export const getPortrait = privateImage;
export const getDocument = privateImage;
