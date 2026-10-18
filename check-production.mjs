import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CALLABLES = ['saveProfile', 'uploadDriverFile', 'getDriverFile', 'submitDriverApplication', 'reviewDriver', 'setAvailability', 'publishLocation', 'requestRide', 'acceptRide', 'transitionRide', 'rateRide'];

export function assessBundle(scripts, projectId, browserConfig) {
  const source = scripts.join('\n');
  const hasValue = (value) => typeof value === 'string' && value.length > 0 && (source.includes(JSON.stringify(value)) || source.includes(`'${value}'`));
  return {
    hasScripts: scripts.length > 0,
    selectsDemoProject: source.includes('demo-keimoes-rides'),
    containsConfiguredProject: hasValue(projectId),
    containsPreservedConfig: browserConfig ? ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].every((key) => hasValue(browserConfig[key])) : null,
  };
}

export function assessDeployment(metadata, projectId) {
  return Boolean(metadata && metadata.firebaseMode === 'production' && metadata.projectId === projectId && metadata.region === 'us-central1' && typeof metadata.builtAt === 'string' && Number.isFinite(Date.parse(metadata.builtAt)));
}

export function assessCallable(status, body) {
  return status === 401 && body?.error?.status === 'UNAUTHENTICATED';
}

export function assessAuth(body, hostname) {
  return {
    available: Array.isArray(body?.authorizedDomains),
    hostnameAuthorized: hostname ? body?.authorizedDomains?.includes(hostname) === true : null,
  };
}

export function inspectPublishedHtml(html, site) {
  const origin = new URL(site).origin;
  const assets = [];
  let moduleCount = 0;
  let unsafeReferences = false;
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const attributes = {};
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attributes[attr[1].toLowerCase()] = attr[2] ?? attr[3];
    const isModule = match[1].toLowerCase() === 'script' && attributes.type?.toLowerCase() === 'module';
    const isPreload = match[1].toLowerCase() === 'link' && attributes.rel?.toLowerCase().split(/\s+/).includes('modulepreload');
    if (!isModule && !isPreload) continue;
    if (isModule) moduleCount++;
    const source = isModule ? attributes.src : attributes.href;
    if (!source) { unsafeReferences = true; continue; }
    try {
      const url = new URL(source, `${origin}/`);
      if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) { unsafeReferences = true; continue; }
      assets.push(url.href);
    } catch { unsafeReferences = true; }
  }
  return {
    validApp: /<title\b[^>]*>[^<]*Keimoes\s+Rides\b/i.test(html) && /<div\b[^>]*\bid\s*=\s*["']root["']/i.test(html) && moduleCount > 0 && !unsafeReferences,
    assets: [...new Set(assets)], unsafeReferences,
  };
}

async function boundedText(url, maxBytes, fetchImpl) {
  try {
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); return { status: response.status, error: 'response-too-large' }; }
    if (!response.body) return { status: response.status, text: '' };
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return { status: response.status, error: 'response-too-large' }; }
      chunks.push(Buffer.from(value));
    }
    return { status: response.status, text: Buffer.concat(chunks, size).toString('utf8') };
  } catch { return { status: 0, error: 'network-unavailable-or-redirect' }; }
}

export async function auditPublishedSite(site, config, fetchImpl = fetch) {
  const siteUrl = new URL(site);
  if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password) throw new Error('The public site URL must use HTTPS without credentials.');
  const origin = siteUrl.origin;
  const checks = [];
  const [metadataResponse, page] = await Promise.all([
    boundedText(`${origin}/deployment.json`, 16384, fetchImpl),
    boundedText(`${origin}/`, 262144, fetchImpl),
  ]);
  let metadata;
  try { metadata = JSON.parse(metadataResponse.text); } catch { /* No response bodies are logged. */ }
  checks.push({ name: 'Published deployment metadata', status: metadataResponse.status === 200 && !metadataResponse.error && assessDeployment(metadata, config.projectId) ? 'pass' : metadataResponse.status ? 'fail' : 'unknown', detail: metadataResponse.status === 200 && !metadataResponse.error && assessDeployment(metadata, config.projectId) ? 'The HTTPS site publishes the expected production project and callable region.' : 'The HTTPS site does not expose valid matching production deployment metadata.' });
  const html = inspectPublishedHtml(page.text || '', origin);
  const validPage = page.status === 200 && !page.error && html.validApp;
  checks.push({ name: 'Published app page', status: validPage ? 'pass' : page.status ? 'fail' : 'unknown', detail: validPage ? 'The HTTPS page contains the Keimoes Rides app and same-origin module entry.' : 'Could not confirm the published Keimoes Rides app page and same-origin module entry.' });
  if (!validPage) {
    checks.push({ name: 'Published Firebase bundle', status: 'unknown', detail: 'The app entry was not verified, so no JavaScript assets were fetched.' });
    return checks;
  }
  // One entry plus its direct modulepreloads, at most six files and 3 MiB each.
  // No JavaScript is executed and no recursive dependency crawl is performed.
  const assets = html.assets.slice(0, 6);
  const responses = await Promise.all(assets.map((url) => boundedText(url, 3 * 1024 * 1024, fetchImpl)));
  const complete = html.assets.length <= 6 && responses.every((response) => response.status === 200 && !response.error);
  const bundle = assessBundle(responses.filter((response) => response.status === 200 && !response.error).map((response) => response.text), config.projectId, config);
  const matches = bundle.hasScripts && !bundle.selectsDemoProject && bundle.containsConfiguredProject && bundle.containsPreservedConfig;
  checks.push({ name: 'Published Firebase bundle', status: bundle.selectsDemoProject ? 'fail' : matches && complete ? 'pass' : complete ? 'fail' : 'unknown', detail: bundle.selectsDemoProject ? 'The published app references the local demo Firebase project.' : matches && complete ? 'The published app retains the configured live Firebase values and contains no demo project reference in the inspected modules.' : complete ? 'The inspected published modules do not match the preserved Firebase configuration.' : 'The bounded module inspection could not confirm the published Firebase configuration.' });
  return checks;
}

