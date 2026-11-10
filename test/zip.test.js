import assert from 'node:assert/strict';
import test from 'node:test';
import { buildZip, crc32 } from '../src/lib/zip.js';

test('crc32 matches the standard check vector', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes), 0xcbf43926);
});

test('zip stores markdown files and nothing else', () => {
  const bytes = buildZip(
    [
      { name: 'grok-可见甲.md', data: '# 可见甲\n\n## 用户\n\n你好\n' },
      { name: 'nested/gemini-第二篇.md', data: '# 第二篇\n' },
    ],
    new Date('2026-11-10T00:00:00Z'),
  );
  const files = readStoredZip(bytes);
  assert.deepEqual(
    files.map((file) => file.name),
    ['grok-可见甲.md', 'gemini-第二篇.md'],
  );
  assert.match(files[0].text, /## 用户/);
  assert.match(files[1].text, /# 第二篇/);
  assert.ok(files.every((file) => file.name.endsWith('.md')));
  assert.ok(files.every((file) => (file.flags & 0x0800) !== 0));
});

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    assert.equal(method, 0);
    files.push({
      name,
      flags,
      text: new TextDecoder().decode(bytes.slice(dataStart, dataStart + size)),
    });
    offset = dataStart + size;
  }
  assert.ok(files.length > 0);
  return files;
}
