import { useEffect, useState } from 'react';
import { Camera, Check, CheckCircle2, FileCheck2, LockKeyhole, ShieldCheck, Upload, Clock3, AlertCircle } from 'lucide-react';
import { api, uploadDriverFile } from '../api';
import PrivatePhoto from './PrivatePhoto';

const photoFields = [
  { key: 'portrait', title: 'A clear face photo', detail: 'Face the camera in good light. No sunglasses, filters or other people.', icon: Camera, capture: 'user' },
  { key: 'license', title: 'Driving licence', detail: 'Show your photo and all details clearly. Check that it is in date.', icon: FileCheck2, capture: 'environment' },
  { key: 'permit', title: 'Passenger transport documents', detail: 'Upload your valid PrDP / passenger transport authorisation for review.', icon: FileCheck2, capture: 'environment' }
];

function PhotoInput({ item, file, onChange, disabled }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const Icon = item.icon;
  return <label className={`upload-card ${file ? 'upload-complete' : ''}`}>
    {preview ? <img src={preview} alt={`Selected ${item.title.toLowerCase()}`} className="upload-preview" /> : <span className="upload-icon"><Icon size={24} /></span>}
    <span className="upload-copy"><strong>{item.title}</strong><span>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : item.detail}</span><span className="upload-action">{file ? <Check size={14} /> : <Upload size={14} />}{file ? 'Replace photo' : 'Take or choose photo'}</span></span>
    <input type="file" accept="image/jpeg,image/png,image/webp" capture={item.capture} onChange={e => onChange(e.target.files?.[0] || null)} disabled={disabled} aria-label={item.title} />
  </label>;
}

export default function DriverApplication({ session, onError, onSuccess }) {
  const application = session.application;
  const [vehicle, setVehicle] = useState(application?.vehicle || { model: '', color: '', plate: '', seats: 4 });
  const [files, setFiles] = useState({ portrait: null, license: null, permit: null });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const status = application?.status || 'draft';
  const locked = status === 'approved' || status === 'pending';
  useEffect(() => { if (application?.vehicle) setVehicle(application.vehicle); }, [application?.vehicle?.model, application?.vehicle?.plate]);
  function updateVehicle(key, value) { setVehicle(current => ({ ...current, [key]: value })); }
  function updateFile(key, file) {
    setError('');
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('Choose a JPG, PNG or WebP photo under 5 MB.'); return; }
    setFiles(current => ({ ...current, [key]: file }));
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!session.user?.emailVerified) { setError('Verify your email and refresh your account before uploading verification documents.'); return; }
    if (!consent) { setError('Please consent to the manual review.'); return; }
    if (photoFields.some(({ key }) => !files[key] && !application?.[`${key}Path`])) { setError('Add all three photos before submitting your application.'); return; }
    setBusy(true); setError('');
    try {
      for (const item of photoFields) if (files[item.key]) {
        setStage(`Uploading ${item.title.toLowerCase()}…`);
        await uploadDriverFile(item.key, files[item.key]);
      }
      setStage('Sending your application for review…');
      await api.submitDriverApplication({ vehicle: { ...vehicle, plate: vehicle.plate.trim().toUpperCase(), seats: Number(vehicle.seats) }, consent: true });
      setFiles({ portrait: null, license: null, permit: null });
      onSuccess?.('Application submitted. An operator will review your documents before you can take rides.');
    } catch (error) { setError(error.message); onError?.(error); }
    finally { setBusy(false); setStage(''); }
  }
  return <section className="verification-panel stack">
    <div className="verification-intro"><span className="verification-icon"><ShieldCheck size={26} /></span><div><span className="eyebrow">DRIVER PARTNER</span><h2>A familiar face. A trusted ride.</h2><p className="muted">Your portrait, vehicle and documents help passengers know who is picking them up.</p></div></div>
    {status === 'approved' && <div className="notice notice-success"><CheckCircle2 size={20} /><div><strong>Manually reviewed and approved</strong><p>Your approved portrait and vehicle are visible to passengers. Your licence and transport documents remain private.</p></div></div>}
    {status === 'pending' && <div className="notice"><Clock3 size={20} /><div><strong>Your application is awaiting review</strong><p>You can’t go online until an operator approves it. Files are locked while they’re being reviewed.</p></div></div>}
    {status === 'rejected' && <div className="notice notice-error"><AlertCircle size={20} /><div><strong>Your application needs an update</strong><p>{application.reviewReason || 'Please review your details and resubmit clear, current documents.'}</p></div></div>}
    {locked ? <div className="card approved-vehicle"><PrivatePhoto path={application.portraitPath} alt="Your submitted driver portrait" className="verification-portrait" /><div><strong>{vehicle.color} {vehicle.model}</strong><p className="registration-plate">{vehicle.plate}</p><span className="muted">{vehicle.seats} passenger seats · {status === 'pending' ? 'Review pending' : 'Approved vehicle'}</span></div></div> : <form onSubmit={submit} className="stack">
      <div className="form-grid"><label className="field"><span>Vehicle make &amp; model</span><input required maxLength={80} placeholder="e.g. Toyota Corolla" value={vehicle.model} onChange={e => updateVehicle('model', e.target.value)} disabled={busy} /></label><label className="field"><span>Vehicle colour</span><input required maxLength={30} placeholder="e.g. Silver" value={vehicle.color} onChange={e => updateVehicle('color', e.target.value)} disabled={busy} /></label><label className="field"><span>Registration plate</span><input required maxLength={20} placeholder="e.g. ABC 123 NC" value={vehicle.plate} onChange={e => updateVehicle('plate', e.target.value.toUpperCase())} disabled={busy} /></label><label className="field"><span>Passenger seats</span><select value={vehicle.seats} onChange={e => updateVehicle('seats', Number(e.target.value))} disabled={busy}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'passenger' : 'passengers'}</option>)}</select></label></div>
      <div className="upload-grid">{photoFields.map(item => <PhotoInput item={item} key={item.key} file={files[item.key]} onChange={file => updateFile(item.key, file)} disabled={busy} />)}</div>
      <p className="hint"><LockKeyhole size={14} /> JPG, PNG or WebP · Up to 5 MB each. Your documents are private to you and authorised reviewers. Only your approved portrait is shown to signed-in passengers.</p>
      <label className="checkbox-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required disabled={busy} /><span>I confirm these details and documents are mine and current. I consent to manual review by Keimoes Rides and to my approved portrait being shown to passengers.</span></label>
      <p className="hint">This is a document and photo review, not automated face recognition or proof of liveness. Operators must confirm legal licensing, insurance and passenger transport requirements before approval.</p>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy || !session.user?.emailVerified} type="submit">{busy ? stage : 'Submit for driver review'}{!busy && <ShieldCheck size={18} />}</button>
    </form>}
  </section>;
}
