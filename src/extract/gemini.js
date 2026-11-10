import { htmlToMarkdown } from '../lib/markdown.js';
import { isRenderedVisible } from '../lib/visible.js';

const APP_ID = /\/app\/([0-9a-zA-Z_-]{8,})/;

/**
 * Reads the open Gemini conversation from publicly observed markers:
 * conversation-container, user-query, and model-response.
 * Selectors describe page behavior; this file is not copied from a store extension.
 */
export function extractGemini(doc, pageUrl = '') {
  const url = pageUrl || '';
  const containers = [...doc.querySelectorAll('div.conversation-container')].filter(
    (el) => !el.closest('#ace-export-root'),
  );
  const messages = [];
  if (containers.length) {
    for (const container of containers) messages.push(...readScope(container));
  } else {
    const nodes = [...doc.querySelectorAll('user-query, model-response')].filter(
      (el) => !el.closest('#ace-export-root'),
    );
    for (const node of nodes) messages.push(...readNode(node));
  }
  return {
    platform: 'gemini',
    title: geminiTitle(doc),
    url,
    time: observedTime(doc),
    messages,
  };
}

function readScope(container) {
  const messages = [];
  const user = container.querySelector('user-query');
  const model = container.querySelector('model-response');
  if (user) messages.push(...readNode(user));
  if (model) messages.push(...readNode(model));
  return messages;
}

function readNode(node) {
  if (node.tagName === 'USER-QUERY') {
    const root = node.querySelector('.query-text') || node;
    const markdown = htmlToMarkdown(root);
    return markdown.trim() ? [{ role: 'user', markdown }] : [];
  }
  const root = node.querySelector('.markdown') || node.querySelector('message-content') || node;
  const markdown = htmlToMarkdown(root);
  return markdown.trim() ? [{ role: 'assistant', markdown }] : [];
}

function geminiTitle(doc) {
  const current = doc.querySelector(
    'a[data-test-id="conversation"][aria-current="true"] .conversation-title',
  );
  const text = current ? current.textContent.trim() : '';
  return text || null;
}

export function listGeminiHistory(doc, pageUrl = 'https://gemini.google.com/') {
  const preferred = [...doc.querySelectorAll('a[data-test-id="conversation"]')];
  const links = preferred.length
    ? preferred
    : [...doc.querySelectorAll('a[href*="/app/"]')].filter((link) => APP_ID.test(link.getAttribute('href') || ''));
  const seen = new Set();
  const items = [];
  for (const link of links) {
    if (link.closest('#ace-export-root')) continue;
    if (!isRenderedVisible(link)) continue;
    const href = link.getAttribute('href') || '';
    const match = href.match(APP_ID);
    if (!match) continue;
    const id = match[1];
    if (seen.has(id)) continue;
    const titleNode = link.querySelector('.conversation-title');
    const title = (titleNode ? titleNode.textContent : link.textContent).trim();
    if (!title) continue;
    seen.add(id);
    items.push({ id, title, url: absoluteUrl(href, pageUrl), platform: 'gemini' });
  }
  return items;
}

function observedTime(doc) {
  const node = doc.querySelector('time[datetime]');
  const value = node ? (node.getAttribute('datetime') || '').trim() : '';
  return value || null;
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}
