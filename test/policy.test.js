import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { platformFromHostname } from '../src/extract/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('manifest is limited to Grok and Gemini', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.host_permissions, ['https://grok.com/*', 'https://gemini.google.com/*']);
  assert.deepEqual(manifest.permissions, ['storage', 'downloads']);
  const matches = manifest.content_scripts.flatMap((script) => script.matches);
  assert.deepEqual(matches, ['https://grok.com/*', 'https://gemini.google.com/*']);
  const text = JSON.stringify(manifest);
  assert.equal(text.includes('all_urls'), false);
  assert.equal(text.includes('debugger'), false);
  assert.equal(platformFromHostname('grok.com'), 'grok');
  assert.equal(platformFromHostname('gemini.google.com'), 'gemini');
  assert.equal(platformFromHostname('x.com'), null);
  assert.equal(platformFromHostname('www.grok.com'), null);
  assert.equal(platformFromHostname('chatgpt.com'), null);
});

test('current-chat export is not metered', () => {
  const main = readFileSync(new URL('../src/content/main.js', import.meta.url), 'utf8');
  const current = main.slice(main.indexOf('async function exportCurrent'), main.indexOf('async function exportSelected'));
  const selected = main.slice(main.indexOf('async function exportSelected'), main.indexOf('async function resumeJob'));
  assert.equal(current.includes('nextUsage'), false);
  assert.match(selected, /if \(!licensed\) await writeUsage\(nextUsage/);
});

test('shipping files have no payment client, upload call, or broad host', () => {
  const files = [
    ...walk(join(ROOT, 'src')),
    join(ROOT, 'manifest.json'),
    join(ROOT, 'package.json'),
    join(ROOT, 'README.md'),
    join(ROOT, 'FEATURE_MAP.md'),
  ];
  const forbidden = [
    /creem/i,
    /\bdodo\b/i,
    /stripe/i,
    /lemonsqueezy/i,
    /gumroad/i,
    /paypal/i,
    /\bpaddle\b/i,
    /<all_urls>/,
    /chrome\.debugger/,
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /\bWebSocket\b/,
  ];
  const allowedUrl =
    /^(https:\/\/grok\.com|https:\/\/gemini\.google\.com|https:\/\/www\.xiaohongshu\.com\/search_result\?keyword=)/;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.source === '\\bfetch\\s*\\(' && file.endsWith(`${sep()}README.md`)) continue;
      assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
    }
    for (const url of text.match(/https?:\/\/[^\s"'`)<>]+/g) || []) {
      assert.equal(allowedUrl.test(url), true, `${file} has ${url}`);
    }
  }
  const bulk = readFileSync(join(ROOT, 'src/extract/grok-bulk.js'), 'utf8');
  assert.equal(bulk.includes('fetch('), false);
  assert.match(bulk, /credentials:\s*'include'/);
  const background = readFileSync(join(ROOT, 'src/background.js'), 'utf8');
  assert.equal(background.includes('fetch'), false);
  const current = readFileSync(join(ROOT, 'src/content/main.js'), 'utf8');
  const single = current.slice(current.indexOf('async function exportCurrent'), current.indexOf('async function exportSelected'));
  assert.equal(single.includes('discoverGrokHistory'), false);
  assert.equal(single.includes('collectGrokBulkExport'), false);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), ['esbuild', 'jsdom']);
});

function sep() {
  return join('a', 'b').includes('\\') ? '\\' : '/';
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else if (/\.(js|json|html|md|css)$/.test(name)) acc.push(path);
  }
  return acc;
}
