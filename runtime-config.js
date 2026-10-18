export function isLoopbackHost(hostname = '') {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);
}

export function isPrivateHost(hostname = '') {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return isLoopbackHost(host) || /^10\.\d+\.\d+\.\d+$/.test(host) || /^192\.168\.\d+\.\d+$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) || host.endsWith('.local') || /^(fc|fd)[a-f\d]{2}:/.test(host);
}

function securePublicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || isPrivateHost(url.hostname)) return '';
    return url.origin;
  } catch { return ''; }
}

export function assessRuntime({ isEmulator, hostname = 'localhost', protocol = 'http:', origin = 'http://localhost:5173', secureContext, emulatorHost = '', publicUrl = '', authContinueUrl = '' }) {
  const isLocalhost = isLoopbackHost(hostname);
  const privateHost = isPrivateHost(hostname);
  const isSecureContext = secureContext === undefined ? protocol === 'https:' || isLocalhost : secureContext === true;
  const publishedUrl = securePublicUrl(publicUrl) || (protocol === 'https:' && !privateHost ? securePublicUrl(origin) : '');
  let configurationError = '';
  if (isEmulator && !privateHost) configurationError = 'This hosted copy was built for local Firebase emulators. It cannot sign you in. The owner must publish the production build.';
  const securityWarning = !isSecureContext
    ? 'You opened a local HTTP development address. Do not enter a real password here. Open the published HTTPS Keimoes Rides app for secure sign-in, GPS and app installation.'
    : '';
  let continuation = '';
  if (isEmulator && isLocalhost) continuation = origin;
  else if (!isEmulator && authContinueUrl) continuation = securePublicUrl(authContinueUrl);
  return {
    isSecureContext,
    isLocalhost,
    isPrivateHost: privateHost,
    canUseSensitiveFeatures: isSecureContext && !configurationError,
    configurationError,
    securityWarning,
    emulatorHost: emulatorHost.trim() || (isLocalhost ? '127.0.0.1' : hostname),
    publicUrl: publishedUrl,
    authContinueUrl: continuation,
  };
}
