import { assessRuntime } from './runtime-config';

export const isEmulator = import.meta.env.VITE_USE_EMULATORS === 'true';
export const runtime = assessRuntime({
  isEmulator,
  hostname: window.location.hostname,
  protocol: window.location.protocol,
  origin: window.location.origin,
  secureContext: window.isSecureContext,
  emulatorHost: import.meta.env.VITE_EMULATOR_HOST || '',
  publicUrl: import.meta.env.VITE_PUBLIC_APP_URL || '',
  authContinueUrl: import.meta.env.VITE_AUTH_CONTINUE_URL || '',
});
