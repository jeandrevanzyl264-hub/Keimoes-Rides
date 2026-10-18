import { useCallback, useEffect, useRef, useState } from 'react';

const STALE_AFTER_MS = 45_000;

/** GPS is requested only after start() is explicitly called by the rider/driver. */
export default function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);
  const watchRef = useRef(null);
  const heartbeatRef = useRef(null);
  const visibilityRef = useRef(null);
  const singleFixPendingRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const clearWatch = useCallback(() => {
    if (watchRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    if (visibilityRef.current && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityRef.current);
    }
    visibilityRef.current = null;
    singleFixPendingRef.current = false;
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    clearWatch();
    if (!mountedRef.current) return;
    setTracking(false);
    setPosition(previous => previous ? { ...previous, stale: true } : null);
  }, [clearWatch]);

  const start = useCallback(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    clearWatch();
    setError('');
    setPosition(previous => previous ? { ...previous, stale: true } : null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setTracking(false);
      setError('This browser cannot share a GPS location. Choose your pickup on the map instead.');
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setTracking(false);
      setError('Location sharing needs HTTPS or localhost. Open the secure app address and try again.');
      return;
    }

    setTracking(true);
    const isCurrent = () => mountedRef.current && generation === generationRef.current;
    const receivePosition = result => {
        if (!isCurrent()) return;
        const { latitude, longitude, accuracy } = result.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setError('Your device returned an unreadable location. Please try again.');
          return;
        }
        if (!Number.isFinite(result.timestamp) || result.timestamp <= 0) {
          setError('Your device returned a location without a valid timestamp. Please try GPS again.');
          return;
        }
        const timestamp = result.timestamp;
        setPosition({
          lat: latitude,
          lng: longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          timestamp,
          stale: document.visibilityState === 'hidden' || Date.now() - timestamp > STALE_AFTER_MS,
        });
        setError('');
    };
    const receiveError = failure => {
        if (!isCurrent()) return;
        setPosition(previous => previous ? { ...previous, stale: true } : null);
        if (failure.code === 1) {
          generationRef.current += 1;
          clearWatch();
          setTracking(false);
          setError('Location permission is off. Allow location in your browser settings, then try again. You can also choose a pickup on the map.');
        } else if (failure.code === 2) {
          setError('Your device cannot find a GPS signal. Check that location services are on and try near a window or outdoors.');
        } else {
          setError('GPS is taking longer than expected. Keep this page open, or choose your pickup on the map.');
        }
    };
    // A stationary browser may not emit another watchPosition result. Ask the
    // native API for a genuinely fresh sample while the page is in the foreground.
    const requestFreshPosition = () => {
      if (!isCurrent() || document.visibilityState === 'hidden' || singleFixPendingRef.current) return;
      singleFixPendingRef.current = true;
      try {
        navigator.geolocation.getCurrentPosition(result => {
          if (!isCurrent()) return;
          singleFixPendingRef.current = false;
          receivePosition(result);
        }, failure => {
          if (!isCurrent()) return;
          singleFixPendingRef.current = false;
          receiveError(failure);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      } catch {
        singleFixPendingRef.current = false;
        receiveError({ code: 2 });
      }
    };
    try {
      watchRef.current = navigator.geolocation.watchPosition(receivePosition, receiveError, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 });
      if (!isCurrent()) { clearWatch(); return; }
      heartbeatRef.current = window.setInterval(requestFreshPosition, 20_000);
      visibilityRef.current = () => {
        if (!isCurrent()) return;
        if (document.visibilityState === 'hidden') setPosition(previous => previous ? { ...previous, stale: true } : null);
        else requestFreshPosition();
      };
      document.addEventListener('visibilitychange', visibilityRef.current);
    } catch {
      generationRef.current += 1;
      clearWatch();
      setTracking(false);
      setError('Location sharing could not start. Check your browser permissions and try again.');
    }
  }, [clearWatch]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      clearWatch();
    };
  }, [clearWatch]);

  useEffect(() => {
    if (!tracking) return undefined;
    const interval = window.setInterval(() => {
      setPosition(previous => {
        if (!previous || previous.stale || Date.now() - previous.timestamp <= STALE_AFTER_MS) return previous;
        return { ...previous, stale: true };
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [tracking]);

  return { position, error, tracking, start, stop };
}

export { useGeolocation };
