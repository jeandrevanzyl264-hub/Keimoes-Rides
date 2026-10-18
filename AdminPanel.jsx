import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ShieldCheck, Clock3, XCircle } from 'lucide-react';
import { api, watchApplications, watchProfile } from '../api';
import { formatDate } from '../utils';
import PrivatePhoto from './PrivatePhoto';

function ReviewCard({ application, onError, onSuccess }) {
  const [profile, setProfile] = useState(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loaded, setLoaded] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = application.uid || application.id;
  useEffect(() => watchProfile(uid, setProfile, error => setError(error.message)), [uid]);
  const photosReady = ['portrait', 'license', 'permit'].every(key => loaded[key]);
  async function review(decision) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api.reviewDriver({ driverId: uid, decision, reason });
      onSuccess?.(decision === 'approved' ? 'Driver approved. Their reviewed profile is now available for rides.' : 'Application returned with your feedback.');
    } catch (error) { setError(error.message); onError?.(error); }
    finally { setBusy(false); }
  }
  return <article className="review-card card stack">
    <div className="review-card-heading"><div><h3>{profile?.name || 'Driver application'}</h3><p className="muted">{profile?.phone || 'Private contact loading…'} · {formatDate(application.submittedAt)}</p></div><span className="chip"><Clock3 size={13} /> Pending</span></div>
    <div className="review-vehicle"><strong>{application.vehicle?.color} {application.vehicle?.model}</strong><span className="registration-plate">{application.vehicle?.plate}</span><span>{application.vehicle?.seats} passenger seats</span></div>
    <div className="review-documents">{[['portrait', 'Face photo'], ['license', 'Driving licence'], ['permit', 'Passenger transport document']].map(([key, label]) => <figure key={key}><PrivatePhoto path={application[`${key}Path`]} alt={label} className={`review-image review-image-${key}`} document onLoad={() => setLoaded(current => ({ ...current, [key]: true }))} /><figcaption>{label}</figcaption></figure>)}</div>
    <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={!photosReady || busy} /><span>I have compared the face photo with the applicant’s identity/licence, checked the documents and their validity, and verified the vehicle and legal passenger transport requirements. This is a manual operator review.</span></label>
    <label className="field"><span>Review feedback <small>(required if declining)</small></span><textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={2} placeholder="Explain clearly what the driver needs to update…" disabled={busy} /></label>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    <div className="review-actions"><button className="btn btn-primary" disabled={busy || !confirmed || !photosReady} onClick={() => review('approved')}><CheckCircle2 size={17} />{busy ? 'Saving…' : 'Approve driver'}</button><button className="btn btn-secondary" disabled={busy || reason.trim().length < 5} onClick={() => review('rejected')}><XCircle size={17} />Request changes</button></div>
  </article>;
}

export default function AdminPanel({ session, onError, onSuccess }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const callbacks = useRef({ onError, onSuccess }); callbacks.current = { onError, onSuccess };
  useEffect(() => {
    setApplications([]); setLoading(true); setError('');
    if (!session.isAdmin) return;
    return watchApplications(rows => { setApplications(rows); setLoading(false); }, error => { setError(error.message); setLoading(false); });
  }, [session.isAdmin, session.user?.uid]);
  if (!session.isAdmin) return <p className="notice notice-error">Only an authorised operator can review driver applications.</p>;
  return <section className="stack admin-panel"><div className="section-heading"><div><span className="eyebrow">OPERATOR WORKSPACE</span><h2>Driver review desk</h2><p className="muted">Read every document. A badge should mean someone has actually checked.</p></div><ShieldCheck size={28} /></div>
    <p className="notice">Approval is a manual document review. It does not provide automated identity, criminal record or liveness verification.</p>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {loading ? <p className="muted">Loading applications…</p> : !applications.length && !error ? <div className="empty-state"><CheckCircle2 size={32} /><h3>All caught up</h3><p>New driver applications will appear here when they’re submitted.</p></div> : applications.map(application => <ReviewCard application={application} key={application.uid || application.id} onError={error => callbacks.current.onError?.(error)} onSuccess={message => callbacks.current.onSuccess?.(message)} />)}
  </section>;
}
