import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getIdTokenResult,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { auth, isEmulator } from './firebase';
import { runtime } from './runtime';
import { api, watchApplication, watchProfile } from './api';

const EMAIL_SETTINGS = runtime.authContinueUrl ? { url: runtime.authContinueUrl } : undefined;
const environmentMessage = () => runtime.configurationError || runtime.securityWarning || 'Open the published HTTPS app. This local development address cannot accept sign-in details securely.';

export function authError(error) {
  const code = String(error?.code || '').replace(/^auth\//, '');
  const messages = {
    'invalid-credential': 'The sign-in details did not match. Check your email and password.',
    'wrong-password': 'The sign-in details did not match. Check your email and password.',
    'user-not-found': 'The sign-in details did not match. Check your email and password.',
    'invalid-email': 'Enter a valid email address.',
    'email-already-in-use': 'That email cannot be registered. Try signing in or resetting your password.',
    'weak-password': 'Choose a stronger password with at least 10 characters, a capital letter, a lowercase letter and a number.',
    'password-does-not-meet-requirements': 'Your password does not meet this project’s password requirements. Use a longer, stronger password.',
    'too-many-requests': 'Too many attempts. Please wait a little before trying again.',
    'network-request-failed': !runtime.canUseSensitiveFeatures ? environmentMessage() : isEmulator
      ? 'Local test sign-in is unreachable from this device. Start the Firebase emulators on the development computer and make them reachable from this device, or use the published HTTPS app.'
      : 'The live sign-in service could not be reached. Reload the HTTPS app and try again. If this continues, the app owner should check Firebase access and blocked browser requests.',
    'user-disabled': 'This account is unavailable. Contact Keimoes Rides support.',
    'operation-not-allowed': 'Email and password sign-in must be enabled in this Firebase project. Ask the app administrator to enable it.',
    'unauthorized-domain': 'This website domain needs to be added to Firebase Authentication’s authorised domains. The app owner must finish this setup for sign-in and email links.',
    'unauthorized-continue-uri': 'Firebase has not authorised this website for email links. Add its hostname to Authentication → Settings → Authorised domains, then request a new link.',
    'invalid-continue-uri': 'The return address for verification and reset emails is invalid. The app owner must configure an authorised HTTPS app address.',
    'missing-continue-uri': 'The return address for verification and reset emails is missing. The app owner must configure an authorised HTTPS app address.',
    'invalid-api-key': 'Firebase sign-in is not configured for this website. The app owner should check the Firebase web app configuration and API-key website restrictions.',
    'app-not-authorized': 'Firebase has not authorised this website. The app owner should check the web app configuration and API-key website restrictions.',
    'web-storage-unsupported': 'This browser cannot save your sign-in session. Allow storage for this site or open the app in another browser.',
    'quota-exceeded': 'The sign-in service has reached its request limit. Please wait and try again; the app owner may need to review Firebase quotas.',
    'invalid-sender': 'Firebase could not send this account email. The app owner must check the sender and Authentication email templates.',
    'invalid-message-payload': 'Firebase could not create this account email. The app owner must check the Authentication email template settings.',
    'missing-email': 'Enter the email address you use for this account.',
    'requires-recent-login': 'Please sign out and sign in again before changing this account.',
    'invalid-action-code': 'This link has already been used or is no longer valid. Request a new one.',
    'expired-action-code': 'This link has expired. Request a new one.',
    'user-token-expired': 'Your session has expired. Please sign in again.',
    'invalid-login-credentials': 'The sign-in details did not match. Check your email and password.',
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}

function readableError(error, prefix = '') {
  const result = new Error(`${prefix}${authError(error)}`);
  result.code = error?.code;
  return result;
}

function validatePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0027')) digits = digits.slice(2);
  if (digits.length === 10 && digits[0] === '0') digits = `27${digits.slice(1)}`;
  if (!/^27[1-9]\d{8}$/.test(digits)) throw new Error('Enter a South African number such as 082 123 4567.');
  return `+${digits}`;
}

export function useSession() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [, renderFreshUser] = useState(0);
  const live = useRef(false);
  const generation = useRef(0);
  const verificationSentAt = useRef(0);

  useEffect(() => {
    live.current = true;
    let stopProfile = () => {};
    let stopApplication = () => {};
    let previousUid = null;
    const stopAuth = onIdTokenChanged(auth, (current) => {
      const thisGeneration = ++generation.current;
      const currentGeneration = () => live.current && generation.current === thisGeneration;
      stopProfile();
      stopApplication();
      stopProfile = () => {};
      stopApplication = () => {};
      setUser(current);
      renderFreshUser((value) => value + 1);
      setError('');
      setIsAdmin(false);
      if (current?.uid !== previousUid) {
        setProfile(null);
        setApplication(null);
        verificationSentAt.current = 0;
      }
      previousUid = current?.uid || null;
      if (!runtime.canUseSensitiveFeatures) {
        setProfile(null);
        setApplication(null);
        setError(environmentMessage());
        setLoading(false);
        return;
      }
      if (!current) {
        setProfile(null);
        setApplication(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      let profileLoaded = false;
      let claimsLoaded = false;
      const finishLoading = () => {
        if (currentGeneration() && profileLoaded && claimsLoaded) setLoading(false);
      };
      getIdTokenResult(current).then((token) => {
        if (!currentGeneration()) return;
        setIsAdmin(token.claims.admin === true);
        claimsLoaded = true;
        finishLoading();
      }).catch((failure) => {
        if (!currentGeneration()) return;
        setError(authError(failure));
        claimsLoaded = true;
        finishLoading();
      });
      stopProfile = watchProfile(current.uid, (nextProfile) => {
        if (!currentGeneration()) return;
        setProfile(nextProfile || null);
        profileLoaded = true;
        finishLoading();
      }, (failure) => {
        if (!currentGeneration()) return;
        setError(`Your profile could not be loaded. ${authError(failure)}`);
        profileLoaded = true;
        finishLoading();
      });
      stopApplication = watchApplication(current.uid, (nextApplication) => {
        if (currentGeneration()) setApplication(nextApplication || null);
      }, (failure) => {
        if (currentGeneration()) setError(`Driver verification could not be loaded. ${authError(failure)}`);
      });
    }, (failure) => {
      if (!live.current) return;
      setError(authError(failure));
      setLoading(false);
    });
    return () => {
      live.current = false;
      ++generation.current;
      stopAuth();
      stopProfile();
      stopApplication();
    };
  }, []);

  const operation = useCallback(async (work, { allowInsecure = false } = {}) => {
    if (live.current) setError('');
    try {
      if (!allowInsecure && !runtime.canUseSensitiveFeatures) throw new Error(environmentMessage());
      return await work();
    } catch (failure) {
      const humanError = readableError(failure);
      if (live.current) setError(humanError.message);
      throw humanError;
    }
  }, []);

  const login = useCallback((email, password) => operation(async () => {
    await signInWithEmailAndPassword(auth, String(email).trim(), password);
  }), [operation]);

  const legacyLogin = useCallback((phone, password) => operation(async () => {
    // Older versions used the digits exactly as entered, rather than a verified phone credential.
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 13) throw new Error('Enter the phone number used in the original app, including its original country-code format.');
    await signInWithEmailAndPassword(auth, `${digits}@keimoesrides.co.za`, password);
  }), [operation]);

  const register = useCallback((fields) => operation(async () => {
    const name = String(fields.name || '').trim();
    const phone = validatePhone(fields.phone);
    const email = String(fields.email || '').trim();
    if (name.length < 2 || name.length > 80) throw new Error('Enter your full name, between 2 and 80 characters.');
    if (!['passenger', 'driver'].includes(fields.role)) throw new Error('Choose passenger or driver.');
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/.test(fields.password || '')) throw new Error('Use at least 10 characters with a capital letter, lowercase letter and number.');
    const credential = await createUserWithEmailAndPassword(auth, email, fields.password);
    let verificationRequested = false;
    let verificationError = null;
    // Auth email actions remain usable when the separate ride-profile service is not yet deployed.
    try {
      await sendEmailVerification(credential.user, EMAIL_SETTINGS);
      verificationSentAt.current = Date.now();
      verificationRequested = true;
    } catch (failure) {
      verificationError = failure;
    }
    await updateProfile(credential.user, { displayName: name }).catch(() => {});
    try {
      await api.saveProfile({ name, phone, role: fields.role });
    } catch (failure) {
      const verificationStatus = verificationRequested
        ? isEmulator ? 'A verification link was created in the Auth emulator terminal; no email was sent. ' : 'A verification email was requested. Check your inbox and spam folder. '
        : `A verification link also needs attention: ${authError(verificationError)} `;
      throw readableError(failure, `Your sign-in account was created, but your ride profile could not be saved. ${verificationStatus}Complete your profile when the ride service is available. `);
    }
    if (verificationError && live.current) setError(`Your account is ready, but a verification link could not be requested. ${authError(verificationError)}`);
    return { verificationSent: verificationRequested && !isEmulator, verificationRequested };
  }), [operation]);

  const logout = useCallback(() => operation(async () => {
    if (profile?.activeRideId) throw new Error('Finish or cancel your active trip before signing out.');
    let warning = '';
    if (runtime.canUseSensitiveFeatures && profile?.role === 'driver' && application?.status === 'approved') {
      try { await api.setAvailability({ online: false }); }
      catch {
        // Losing a service connection must never trap a user in an authenticated browser.
        warning = 'You are signed out. Driver offline status could not be confirmed; your live marker will expire when its location becomes stale.';
      }
    }
    await signOut(auth);
    return { warning };
  }, { allowInsecure: true }), [operation, profile?.activeRideId, profile?.role, application?.status]);

  const resetPassword = useCallback((email) => operation(async () => {
    try {
      await sendPasswordResetEmail(auth, String(email || '').trim(), EMAIL_SETTINGS);
    } catch (failure) {
      // Identical result for existing and unknown addresses; never disclose registration status.
      if (!['auth/user-not-found', 'auth/invalid-credential'].includes(failure.code)) throw failure;
    }
  }), [operation]);

  const resendVerification = useCallback(() => operation(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error('Sign in to verify your email.');
    if (current.emailVerified) return;
    if (/^\d+@keimoesrides\.co\.za$/i.test(current.email || '')) throw new Error('This original phone account needs a real email address first. Open Manage sign-in to add one.');
    if (Date.now() - verificationSentAt.current < 60_000) throw new Error('Please wait a minute before requesting another verification email.');
    await sendEmailVerification(current, EMAIL_SETTINGS);
    verificationSentAt.current = Date.now();
  }), [operation]);

  const refreshUser = useCallback(() => operation(async () => {
    const current = auth.currentUser;
    if (!current) return null;
    await reload(current);
    await current.getIdToken(true);
    if (live.current && auth.currentUser?.uid === current.uid) {
      setUser(current);
      renderFreshUser((value) => value + 1);
    }
    return current;
  }), [operation]);

  const saveProfile = useCallback((fields) => operation(async () => {
    if (!auth.currentUser) throw new Error('Sign in to complete your profile.');
    const name = String(fields.name || '').trim();
    if (name.length < 2 || name.length > 80) throw new Error('Enter your full name, between 2 and 80 characters.');
    const payload = { name, phone: validatePhone(fields.phone) };
    if (fields.role || profile?.role) payload.role = fields.role || profile.role;
    return api.saveProfile(payload);
  }), [operation, profile?.role]);

  const changeLegacyEmail = useCallback((email, password) => operation(async () => {
    const current = auth.currentUser;
    if (!current || !/^\d+@keimoesrides\.co\.za$/i.test(current.email || '')) throw new Error('Sign in with an original phone account to update its email.');
    const nextEmail = String(email || '').trim();
    if (/^\d+@keimoesrides\.co\.za$/i.test(nextEmail)) throw new Error('Use a real email address where you can receive a verification link.');
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
    await verifyBeforeUpdateEmail(current, nextEmail, EMAIL_SETTINGS);
  }), [operation]);

  return {
    user, profile, application, loading, error, isAdmin,
    login, legacyLogin, register, logout, resetPassword,
    resendVerification, refreshUser, saveProfile, changeLegacyEmail,
  };
}
