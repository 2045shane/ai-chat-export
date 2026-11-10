import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PROBE = fileURLToPath(new URL('./helpers/sw-download-probe.mjs', import.meta.url));
const MARKDOWN = '# 可见甲\n\n## 用户\n\n请写一个例子：你好，世界。\n';

test('single export downloads markdown through a service-worker data URL', () => {
  const captured = runInServiceWorker({
    type: 'download',
    kind: 'markdown',
    filename: 'grok-可见甲.md',
    markdown: MARKDOWN,
  });
  assert.equal(captured.filename, 'grok-可见甲.md');
  assert.equal(captured.saveAs, false);
  const decoded = decodeDataUrl(captured.url);
  assert.match(decoded.header, /^text\/markdown;charset=utf-8;base64$/);
  assert.equal(new TextDecoder().decode(decoded.bytes), MARKDOWN);
});

test('batch export downloads a zip of at least two markdown files', () => {
  const first = '# 甲\n\n## 用户\n\n你好\n';
  const second = '# 乙\n\n## Gemini\n\n第二篇\n';
  const captured = runInServiceWorker({
    type: 'download',
    kind: 'zip',
    filename: '对话批量-2026-11-10.zip',
    files: [
      { filename: 'grok-甲.md', markdown: first },
      { filename: 'gemini-乙.md', markdown: second },
    ],
  });
  assert.equal(captured.filename, '对话批量-2026-11-10.zip');
  const decoded = decodeDataUrl(captured.url);
  assert.match(decoded.header, /^application\/zip;base64$/);
  const files = readStoredZip(decoded.bytes);
  assert.deepEqual(
    files.map((file) => file.name),
    ['grok-甲.md', 'gemini-乙.md'],
  );
  assert.equal(files[0].text, first);
  assert.equal(files[1].text, second);
});

test('service worker source does not use APIs missing from ServiceWorkerGlobalScope', () => {
  const source = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8');
  const banned = ['createObjectURL', 'revokeObjectURL', 'DOMParser', 'localStorage', 'document', 'window'];
  for (const name of banned) {
    assert.equal(source.includes(name), false, `src/background.js contains ${name}`);
  }
});

function runInServiceWorker(message) {
  const result = spawnSync(process.execPath, [PROBE, JSON.stringify(message)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function decodeDataUrl(url) {
  assert.equal(typeof url, 'string');
  assert.equal(url.startsWith('data:'), true);
  const comma = url.indexOf(',');
  assert.ok(comma > 'data:'.length);
  const header = url.slice('data:'.length, comma);
  assert.equal(header.endsWith(';base64'), true);
  return { header, bytes: Buffer.from(url.slice(comma + 1), 'base64') };
}

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    assert.equal(method, 0);
    files.push({ name, text: new TextDecoder().decode(bytes.slice(dataStart, dataStart + size)) });
    offset = dataStart + size;
  }
  return files;
}
