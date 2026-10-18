import { useEffect, useRef, useState } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { watchMessages, sendMessage } from '../api';
import { formatDate } from '../utils';

export default function ChatPanel({ ride, user, onError }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const active = ride && !['completed', 'cancelled'].includes(ride.status);
  useEffect(() => {
    setMessages([]); setText(''); setError('');
    if (!ride?.id || !user) return;
    return watchMessages(ride.id, setMessages, error => setError(error.message));
  }, [ride?.id, user?.uid]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages.length]);
  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || busy || !active) return;
    setBusy(true); setError('');
    try { await sendMessage(ride.id, text); setText(''); }
    catch (error) { setError(error.message); onErrorRef.current?.(error); }
    finally { setBusy(false); }
  }
  return <section className="chat-panel" aria-label="Ride messages">
    <div className="chat-heading"><MessageCircle size={18} /><strong>Trip chat</strong><span className="muted">Only you and your {ride?.passengerId === user?.uid ? 'driver' : 'passenger'}</span></div>
    <div className="chat-messages" role="log" aria-live="polite" aria-label="Messages">
      {!messages.length && <p className="empty-chat">A quick hello goes a long way. Share your pickup details here.</p>}
      {messages.map(message => <div className={`chat-bubble ${message.senderId === user?.uid ? 'chat-own' : ''}`} key={message.id}><p>{message.text}</p><time>{formatDate(message.createdAt)}</time></div>)}
      <div ref={endRef} />
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <form onSubmit={submit} className="chat-compose"><label className="sr-only" htmlFor="trip-message">Message</label><input id="trip-message" value={text} onChange={e => setText(e.target.value)} placeholder={active ? 'Add a pickup detail…' : 'This trip has ended'} maxLength={500} disabled={!active || busy} /><button className="icon-button" type="submit" aria-label="Send message" disabled={!text.trim() || busy || !active}><Send size={18} /></button></form>
  </section>;
}
