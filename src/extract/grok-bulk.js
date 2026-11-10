import { listGrokHistory } from './grok.js';
import { markdownFilename } from '../lib/filename.js';
import { conversationToMarkdown } from '../lib/markdown.js';
import { isRenderedVisible } from '../lib/visible.js';

/**
 * UNVERIFIED. Public writeups mention these grok.com paths. They were not
 * called from this environment. Only the first list page is requested.
 */
export const GROK_LIST_PATHS = [
  '/rest/app-chat/conversations?pageSize=60',
  '/rest/app-chat/conversations',
  '/rest/app-chat/conversations_v2?pageSize=60',
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function grokContentPaths(id) {
  const safe = encodeURIComponent(id);
  return [
    `/rest/app-chat/conversations/${safe}/responses`,
    `/rest/app-chat/conversations_v2/${safe}`,
    `/rest/app-chat/conversations/${safe}`,
    `/rest/app-chat/conversations/${safe}/response-node?includeThreads=true`,
  ];
}

export function grokLoadResponsesPath(id) {
  return `/rest/app-chat/conversations/${encodeURIComponent(id)}/load-responses`;
}

export async function discoverGrokHistory({ doc, fetchImpl, pageUrl = 'https://grok.com/' }) {
  const attempts = [];
  if (isGrokPage(pageUrl) && typeof fetchImpl === 'function') {
    for (const path of GROK_LIST_PATHS) {
      const result = await readJson(fetchImpl, path);
      attempts.push({ label: `GET ${path}`, detail: result.detail });
      if (!result.data) continue;
      const items = parseGrokConversationList(result.data);
      if (items.length) return { items, source: path, attempts, message: '' };
    }
  } else {
    attempts.push({ label: 'GET /rest/app-chat/conversations', detail: '当前不是 grok.com，已跳过' });
  }

  const sidebar = listGrokSidebarControls(doc);
  attempts.push({ label: '侧栏非链接节点', detail: `${sidebar.length} 条` });
  if (sidebar.length) return { items: sidebar, source: 'sidebar', attempts, message: '' };

  const anchors = listGrokHistory(doc, pageUrl);
  attempts.push({ label: 'a[href]', detail: `${anchors.length} 条` });
  if (anchors.length) return { items: anchors, source: 'anchors', attempts, message: '' };

  return { items: [], source: 'none', attempts, message: formatGrokDiscoveryFailure(attempts) };
}

export function formatGrokDiscoveryFailure(attempts) {
  const joined = attempts.map((attempt) => `${attempt.label} → ${attempt.detail}`).join('；');
  return `未找到对话列表。已尝试：${joined}。No conversation list found. Tried: ${joined}.`;
}

export function parseGrokConversationList(payload) {
  const seen = new Set();
  const items = [];
  for (const row of listRows(payload)) {
    const id = cleanId(pick(row, ['conversationId', 'conversation_id', 'id', 'uuid']));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = cleanTitle(pick(row, ['title', 'name', 'summary', 'conversationTitle'])) || id;
    items.push({ id, title, url: `https://grok.com/c/${id}`, platform: 'grok' });
  }
  return items;
}

export function parseGrokMessages(payload) {
  const messages = [];
  for (const row of messageRows(payload)) {
    const role = roleOf(row);
    const text = textOf(row).trim();
    if (!role || !text) continue;
    messages.push({ role, markdown: `${text}\n` });
  }
  return messages;
}

export function listGrokSidebarControls(doc) {
  if (!doc?.querySelectorAll) return [];
  const scopes = [...doc.querySelectorAll('aside, nav, [role="navigation"]')];
  const roots = scopes.length ? scopes : [doc.body || doc];
  const seen = new Set();
  const items = [];
  for (const root of roots) {
    const nodes = root.querySelectorAll?.('button, [role="button"], [data-conversation-id], [data-id], [data-uuid]') || [];
    for (const node of nodes) {
      if (node.closest?.('#ace-export-root, [data-testid="user-message"], [data-testid="assistant-message"], .message-bubble')) {
        continue;
      }
      if (!isRenderedVisible(node)) continue;
      const id = idFromElement(node);
      if (!id || seen.has(id)) continue;
      const title = cleanTitle(node.textContent) || id;
      if (title.length > 120) continue;
      seen.add(id);
      items.push({ id, title, url: `https://grok.com/c/${id}`, platform: 'grok' });
    }
  }
  return items;
}

export async function loadGrokConversation(id, fetchImpl) {
  const attempts = [];
  let responseIds = [];
  for (const path of grokContentPaths(id)) {
    const result = await readJson(fetchImpl, path);
    attempts.push({ label: `GET ${path}`, detail: result.detail });
    if (!result.data) continue;
    const messages = parseGrokMessages(result.data);
    if (messages.length) return { messages, attempts, time: observedJsonTime(result.data) };
    const ids = collectResponseIds(result.data);
    if (ids.length) responseIds = ids;
  }
  if (responseIds.length) {
    const path = grokLoadResponsesPath(id);
    const result = await readJson(fetchImpl, path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ responseIds }),
    });
    attempts.push({ label: `POST ${path}`, detail: result.detail });
    if (result.data) {
      const messages = parseGrokMessages(result.data);
      if (messages.length) return { messages, attempts, time: observedJsonTime(result.data) };
    }
  }
  return { messages: [], attempts, time: null };
}

