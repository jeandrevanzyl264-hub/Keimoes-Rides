import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CarFront, Check, Eye, EyeOff, Info, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import { isEmulator } from '../firebase';
import { runtime } from '../runtime';

const passwordChecks = [
  ['At least 10 characters', (value) => value.length >= 10],
  ['An uppercase and lowercase letter', (value) => /[A-Z]/.test(value) && /[a-z]/.test(value)],
  ['At least one number', (value) => /\d/.test(value)],
];
const isLegacy = (user) => /^\d+@keimoesrides\.co\.za$/i.test(user?.email || '');
const safeMode = (mode) => ['profile', 'complete-profile'].includes(mode) ? 'complete' : mode;
const verificationMessage = isEmulator
  ? 'Local verification link created. No email is sent in test mode. Open the link printed in the Auth emulator terminal, then return here.'
  : 'Verification email requested. Check your inbox and spam folder, then open the link to verify your address.';
const resetMessage = isEmulator
  ? 'Local test mode: no email is sent. If this account exists, its password reset link is printed in the Auth emulator terminal.'
  : 'If an account exists for this email, a password reset link has been requested. Check your inbox and spam folder.';

export default function AuthDialog({ session, onClose, initialMode = 'login', initialRole = 'passenger' }) {
  const [mode, setMode] = useState(() => {
    if (session.user && !session.loading && !session.profile) return 'complete';
    if (session.user && isLegacy(session.user)) return 'legacy-upgrade';
    if (session.user && !session.user.emailVerified) return 'verify';
    if (session.user && session.profile) return 'account';
    return safeMode(initialMode);
  });
  const [name, setName] = useState(session.profile?.name || session.user?.displayName || '');
  const [phone, setPhone] = useState(session.profile?.phone || '');
  const [email, setEmail] = useState(isLegacy(session.user) ? '' : session.user?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(initialRole === 'driver' ? 'driver' : 'passenger');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingSignIn, setPendingSignIn] = useState(false);
  const [legacyEmailSent, setLegacyEmailSent] = useState(false);
  const modal = useRef(null);
  const operationId = useRef(0);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = [...(modal.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') || [])]
        .filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); modal.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !modal.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      ++operationId.current;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const firstField = modal.current?.querySelector('input:not([disabled]), select:not([disabled])');
      (firstField || modal.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  useEffect(() => {
    if (busy || session.loading) return;
    if (!session.user) {
      if (['complete', 'verify', 'account', 'legacy-upgrade'].includes(mode)) {
        setMode('login');
        setNotice(mode === 'legacy-upgrade' ? 'After confirming your email-change link, sign in with your new email address and existing password.' : 'Sign in again to manage your account.');
      }
      return;
    }
    if (session.user.emailVerified && (mode === 'verify' || (mode === 'legacy-upgrade' && !isLegacy(session.user)))) {
      if (session.profile) onCloseRef.current();
      else { setMode('complete'); setNotice('Your email is verified. Complete your ride profile when the service is available.'); }
      return;
    }
    if (!session.profile) {
      if (!['legacy-upgrade', 'verify'].includes(mode)) setMode('complete');
      return;
    }
    if (mode === 'complete' || pendingSignIn) {
      setPendingSignIn(false);
      if (isLegacy(session.user)) setMode('legacy-upgrade');
      else if (!session.user.emailVerified) setMode('verify');
      else onCloseRef.current();
    }
  }, [session.user, session.profile, session.loading, busy, pendingSignIn, mode]);

  useEffect(() => {
    if (!runtime.canUseSensitiveFeatures || !session.user || session.user.emailVerified || !['verify', 'legacy-upgrade', 'complete'].includes(mode)) return;
    let cancelled = false;
    let inFlight = false;
    let lastCheck = 0;
    const refreshWhenReturning = async () => {
      if (document.visibilityState === 'hidden' || inFlight || Date.now() - lastCheck < 15_000) return;
      lastCheck = Date.now();
      inFlight = true;
      try {
        const current = await session.refreshUser();
        if (cancelled || !current?.emailVerified) return;
        if (!session.profile) {
          setMode('complete');
          setNotice('Your email is verified. Complete your ride profile when the service is available.');
        } else if (mode !== 'complete') onCloseRef.current();
      } catch (failure) {
        if (!cancelled) setError(failure?.message || 'Verification status could not be checked. Use the check button to try again.');
      } finally { inFlight = false; }
    };
    window.addEventListener('focus', refreshWhenReturning);
    document.addEventListener('visibilitychange', refreshWhenReturning);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshWhenReturning);
      document.removeEventListener('visibilitychange', refreshWhenReturning);
    };
  }, [session.user?.uid, session.user?.emailVerified, Boolean(session.profile), session.refreshUser, mode]);

  const changeMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setShowPassword(false);
  };

  const perform = async (work) => {
    const id = ++operationId.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (failure) {
      if (id === operationId.current) setError(failure?.message || 'Please try again.');
    } finally {
      if (id === operationId.current) setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    perform(async () => {
      if (mode === 'login' || mode === 'legacy') {
        if (mode === 'legacy') await session.legacyLogin(phone, password);
        else await session.login(email, password);
        setPassword('');
        setPendingSignIn(true);
      } else if (mode === 'register') {
        const result = await session.register({ name, phone, email, password, role });
        setPassword('');
        if (result?.verificationRequested || result?.verificationSent) setNotice(verificationMessage);
        setPendingSignIn(true);
      } else if (mode === 'forgot') {
        await session.resetPassword(email);
        setNotice(resetMessage);
      } else if (mode === 'complete') {
        await session.saveProfile({ name, phone, role });
        setPendingSignIn(true);
        setNotice('Profile saved. Your account is almost ready.');
      } else if (mode === 'legacy-upgrade') {
        await session.changeLegacyEmail(email, password);
        setPassword('');
        setLegacyEmailSent(true);
        setNotice(isEmulator
          ? `Local email-change link created for ${email}. No email is sent in test mode. Open the link printed in the Auth emulator terminal to keep your existing account and verify the new address.`
          : `An email-change link has been requested for ${email}. Check its inbox and spam folder, then open the link to verify and attach that address to your existing account.`);
      }
    });
  };

  const title = {
    login: 'Good to see you again.',
    register: 'Your next ride starts here.',
    forgot: 'Let’s get you back in.',
    legacy: 'Welcome back, Keimoes.',
    complete: 'Make yourself at home.',
    verify: 'One quick email check.',
    'legacy-upgrade': 'Keep your account. Add email.',
    account: 'Your account, your way.',
  }[mode] || 'Welcome to Keimoes Rides.';
  const description = {
    login: 'Sign in to book a ride, message your driver and follow your trip.',
    register: 'A local ride. A familiar place. Create your Keimoes Rides account.',
    forgot: 'Enter your real email address to request a secure password reset link.',
    legacy: 'Use the phone number and password you used in the original app.',
    complete: 'Add your contact details and choose how you’ll use Keimoes Rides.',
    verify: 'Verify your email before booking a ride or submitting driver verification.',
    'legacy-upgrade': 'Your original phone sign-in is preserved. Add a real email so you can verify your account and recover your password.',
    account: 'Manage your sign-in details and keep your account secure.',
  }[mode];
  const submitLabel = {
    login: 'Sign in', register: 'Create account', forgot: isEmulator ? 'Create test reset link' : 'Send reset link', legacy: 'Sign in with phone',
    complete: 'Save my profile', 'legacy-upgrade': isEmulator ? 'Create test email-change link' : 'Send secure email link',
  }[mode];
  const showsPassword = ['login', 'register', 'legacy', 'legacy-upgrade'].includes(mode);
  const showsNamePhone = ['register', 'complete'].includes(mode);
  const showEmail = ['login', 'register', 'forgot', 'legacy-upgrade'].includes(mode);
  let publicAppUrl = null;
  try {
    const url = new URL(runtime.publicUrl);
    if (url.protocol === 'https:') publicAppUrl = url.href;
  } catch { /* A missing public URL is valid during local-only development. */ }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={modal} className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <div className="modal-header">
          <span className="eyebrow"><span className="brand-mark" aria-hidden="true"><CarFront size={21} /></span> KEIMOES RIDES</span>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close sign-in dialog"><X size={21} /></button>
        </div>
        <div className="modal-body stack">
          {['forgot', 'legacy'].includes(mode) && <button className="btn btn-ghost btn-sm" type="button" onClick={() => changeMode('login')} disabled={busy}><ArrowLeft size={15} /> Back to email sign-in</button>}
          <div>
            <h2 id={titleId}>{title}</h2>
            <p className="muted" id={descriptionId}>{description}</p>
          </div>

          {!runtime.canUseSensitiveFeatures ? <div className="stack">
            <div className="notice notice-error" role="alert"><ShieldCheck size={20} aria-hidden="true" /><div><strong>Open Keimoes Rides securely</strong><p>{runtime.configurationError || runtime.securityWarning || 'Open the published HTTPS app. This is a local development address and cannot accept sign-in details securely.'}</p></div></div>
            {publicAppUrl && <a className="btn btn-primary" href={publicAppUrl}>Open the HTTPS app <ArrowRight size={17} aria-hidden="true" /></a>}
            <button type="button" className="btn btn-secondary" onClick={onClose}>Back to the map</button>
            {session.user && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => perform(async () => { const result = await session.logout(); onClose(result); })}>Sign out on this device</button>}
          </div> : <>
          {isEmulator && <div className="notice notice-info"><Info size={18} aria-hidden="true" /><div><strong>Local test mode</strong><p>Accounts stay in the local Firebase emulators. Verification, password reset and email-change emails are not sent. Use the action link printed in the Auth emulator terminal.</p></div></div>}

          {(error || (session.error && !busy)) && <div className="notice notice-error" role="alert">{error || session.error}</div>}
          {notice && <div className="notice notice-success" role="status">{notice}</div>}

          {mode === 'account' ? (
            <div className="stack">
              <div className="card stack"><ShieldCheck size={30} aria-hidden="true" /><strong>{session.user?.email}</strong><span className="chip"><Check size={14} /> Email verified</span><p className="muted">Your role is {session.profile?.role === 'driver' ? 'driver' : 'passenger'}. Driver approval is reviewed separately from email verification.</p></div>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => perform(async () => {
                await session.resetPassword(session.user.email);
                setNotice(resetMessage);
              })}>{isEmulator ? 'Create test password reset link' : 'Send password reset email'}</button>
              <button type="button" className="btn btn-primary" onClick={onClose}>Back to my rides <ArrowRight size={17} /></button>
            </div>
          ) : mode === 'verify' ? (
            <div className="stack">
              <div className="card stack">
                <Mail size={30} aria-hidden="true" />
                <strong>{session.user?.email}</strong>
                <p className="muted">{isEmulator ? 'Open this account’s verification link printed in the Auth emulator terminal, then come back here. Local test mode does not send email.' : 'Open the verification link in your inbox, then come back here. Check your spam folder if it doesn’t arrive.'}</p>
              </div>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => perform(async () => {
                const current = await session.refreshUser();
                if (current?.emailVerified) {
                  if (session.profile) onClose();
                  else { setMode('complete'); setNotice('Your email is verified. Complete your ride profile when the service is available.'); }
                }
                else setNotice('This email is not verified yet. Open the latest email link, then check again.');
              })}><Check size={17} /> {busy ? 'Checking…' : 'I’ve verified my email'}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => perform(async () => {
                await session.resendVerification();
                setNotice(`${verificationMessage} Please wait a minute before requesting another link.`);
              })}>{isEmulator ? 'Create another test verification link' : 'Resend verification email'}</button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Explore the app for now</button>
            </div>
          ) : (
            <form className="stack" onSubmit={submit} aria-busy={busy}>
              {mode === 'complete' && session.user && !session.user.emailVerified && !isLegacy(session.user) && <div className="card stack"><strong>You can verify your email while finishing your profile.</strong><p className="hint">{isEmulator ? 'Use the verification action printed in the Auth emulator terminal. No email is sent in local test mode.' : 'Use the verification link requested for your email address. Your ride profile still needs to be saved before you can book or drive.'}</p><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => perform(async () => {
                const current = await session.refreshUser();
                setNotice(current?.emailVerified ? 'Your email is verified. Finish your ride profile to continue.' : 'This email is not verified yet. Open the latest verification link, then check again.');
              })}>Check verification status</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => perform(async () => {
                await session.resendVerification(); setNotice(verificationMessage);
              })}>{isEmulator ? 'Create another test verification link' : 'Resend verification email'}</button></div>}
              {mode === 'complete' && isLegacy(session.user) && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => changeMode('legacy-upgrade')}>Add a real email to my original account</button>}
              {showsNamePhone && <>
                <div className="field">
                  <label htmlFor={`${fieldId}-name`}>Full name</label>
                  <input id={`${fieldId}-name`} name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your first and last name" minLength={2} maxLength={80} required disabled={busy} />
                </div>
                <div className="field">
                  <label htmlFor={`${fieldId}-phone`}>Mobile number</label>
                  <input id={`${fieldId}-phone`} name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="082 123 4567" maxLength={20} required disabled={busy} aria-describedby={`${fieldId}-phone-hint`} />
                  <span className="hint" id={`${fieldId}-phone-hint`}>Shared only with your assigned driver or passenger for your trip.</span>
                </div>
                <fieldset className="field role-picker" disabled={busy}>
                  <legend>I want to</legend>
                  <div className="form-grid">
                    <label className={`role-option ${role === 'passenger' ? 'selected' : ''}`}>
                      <input type="radio" name="role" value="passenger" checked={role === 'passenger'} onChange={() => setRole('passenger')} />
                      <UserRound size={19} aria-hidden="true" /><span>Find a ride</span>
                    </label>
                    <label className={`role-option ${role === 'driver' ? 'selected' : ''}`}>
                      <input type="radio" name="role" value="driver" checked={role === 'driver'} onChange={() => setRole('driver')} />
                      <CarFront size={19} aria-hidden="true" /><span>Become a driver</span>
                    </label>
                  </div>
                  <span className="hint">{role === 'driver' ? 'Drivers submit a face photo, licence, operating permit and vehicle details for manual review. Approval is required before going online.' : 'Your account role is saved securely. Choose driver now if you want to offer rides.'}</span>
                </fieldset>
              </>}
              {mode === 'legacy' && <div className="field">
                <label htmlFor={`${fieldId}-legacy-phone`}>Original account phone number</label>
                <input id={`${fieldId}-legacy-phone`} name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="username" placeholder="082 123 4567" required maxLength={20} disabled={busy} aria-describedby={`${fieldId}-legacy-hint`} />
                <span id={`${fieldId}-legacy-hint`} className="hint">Use the same format as before: 082… and 2782… can be different original accounts.</span>
              </div>}
              {showEmail && <div className="field">
                <label htmlFor={`${fieldId}-email`}>{mode === 'legacy-upgrade' ? 'Your real email address' : 'Email address'}</label>
                <input id={`${fieldId}-email`} name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete={mode === 'login' ? 'username' : 'email'} placeholder="you@example.com" required maxLength={254} disabled={busy} autoCapitalize="none" spellCheck={false} />
              </div>}
              {showsPassword && <div className="field">
                <label htmlFor={`${fieldId}-password`}>{mode === 'register' ? 'Create a password' : mode === 'legacy-upgrade' ? 'Your existing account password' : 'Password'}</label>
                <div className="password-field" style={{ position: 'relative' }}>
                  <input id={`${fieldId}-password`} name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 10 : undefined} maxLength={4096} disabled={busy} style={{ paddingRight: '3rem', width: '100%' }} aria-describedby={mode === 'register' ? `${fieldId}-password-hint` : undefined} />
                  <button type="button" className="icon-button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} style={{ position: 'absolute', right: '0.35rem', top: '50%', transform: 'translateY(-50%)' }}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
                {mode === 'register' && <ul className="password-checks" id={`${fieldId}-password-hint`} aria-label="Password requirements" style={{ listStyle: 'none', padding: 0, margin: '.35rem 0', fontSize: '.8rem' }}>
                  {passwordChecks.map(([label, test]) => <li key={label} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', color: test(password) ? '#256144' : 'var(--muted, #647268)' }}><Check size={13} aria-hidden="true" />{label}{test(password) ? ' ✓' : ''}</li>)}
                </ul>}
              </div>}
              {mode === 'login' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeMode('forgot')} disabled={busy}>Forgot your password?</button>}
              {mode === 'legacy-upgrade' && legacyEmailSent && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => perform(async () => {
                const current = await session.refreshUser();
                if (current && !isLegacy(current) && current.emailVerified) {
                  if (session.profile) onClose();
                  else { setMode('complete'); setNotice('Your email is verified. Complete your ride profile when the service is available.'); }
                }
                else setNotice(isEmulator ? 'The change is not complete yet. Open the email-change link in the Auth emulator terminal. After confirming it, sign in with your new email if prompted.' : 'The change is not complete yet. Open the link requested for your new email address. After confirming it, sign in with your new email if prompted.');
              })}>I’ve opened the email link</button>}
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : submitLabel}<ArrowRight size={17} aria-hidden="true" /></button>
              {mode === 'legacy-upgrade' && !session.profile && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => changeMode('complete')}>Back to profile setup</button>}
              {mode === 'register' && <p className="hint"><ShieldCheck size={15} aria-hidden="true" /> We use Firebase to secure your sign-in. A verified email and reviewed driver documents help protect our community.</p>}
              {mode === 'legacy' && <p className="hint">Original phone accounts have no email inbox for password resets. Use your existing password; a real email can be added after you sign in.</p>}
            </form>
          )}

          {mode === 'login' && <div className="stack auth-switch"><p className="muted">New around here? <button className="btn btn-ghost btn-sm" type="button" onClick={() => changeMode('register')} disabled={busy}>Create an account</button></p><button className="btn btn-secondary" type="button" onClick={() => changeMode('legacy')} disabled={busy}>Used the original app? Sign in with phone</button></div>}
          {mode === 'register' && <p className="muted">Already have an account? <button className="btn btn-ghost btn-sm" type="button" onClick={() => changeMode('login')} disabled={busy}>Sign in</button></p>}
          {session.user && <><button type="button" className="btn btn-ghost btn-sm" disabled={busy || Boolean(session.profile?.activeRideId)} onClick={() => perform(async () => { const result = await session.logout(); onClose(result); })}>Sign out of this account</button>{session.profile?.activeRideId && <p className="hint">Finish or cancel your active trip before signing out.</p>}</>}
          </>}
        </div>
      </section>
    </div>
  );
}
