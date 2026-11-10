import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

test('content script bundles with checkout disabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ace-build-'));
  const outfile = join(dir, 'content.js');
  await build({
    entryPoints: ['src/content/main.js'],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    charset: 'utf8',
    outfile,
    logLevel: 'silent',
  });
  const text = await readFile(outfile, 'utf8');
  assert.match(text, /BUYOUT_CHECKOUT_ENABLED/);
  assert.match(text, /一次性买断（即将上线）/);
  assert.match(text, /有问题请联系我/);
  assert.equal(text.includes('all_urls'), false);
  assert.equal(text.includes('chrome.debugger'), false);
  assert.equal(text.includes('createObjectURL'), false);
  assert.match(text, /\/rest\/app-chat\/conversations/);
});