export async function collectGrokBulkExport(items, { fetchImpl, exportedAt }) {
  const files = [];
  const failures = [];
  for (const item of items) {
    const loaded = await loadGrokConversation(item.id, fetchImpl);
    if (loaded.messages.length) {
      files.push({
        filename: markdownFilename('grok', item.title, item.id),
        markdown: conversationToMarkdown({
          platform: 'grok',
          title: item.title || null,
          url: item.url || `https://grok.com/c/${item.id}`,
          time: loaded.time,
          exportedAt,
          messages: loaded.messages,
        }),
      });
    } else {
      failures.push({ id: item.id, title: item.title || item.id, attempts: loaded.attempts });
      files.push({
        filename: markdownFilename('grok', item.title, item.id),
        markdown: failureMarkdown(item, loaded.attempts),
      });
    }
  }
  return { files, failures };
}

function failureMarkdown(item, attempts) {
  const lines = [];
  if (item.title) lines.push(`# ${item.title}`, '');
  lines.push('- 平台: Grok', `- 页面: https://grok.com/c/${item.id}`, '');
  lines.push('这条对话没有读到正文，没有编造内容。', 'No message text was read. Nothing was invented.', '尝试过：');
  for (const attempt of attempts) lines.push(`- ${attempt.label} → ${attempt.detail}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function readJson(fetchImpl, path, options = {}) {
  assertAppChatPath(path);
  try {
    const response = await fetchImpl(path, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: { accept: 'application/json', ...(options.headers || {}) },
      body: options.body,
    });
    const status = Number(response?.status) || 0;
    if (!response?.ok) return { data: null, detail: `HTTP ${status || 'error'}` };
    try {
      const data = await response.json();
      return { data, detail: `HTTP ${status}` };
    } catch {
      return { data: null, detail: `HTTP ${status}，不是 JSON` };
    }
  } catch {
    return { data: null, detail: '请求失败' };
  }
}

function assertAppChatPath(path) {
  const value = String(path || '');
  if (!value.startsWith('/rest/app-chat/') || value.includes('://') || value.includes('..')) {
    throw new Error('refusing a non-local grok path');
  }
}

function isGrokPage(pageUrl) {
  try {
    return new URL(pageUrl).hostname === 'grok.com';
  } catch {
    return false;
  }
}

function listRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['conversations', 'items', 'data', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.conversations)) return value.conversations;
    }
  }
  return [];
}

function messageRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['responses', 'messages', 'turns', 'items']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.conversation) return messageRows(payload.conversation);
  if (payload.data && typeof payload.data === 'object') return messageRows(payload.data);
  return [];
}

function pick(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function cleanId(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(text)) return '';
  return text;
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function roleOf(row) {
  const raw = String(row?.sender || row?.role || row?.author || '').toLowerCase();
  if (raw === 'human' || raw === 'user' || raw === 'you') return 'user';
  if (raw === 'assistant' || raw === 'model' || raw === 'grok' || raw === 'ai' || raw === 'agent') return 'assistant';
  return '';
}

function textOf(row) {
  if (!row || typeof row !== 'object') return '';
  for (const key of ['message', 'text', 'markdown']) {
    if (typeof row[key] === 'string' && row[key].trim()) return row[key];
  }
  const content = row.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (content && typeof content === 'object' && !Array.isArray(content) && typeof content.text === 'string') {
    return content.text;
  }
  const parts = Array.isArray(content) ? content : content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function collectResponseIds(payload) {
  const ids = [];
  walk(payload, 0);
  return [...new Set(ids)].slice(0, 200);

  function walk(node, depth) {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    if (typeof node.responseId === 'string') ids.push(node.responseId);
    if (Array.isArray(node.responseIds)) {
      for (const id of node.responseIds) {
        if (typeof id === 'string') ids.push(id);
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walk(value, depth + 1);
    }
  }
}

function observedJsonTime(payload) {
  const value = pick(payload, ['modifyTime', 'createTime']) || pick(payload?.conversation, ['modifyTime', 'createTime']);
  return value || null;
}

function idFromElement(node) {
  for (const name of ['data-conversation-id', 'data-conversationid', 'data-id', 'data-uuid']) {
    const id = uuidFrom(node.getAttribute?.(name));
    if (id) return id;
  }
  const attributes = node.attributes ? [...node.attributes] : [];
  for (const attr of attributes) {
    if (!String(attr.name).startsWith('data-')) continue;
    const id = uuidFrom(attr.value);
    if (id) return id;
  }
  return '';
}

function uuidFrom(value) {
  const match = String(value || '').match(UUID_RE);
  return match ? match[0] : '';
}
