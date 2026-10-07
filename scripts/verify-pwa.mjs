// Verifies the PWA offline chain: pre-cache manifest vs. real build outputs,
// manifest icon paths, cache-name versioning and fetch fallback branches.
// Exits non-zero if any check fails.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

function readPublic(rel) {
  return readFileSync(path.join(publicDir, rel), 'utf8');
}

// --- Load files -------------------------------------------------------------
const swPath = path.join(publicDir, 'service-worker.js');
check('public/service-worker.js exists', existsSync(swPath));
const sw = existsSync(swPath) ? readPublic('service-worker.js') : '';

const manifestPath = path.join(publicDir, 'manifest.json');
check('public/manifest.json exists', existsSync(manifestPath));
const manifest = existsSync(manifestPath)
  ? JSON.parse(readPublic('manifest.json'))
  : { icons: [] };

const rollupConfig = readFileSync(path.join(root, 'rollup.config.js'), 'utf8');

// --- Version injection / cache naming ---------------------------------------
const versionMatch = sw.match(/const SW_VERSION = '([^']+)'/);
check('SW_VERSION is declared', !!versionMatch);
const swVersion = versionMatch ? versionMatch[1] : '';
check(
  'SW_VERSION injected by build (no __SW_VERSION__ placeholder)',
  !!swVersion && swVersion !== '__SW_VERSION__' && /^v\d+\.\d+\.\d+-\d{14}$/.test(swVersion),
  `actual: ${swVersion || '(none)'}`
);
check(
  'CACHE_NAME derived from SW_VERSION via shared prefix',
  /const CACHE_PREFIX = '[^']+'/.test(sw) &&
    /const CACHE_NAME = CACHE_PREFIX \+ '-' \+ SW_VERSION/.test(sw)
);

// --- Pre-cache manifest -------------------------------------------------------
const listMatch = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
check('PRECACHE_URLS list is declared', !!listMatch);
const precacheUrls = listMatch
  ? [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

// Build outputs declared in rollup.config.js must be pre-cached.
const bundleFile = (rollupConfig.match(/file:\s*'public\/([^']+)'/) || [])[1];
const outDir = bundleFile ? path.posix.dirname(bundleFile) : '';
const cssFile = (() => {
  const m = rollupConfig.match(/css\.write\('([^']+)'\)/);
  if (!m) return undefined;
  // css.write() resolves relative to the bundle output directory.
  return path.posix.normalize(path.posix.join(outDir, m[1]));
})();
for (const [label, rel] of [['bundle.js', bundleFile], ['bundle.css', cssFile]]) {
  check(`rollup.config.js declares ${label} output`, !!rel, rel || '(not found)');
  if (rel) {
    check(
      `pre-cache includes build output /${rel}`,
      precacheUrls.includes('/' + rel)
    );
    check(
      `build output exists on disk: public/${rel}`,
      existsSync(path.join(publicDir, rel))
    );
  }
}

// Core shell files.
for (const url of ['/index.html', '/offline.html', '/global.css', '/favicon.png', '/manifest.json']) {
  check(`pre-cache includes ${url}`, precacheUrls.includes(url));
}

// Every manifest icon must be pre-cached and present on disk.
check('manifest.json declares icons', manifest.icons.length > 0);
for (const icon of manifest.icons) {
  check(`pre-cache includes icon ${icon.src}`, precacheUrls.includes(icon.src));
  check(
    `icon exists on disk: ${icon.src}`,
    existsSync(path.join(publicDir, icon.src.replace(/^\//, '')))
  );
}

// Every pre-cached URL must resolve to a real file (no 404 offline).
for (const url of precacheUrls) {
  check(
    `pre-cached file exists: ${url}`,
    existsSync(path.join(publicDir, url.replace(/^\//, '')))
  );
}

// --- Fetch handler branches ---------------------------------------------------
check(
  'fetch: non-GET requests bypass the worker',
  /request\.method !== 'GET'/.test(sw)
);
check(
  'fetch: cross-origin requests bypass the worker',
  /url\.origin !== self\.location\.origin/.test(sw)
);
check(
  'fetch: navigations use network-first',
  /request\.mode === 'navigate'/.test(sw) &&
    /navigate[\s\S]{0,400}fetch\(request\)/.test(sw)
);
check(
  'fetch: navigation fallback serves /offline.html for any deep route',
  /const OFFLINE_URL = '\/offline\.html'/.test(sw) &&
    /\.catch\(async \(\) => \{[\s\S]*?caches\.match\(OFFLINE_URL/.test(sw)
);
check(
  'fetch: static assets use stale-while-revalidate',
  /caches\.match\(request/.test(sw) &&
    /cache\.put\(request, copy\)/.test(sw) &&
    /cached \|\| networkFetch/.test(sw)
);

// --- Lifecycle ----------------------------------------------------------------
check(
  'install pre-caches every PRECACHE_URLS entry',
  /cache\.addAll\(PRECACHE_URLS\)/.test(sw)
);
check(
  'activate deletes only non-current caches of this app',
  /key !== CACHE_NAME && key\.startsWith\(CACHE_PREFIX \+ '-'\)/.test(sw)
);
check(
  'index.html registers the service worker',
  /navigator\.serviceWorker\.register\(['"]\/service-worker\.js['"]\)/.test(
    readPublic('index.html')
  )
);

// --- Report -------------------------------------------------------------------
let failed = 0;
for (const r of results) {
  const tag = r.ok ? 'PASS' : 'FAIL';
  if (!r.ok) failed += 1;
  const detail = r.detail ? ` (${r.detail})` : '';
  console.log(`[${tag}] ${r.name}${detail}`);
}
console.log('');
console.log(`${results.length - failed}/${results.length} checks passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
