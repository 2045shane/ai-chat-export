import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import test from 'node:test';
import {
  GROK_LIST_PATHS,
  collectGrokBulkExport,
  discoverGrokHistory,
  grokContentPaths,
  grokLoadResponsesPath,
  parseGrokConversationList,
} from '../src/extract/grok-bulk.js';
import { buildZip } from '../src/lib/zip.js';
import { loadFixture } from './helpers/dom.js';

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('list parser accepts several unverified JSON shapes', () => {
  assert.deepEqual(
    parseGrokConversationList({
      conversations: [{ conversationId: ID_A, title: '可见甲' }],
    }).map((item) => item.title),
    ['可见甲'],
  );
  assert.equal(parseGrokConversationList({ data: [{ uuid: 'secondid1', name: '第二篇' }] })[0].title, '第二篇');
  assert.equal(parseGrokConversationList([{ id: 'thirdid01', summary: '摘要' }])[0].title, '摘要');
});

test('grok list tries candidate endpoints in order and stops at the first usable payload', async () => {
  const doc = new JSDOM('<aside><button data-conversation-id="' + ID_B + '">侧栏不应入选</button></aside>', {
    url: 'https://grok.com/c/' + ID_A,
  }).window.document;
  const { fetchImpl, calls } = mockFetch({
    [GROK_LIST_PATHS[0]]: { status: 404, body: {} },
    [GROK_LIST_PATHS[1]]: { status: 200, body: { data: [{ uuid: ID_A, name: '接口甲' }] } },
    [GROK_LIST_PATHS[2]]: { status: 200, body: { conversations: [{ conversationId: ID_B, title: '不该请求到' }] } },
  });
  const found = await discoverGrokHistory({
    doc,
    fetchImpl,
    pageUrl: 'https://grok.com/c/' + ID_A,
  });
  assert.deepEqual(calls.map((call) => call.path), GROK_LIST_PATHS.slice(0, 2));
  assert.equal(calls.every((call) => call.method === 'GET' && call.credentials === 'include'), true);
  assert.equal(found.source, GROK_LIST_PATHS[1]);
  assert.deepEqual(found.items.map((item) => [item.id, item.title]), [[ID_A, '接口甲']]);
});

test('grok list falls back to non-link sidebar controls, then anchors', async () => {
  const doc = new JSDOM(
    `<aside>
      <button data-conversation-id="${ID_A}">星表</button>
      <div role="button" data-id="${ID_B}">第二篇</div>
      <div hidden><button data-conversation-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc">隐藏</button></div>
      <div data-testid="user-message"><button data-conversation-id="dddddddd-dddd-4ddd-8ddd-dddddddddddd">不要</button></div>
    </aside>`,
    { url: 'https://grok.com/' },
  ).window.document;
  const failed = mockFetch(Object.fromEntries(GROK_LIST_PATHS.map((path) => [path, { status: 500, body: {} }])));
  const sidebar = await discoverGrokHistory({
    doc,
    fetchImpl: failed.fetchImpl,
    pageUrl: 'https://grok.com/',
  });
  assert.equal(sidebar.source, 'sidebar');
  assert.deepEqual(sidebar.items.map((item) => item.title), ['星表', '第二篇']);

  const anchors = await discoverGrokHistory({
    doc: loadFixture('grok-synthetic.html', 'https://grok.com/c/11111111-1111-1111-1111-111111111111'),
    fetchImpl: failed.fetchImpl,
    pageUrl: 'https://grok.com/c/11111111-1111-1111-1111-111111111111',
  });
  assert.equal(anchors.source, 'anchors');
  assert.deepEqual(anchors.items.map((item) => item.title), ['可见甲', '可见乙']);
});

test('grok list failure names every strategy that was tried', async () => {
  const doc = new JSDOM('<main><p>没有侧栏</p></main>', { url: 'https://grok.com/' }).window.document;
  const { fetchImpl } = mockFetch({});
  const found = await discoverGrokHistory({ doc, fetchImpl, pageUrl: 'https://grok.com/' });
  assert.deepEqual(found.items, []);
  for (const path of GROK_LIST_PATHS) assert.match(found.message, new RegExp(escapeReg(path)));
  assert.match(found.message, /侧栏非链接节点/);
  assert.match(found.message, /a\[href\]/);
  assert.match(found.message, /No conversation list found/);
});

