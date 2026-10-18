import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRuntime, isLoopbackHost, isPrivateHost } from '../src/runtime-config.js';

const local = { isEmulator: true, hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:5173', secureContext: true };
const live = { isEmulator: false, hostname: 'rides-example.netlify.app', protocol: 'https:', origin: 'https://rides-example.netlify.app', secureContext: true };

test('localhost development permits test accounts and uses the local email-action link', () => {
  const state = assessRuntime(local);
  assert.equal(state.canUseSensitiveFeatures, true);
  assert.equal(state.emulatorHost, '127.0.0.1');
  assert.equal(state.authContinueUrl, local.origin);
  assert.equal(state.publicUrl, '');
});

test('phone opening an insecure LAN address cannot enter credentials or use protected features', () => {
  const state = assessRuntime({ ...local, hostname: '192.168.0.106', origin: 'http://192.168.0.106:5173', secureContext: false, publicUrl: live.origin });
  assert.equal(state.canUseSensitiveFeatures, false);
  assert.match(state.securityWarning, /HTTPS/);
  assert.equal(state.emulatorHost, '192.168.0.106');
  assert.equal(state.publicUrl, live.origin);
  assert.equal(state.authContinueUrl, '');
});

test('a copied emulator build on public HTTPS blocks Firebase operations and explains the deployment error', () => {
  const state = assessRuntime({ ...live, isEmulator: true });
  assert.equal(state.canUseSensitiveFeatures, false);
  assert.match(state.configurationError, /production build/);
});

test('live email verification uses the existing Firebase handler without an arbitrary Netlify continuation URL', () => {
  const state = assessRuntime(live);
  assert.equal(state.canUseSensitiveFeatures, true);
  assert.equal(state.authContinueUrl, '');
  assert.equal(state.publicUrl, live.origin);
  assert.equal(state.configurationError, '');
});

test('public links and optional continuation URLs reject credentials, local hosts and HTTP', () => {
  for (const value of ['http://example.com', 'https://user:password@example.com', 'https://127.0.0.1', 'https://192.168.1.2', 'javascript:alert(1)', 'not a URL']) {
    const state = assessRuntime({ ...local, isEmulator: false, publicUrl: value, authContinueUrl: value });
    assert.equal(state.publicUrl, '', value);
    assert.equal(state.authContinueUrl, '', value);
  }
  assert.equal(assessRuntime({ ...live, authContinueUrl: 'https://rides-example.netlify.app/' }).authContinueUrl, live.origin);
});

test('host classification covers loopback, private IPv4 and private IPv6 without confusing public hosts', () => {
  for (const host of ['localhost', 'dev.localhost', '127.0.0.1', '[::1]']) assert.equal(isLoopbackHost(host), true, host);
  for (const host of ['10.0.0.2', '192.168.1.4', '172.16.0.2', '172.31.2.1', 'computer.local', '[fd12:3456::1]']) assert.equal(isPrivateHost(host), true, host);
  for (const host of ['rides.netlify.app', '172.32.1.2', 'example.com', 'example.localhost.com']) assert.equal(isPrivateHost(host), false, host);
});
