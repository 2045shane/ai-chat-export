import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';
import { extractGrok, listGrokHistory } from '../src/extract/grok.js';
import { conversationToMarkdown } from '../src/lib/markdown.js';
import { loadFixture } from './helpers/dom.js';

const PAGE = 'https://grok.com/c/11111111-1111-1111-1111-111111111111';

test('grok synthetic fixture keeps roles, code, table, and link', () => {
  const doc = loadFixture('grok-synthetic.html', PAGE);
  const convo = extractGrok(doc, PAGE);
  assert.equal(convo.platform, 'grok');
  assert.equal(convo.title, '可见甲');
  assert.equal(convo.time, null);
  assert.deepEqual(
    convo.messages.map((message) => message.role),
    ['user', 'assistant'],
  );
  assert.match(convo.messages[0].markdown, /请写一个例子/);
  const body = convo.messages[1].markdown;
  assert.match(body, /\[文档\]\(https:\/\/example\.com\/docs\)/);
  assert.match(body, /## 示例/);
  assert.match(body, /```javascript\nconst n = 1;\n```/);
  assert.match(body, /\| 语言 \| 结果 \|/);
  assert.ok(body.includes('a\\|b'));
  const md = conversationToMarkdown({ ...convo, exportedAt: '2026-11-10T01:02:03.000Z' });
  assert.match(md, /^# 可见甲\n/);
  assert.match(md, /## 用户\n\n请写一个例子/);
  assert.match(md, /## Grok\n/);
  assert.match(md, /- 导出时间: 2026-11-10T01:02:03\.000Z/);
  assert.doesNotMatch(md, /^- 时间:/m);
});

test('grok history lists visible sidebar chats only', () => {
  const doc = loadFixture('grok-synthetic.html', PAGE);
  const items = listGrokHistory(doc, PAGE);
  assert.deepEqual(
    items.map((item) => item.title),
    ['可见甲', '可见乙'],
  );
  assert.equal(items[1].url, 'https://grok.com/c/22222222-2222-2222-2222-222222222222');
});

test('grok does not invent a title or a code fence', () => {
  const doc = new JSDOM('<div data-testid="user-message"><p>你好</p></div>', {
    url: 'https://grok.com/',
  }).window.document;
  const convo = extractGrok(doc, 'https://grok.com/');
  assert.equal(convo.title, null);
  assert.equal(convo.time, null);
  const md = conversationToMarkdown(convo);
  assert.doesNotMatch(md, /^# /m);
  assert.doesNotMatch(md, /```/);
  assert.doesNotMatch(md, /\| --- \|/);
  assert.match(md, /## 用户\n\n你好/);
});

test('grok message-bubble fallback keeps user and assistant apart', () => {
  const html = `
    <div class="items-end"><div class="message-bubble"><p>问句</p></div></div>
    <div><div class="message-bubble"><p>答句</p></div></div>
  `;
  const doc = new JSDOM(html, { url: 'https://grok.com/c/abcdefgh' }).window.document;
  const convo = extractGrok(doc, 'https://grok.com/c/abcdefgh');
  assert.deepEqual(
    convo.messages.map((message) => message.role),
    ['user', 'assistant'],
  );
});

test('grok keeps a datetime that is actually on the page', () => {
  const doc = new JSDOM(
    '<time datetime="2026-01-02T03:04:00Z"></time><div data-testid="user-message"><p>你好</p></div>',
    { url: 'https://grok.com/c/abcdefgh' },
  ).window.document;
  assert.equal(extractGrok(doc, 'https://grok.com/c/abcdefgh').time, '2026-01-02T03:04:00Z');
});
