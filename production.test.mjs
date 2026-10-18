import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBundle, assessDeployment, assessAuth, assessCallable, inspectPublishedHtml, auditPublishedSite } from '../scripts/check-production.mjs';

test('a demo Firebase build cannot pass production readiness', () => {
  const build = assessBundle(['const projectId="demo-keimoes-rides";'], 'keimoes-rides');
  assert.equal(build.selectsDemoProject, true);
  assert.equal(build.containsConfiguredProject, false);
  assert.equal(assessBundle(['const projectId="keimoes-rides";'], 'keimoes-rides').selectsDemoProject, false);
  assert.equal(assessBundle([], 'keimoes-rides').hasScripts, false);
});

test('production bundle must retain every configured Firebase browser value', () => {
  const config = { apiKey: 'test-public-key', authDomain: 'project.firebaseapp.com', projectId: 'project', storageBucket: 'project.firebasestorage.app', messagingSenderId: '12345', appId: 'web:test-app-id' };
  const source = JSON.stringify(config);
  assert.equal(assessBundle([source], config.projectId, config).containsPreservedConfig, true);
  const wrong = { ...config, apiKey: 'different-public-key' };
  assert.equal(assessBundle([JSON.stringify(wrong)], config.projectId, config).containsPreservedConfig, false);
});

test('deployment metadata rejects demo mode, wrong projects, wrong regions and missing build timestamps', () => {
  const metadata = { firebaseMode: 'production', projectId: 'project', region: 'us-central1', builtAt: '2026-10-18T12:00:00.000Z' };
  assert.equal(assessDeployment(metadata, 'project'), true);
  for (const changes of [{ firebaseMode: 'emulator' }, { projectId: 'demo-project' }, { region: 'europe-west1' }, { builtAt: undefined }, { builtAt: 'invalid' }]) assert.equal(assessDeployment({ ...metadata, ...changes }, 'project'), false);
  assert.equal(assessDeployment(null, 'project'), false);
});

test('Auth authorisation requires the exact hostname', () => {
  const config = { authorizedDomains: ['keimoes-rides.firebaseapp.com', 'rides-example.netlify.app'] };
  assert.equal(assessAuth(config, 'rides-example.netlify.app').hostnameAuthorized, true);
  assert.equal(assessAuth(config, 'other-rides-example.netlify.app').hostnameAuthorized, false);
  assert.equal(assessAuth({}, 'rides-example.netlify.app').available, false);
});

test('callable readiness requires the exact deployed authentication guard', () => {
  assert.equal(assessCallable(401, { error: { status: 'UNAUTHENTICATED' } }), true);
  for (const status of [200, 400, 403, 404, 500]) assert.equal(assessCallable(status, { error: { status: 'UNAUTHENTICATED' } }), false);
  assert.equal(assessCallable(401, { error: { status: 'PERMISSION_DENIED' } }), false);
});

test('published-page inspection rejects landing pages and never follows cross-origin modules', () => {
  assert.equal(inspectPublishedHtml('<title>Netlify</title><h1>Welcome</h1>', 'https://rides.example').validApp, false);
  const html = '<title>Keimoes Rides</title><div id="root"></div><script type="module" src="https://unrelated.example/app.js"></script>';
  const inspected = inspectPublishedHtml(html, 'https://rides.example');
  assert.equal(inspected.validApp, false);
  assert.equal(inspected.unsafeReferences, true);
  assert.deepEqual(inspected.assets, []);
});

test('published-site audit validates actual hosted metadata and modules independently of local dist', async () => {
  const config = { apiKey: 'test-public-key', authDomain: 'project.firebaseapp.com', projectId: 'project', storageBucket: 'project.firebasestorage.app', messagingSenderId: '12345', appId: 'web:test-app-id' };
  const metadata = { firebaseMode: 'production', projectId: 'project', region: 'us-central1', builtAt: '2026-10-18T12:00:00.000Z' };
  const html = '<title>Keimoes Rides</title><link rel="modulepreload" href="/assets/vendor.js"><div id="root"></div><script type="module" src="/assets/app.js"></script>';
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    if (url.endsWith('/deployment.json')) return new Response(JSON.stringify(metadata));
    if (url.endsWith('/assets/app.js')) return new Response(`const config=${JSON.stringify(config)};`);
    if (url.endsWith('/assets/vendor.js')) return new Response('const vendor=true;');
    return new Response(html);
  };
  const checks = await auditPublishedSite('https://rides.example', config, fakeFetch);
  assert.ok(checks.every((check) => check.status === 'pass'));
  assert.equal(requests.length, 4);
  assert.ok(requests.every((url) => url.startsWith('https://rides.example/')));
  const wrongSite = await auditPublishedSite('https://wrong.example', config, async () => new Response('<title>Netlify</title><h1>Welcome</h1>'));
  assert.equal(wrongSite[0].status, 'fail');
  assert.equal(wrongSite[1].status, 'fail');
  assert.equal(wrongSite[2].status, 'unknown');
  const demo = await auditPublishedSite('https://rides.example', config, async (url) => url.endsWith('/deployment.json') ? new Response(JSON.stringify({ ...metadata, firebaseMode: 'emulator' })) : url.endsWith('/assets/app.js') ? new Response('const projectId="demo-keimoes-rides";') : url.endsWith('/assets/vendor.js') ? new Response('const vendor=true;') : new Response(html));
  assert.equal(demo[0].status, 'fail');
  assert.equal(demo[2].status, 'fail');
  const oversized = await auditPublishedSite('https://rides.example', config, async (url) => url.endsWith('/assets/vendor.js') ? new Response('', { headers: { 'content-length': String(4 * 1024 * 1024) } }) : fakeFetch(url));
  assert.equal(oversized[2].status, 'unknown', 'an incomplete bounded asset audit cannot pass');
});
