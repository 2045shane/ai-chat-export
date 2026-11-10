import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';
import { extractGemini, listGeminiHistory } from '../src/extract/gemini.js';
import { conversationToMarkdown } from '../src/lib/markdown.js';
import { loadFixture } from './helpers/dom.js';

const PAGE = 'https://gemini.google.com/app/aaaaaaaaaaaaaaaa';

test('gemini synthetic fixture keeps roles, code language, table, and link', () => {
  const doc = loadFixture('gemini-synthetic.html', PAGE);
  const convo = extractGemini(doc, PAGE);
  assert.equal(convo.platform, 'gemini');
  assert.equal(convo.title, '星表草稿');
  assert.equal(convo.time, null);
  assert.deepEqual(
    convo.messages.map((message) => message.role),
    ['user', 'assistant'],
  );
  assert.match(convo.messages[0].markdown, /解释表格和代码/);
  const body = convo.messages[1].markdown;
  assert.match(body, /\[说明\]\(https:\/\/example\.com\/gem\)/);
  assert.match(body, /## 步骤/);
  assert.match(body, /```python\nprint\("hi"\)\n```/);
  assert.doesNotMatch(body, /复制/);
  assert.match(body, /\| 列 \| 值 \|/);
  assert.match(body, /\| 甲 \| 1 \|/);
  const md = conversationToMarkdown({ ...convo, exportedAt: '2026-11-10T01:02:03.000Z' });
  assert.match(md, /^# 星表草稿\n/);
  assert.match(md, /## 用户\n\n解释表格和代码/);
  assert.match(md, /## Gemini\n/);
  assert.doesNotMatch(md, /^- 时间:/m);
});

test('gemini history lists visible conversations only', () => {
  const doc = loadFixture('gemini-synthetic.html', PAGE);
  const items = listGeminiHistory(doc, PAGE);
  assert.deepEqual(
    items.map((item) => item.title),
    ['星表草稿', '第二篇'],
  );
  assert.equal(items[0].url, 'https://gemini.google.com/app/aaaaaaaaaaaaaaaa');
});

test('gemini without a marked title does not invent one', () => {
  const html = '<user-query><div class="query-text"><p>只是文字</p></div></user-query>';
  const doc = new JSDOM(html, { url: 'https://gemini.google.com/app' }).window.document;
  const convo = extractGemini(doc, 'https://gemini.google.com/app');
  assert.equal(convo.title, null);
  assert.equal(convo.messages.length, 1);
  const md = conversationToMarkdown(convo);
  assert.doesNotMatch(md, /^# /m);
  assert.doesNotMatch(md, /```/);
});

test('gemini empty visible list is an empty state, not an error', () => {
  const doc = new JSDOM('<main><p>没有侧栏</p></main>', {
    url: 'https://gemini.google.com/app',
  }).window.document;
  assert.deepEqual(listGeminiHistory(doc, 'https://gemini.google.com/app'), []);
});