test('grok bulk fetches each id into a zip and keeps per-item failures', async () => {
  const okPaths = grokContentPaths(ID_A);
  const badPaths = grokContentPaths(ID_B);
  const routes = {
    [okPaths[0]]: {
      status: 200,
      body: {
        modifyTime: '2026-01-02T03:04:00Z',
        responses: [
          { sender: 'human', message: '你好' },
          { sender: 'assistant', message: '```javascript\nconst n = 1;\n```' },
        ],
      },
    },
  };
  for (const path of okPaths.slice(1)) routes[path] = { status: 404, body: {} };
  for (const path of badPaths) routes[path] = { status: 404, body: {} };
  const { fetchImpl, calls } = mockFetch(routes);
  const result = await collectGrokBulkExport(
    [
      { id: ID_A, title: '甲', url: `https://grok.com/c/${ID_A}` },
      { id: ID_B, title: '乙', url: `https://grok.com/c/${ID_B}` },
    ],
    { fetchImpl, exportedAt: '2026-11-10T01:02:03.000Z' },
  );
  assert.equal(calls.some((call) => call.path === okPaths[1]), false);
  assert.equal(result.failures.map((failure) => failure.title).join(','), '乙');
  assert.match(result.files[0].markdown, /## 用户\n\n你好/);
  assert.match(result.files[0].markdown, /## Grok\n\n```javascript\nconst n = 1;\n```/);
  assert.match(result.files[0].markdown, /时间: 2026-01-02T03:04:00Z/);
  assert.match(result.files[1].markdown, /没有读到正文，没有编造内容/);
  assert.match(result.files[1].markdown, /No message text was read/);
  assert.match(result.files[1].markdown, new RegExp(escapeReg(badPaths[0])));
  assert.doesNotMatch(result.files[1].markdown, /## 用户/);
  const packed = readStoredZip(buildZip(result.files.map((file) => ({ name: file.filename, data: file.markdown }))));
  assert.equal(packed.length, 2);
  assert.equal(packed[0].text, result.files[0].markdown);
  assert.equal(packed[1].text, result.files[1].markdown);
});

test('grok content falls through JSON shapes and only posts response ids', async () => {
  const paths = grokContentPaths(ID_A);
  const postPath = grokLoadResponsesPath(ID_A);
  const routes = {
    [paths[0]]: { status: 404, body: {} },
    [paths[1]]: {
      status: 200,
      body: { messages: [{ role: 'user', content: '甲' }, { role: 'model', text: '乙' }] },
    },
  };
  const first = mockFetch(routes);
  const shaped = await collectGrokBulkExport([{ id: ID_A, title: '甲', url: `https://grok.com/c/${ID_A}` }], {
    fetchImpl: first.fetchImpl,
    exportedAt: '2026-11-10T00:00:00.000Z',
  });
  assert.deepEqual(first.calls.map((call) => call.path), paths.slice(0, 2));
  assert.match(shaped.files[0].markdown, /## 用户\n\n甲/);
  assert.match(shaped.files[0].markdown, /## Grok\n\n乙/);

  const nodeRoutes = Object.fromEntries(paths.map((path) => [path, { status: 404, body: {} }]));
  nodeRoutes[paths[3]] = { status: 200, body: { responseNodes: [{ responseId: 'resp12345678' }] } };
  nodeRoutes[postPath] = {
    status: 200,
    body: { responses: [{ sender: 'human', message: '仅此一条' }] },
  };
  const second = mockFetch(nodeRoutes);
  const loaded = await collectGrokBulkExport([{ id: ID_A, title: '甲', url: `https://grok.com/c/${ID_A}` }], {
    fetchImpl: second.fetchImpl,
    exportedAt: '2026-11-10T00:00:00.000Z',
  });
  const post = second.calls.find((call) => call.method === 'POST');
  assert.equal(post.path, postPath);
  assert.equal(post.body, JSON.stringify({ responseIds: ['resp12345678'] }));
  assert.equal(post.body.includes('仅此一条'), false);
  assert.match(loaded.files[0].markdown, /仅此一条/);
});

test('README diagnostic lists the same unverified grok paths', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const path of GROK_LIST_PATHS) assert.equal(readme.includes(path), true, path);
  assert.equal(readme.includes('/response-node?includeThreads=true'), true);
  assert.equal(readme.includes('/load-responses'), true);
  assert.equal(readme.includes('credentials: \'include\''), true);
});

function mockFetch(routes) {
  const calls = [];
  async function fetchImpl(path, options = {}) {
    calls.push({
      path,
      method: options.method || 'GET',
      credentials: options.credentials,
      body: options.body,
    });
    const spec = routes[path] || { status: 404, body: {} };
    return {
      ok: spec.status >= 200 && spec.status < 300,
      status: spec.status,
      json: async () => spec.body,
    };
  }
  return { fetchImpl, calls };
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    files.push({ text: new TextDecoder().decode(bytes.slice(dataStart, dataStart + size)) });
    offset = dataStart + size;
  }
  return files;
}
