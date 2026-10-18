import { useEffect, useState } from 'react';
import { ImageOff, UserRound } from 'lucide-react';
import { getDocument } from '../api';

export default function PrivatePhoto({ path, alt = 'Driver portrait', className = '', document = false, onLoad }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectURL;
    setSrc(null); setFailed(false);
    if (path) getDocument(path).then(url => {
      objectURL = url;
      if (cancelled) URL.revokeObjectURL(url);
      else setSrc(url);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objectURL) URL.revokeObjectURL(objectURL); };
  }, [path]);
  if (src && !failed) return <img src={src} alt={alt} className={className} onLoad={onLoad} onError={() => setFailed(true)} />;
  return <span className={`photo-placeholder ${className}`} role="img" aria-label={failed ? `${alt} unavailable` : `${alt} loading`}>
    {failed ? <ImageOff size={document ? 32 : 22} /> : <UserRound size={document ? 32 : 22} />}
    {document && <span>{failed ? 'Image unavailable. Do not approve until it can be reviewed.' : 'Loading private image…'}</span>}
  </span>;
}