async function scriptsUnder(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await scriptsUnder(filename));
    else if (entry.name.endsWith('.js')) results.push(await readFile(filename, 'utf8'));
  }
  return results;
}

async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
    let body = {};
    try { body = await response.json(); } catch { /* HTML error responses are not logged. */ }
    return { status: response.status, body };
  } catch (error) {
    // Do not log URL/error messages: the web API key belongs only in the request.
    return { status: 0, body: {}, networkError: error.name === 'TimeoutError' ? 'timeout' : 'network-unavailable' };
  }
}

export async function auditProduction({ root = path.resolve(fileURLToPath(new URL('..', import.meta.url))), dist = 'dist', site, offline = false } = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const config = JSON.parse(await readFile(path.join(root, 'src/firebase-config.json'), 'utf8'));
  if (!config.projectId || !config.apiKey || !config.authDomain) throw new Error('The preserved Firebase browser configuration is incomplete.');
  let siteUrl;
  if (site) {
    siteUrl = new URL(site);
    if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password) throw new Error('The public site URL must use HTTPS without credentials.');
  }
  try {
    const bundle = assessBundle(await scriptsUnder(path.resolve(root, dist)), config.projectId, config);
    add('Production bundle', bundle.hasScripts && !bundle.selectsDemoProject && bundle.containsConfiguredProject && bundle.containsPreservedConfig ? 'pass' : 'fail', bundle.selectsDemoProject ? 'This build selects local Firebase emulators. Rebuild with npm run build:production.' : !bundle.hasScripts ? 'No built JavaScript files found.' : !bundle.containsConfiguredProject ? 'The configured Firebase project is absent from the bundle.' : !bundle.containsPreservedConfig ? 'The bundle does not contain the preserved Firebase browser configuration.' : 'Configured live project and preserved browser configuration selected; no demo project reference.');
  } catch { add('Production bundle', 'fail', 'Build directory is missing or unreadable.'); }
  try {
    const metadata = JSON.parse(await readFile(path.resolve(root, dist, 'deployment.json'), 'utf8'));
    add('Build metadata', assessDeployment(metadata, config.projectId) ? 'pass' : 'fail', assessDeployment(metadata, config.projectId) ? 'Production mode, original project and callable region match.' : 'Deployment metadata does not match the original project, production mode or callable region.');
  } catch { add('Build metadata', 'fail', 'deployment.json is missing or invalid. Rebuild with npm run build:production.'); }
  if (offline) {
    add('Live services', 'unknown', 'Offline mode does not contact Firebase.');
    return checks;
  }

  if (siteUrl) checks.push(...await auditPublishedSite(siteUrl.href, config));

  const referer = siteUrl ? { Referer: siteUrl.href } : {};
  const auth = await safeFetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(config.apiKey)}`, { headers: referer });
  const authState = assessAuth(auth.body, siteUrl?.hostname);
  add('Firebase Auth project', auth.status === 200 && authState.available ? 'pass' : auth.status ? 'fail' : 'unknown', auth.status === 200 && authState.available ? 'Public project configuration is reachable.' : `Configuration request failed (${auth.status || auth.networkError}).`);
  if (siteUrl) add('Auth authorised site', authState.available ? authState.hostnameAuthorized ? 'pass' : 'warning' : 'unknown', authState.available ? authState.hostnameAuthorized ? 'The supplied HTTPS hostname is authorised.' : 'Add the exact hostname for OAuth/redirect flows and email continue URLs. Basic email/password sign-in does not universally require it.' : 'Could not inspect authorised domains.');

  const endpointResults = await Promise.all(CALLABLES.map(async (name) => {
    // An unauthenticated callable request fails before all database writes.
    const result = await safeFetch(`https://us-central1-${config.projectId}.cloudfunctions.net/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(siteUrl ? { Origin: siteUrl.origin } : {}) }, body: JSON.stringify({ data: {} }),
    });
    return { name, ...result };
  }));
  for (const result of endpointResults) add(`Callable ${result.name}`, assessCallable(result.status, result.body) ? 'pass' : result.status ? 'fail' : 'unknown', assessCallable(result.status, result.body) ? 'Deployed and rejects unauthenticated requests.' : `Expected the deployed authentication guard; received ${result.status || result.networkError}.`);
  add('Email delivery', 'unknown', 'Public configuration cannot prove delivery. Check the email/password provider and mail template settings with an administrator, then verify a real account on the HTTPS site.');
  add('Rules, indexes and expiry', 'unknown', 'Endpoint availability does not prove deployed rules/indexes or scheduler health. Validate these with project administrator access.');
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at === -1 ? undefined : args[at + 1]; };
  try {
    const checks = await auditProduction({ dist: option('--dist') || 'dist', site: option('--site'), offline: args.includes('--offline') });
    console.log(JSON.stringify({ mode: 'read-only', checks }, null, 2));
    process.exitCode = checks.some((check) => check.status === 'fail') ? 1 : 0;
  } catch (error) {
    console.error(JSON.stringify({ mode: 'read-only', error: error.message === 'Invalid URL' ? 'Invalid public site URL.' : ['The preserved Firebase browser configuration is incomplete.', 'The public site URL must use HTTPS without credentials.'].includes(error.message) ? error.message : 'Could not inspect the local production configuration.' }));
    process.exitCode = 1;
  }
}
