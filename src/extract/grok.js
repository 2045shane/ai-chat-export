import { htmlToMarkdown } from '../lib/markdown.js';
import { isRenderedVisible } from '../lib/visible.js';

const ID_RE = /\/(?:c|chat)\/([0-9a-zA-Z-]{8,})/;

/**
 * Reads the open Grok conversation from publicly observed markers:
 * data-testid user/assistant messages, with message-bubble as a fallback.
 * Selectors describe page behavior; this file is not copied from a store extension.
 */
export function extractGrok(doc, pageUrl = '') {
  const url = pageUrl || '';
  let nodes = [...doc.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')];
  let mode = 'testid';
  if (nodes.length === 0) {
    nodes = [...doc.querySelectorAll('.message-bubble')];
    mode = 'bubble';
  }
  const messages = [];
  for (const el of nodes) {
    if (el.closest('#ace-export-root')) continue;
    const root = el.querySelector('.response-content-markdown') || el;
    const markdown = htmlToMarkdown(root);
    if (!markdown.trim()) continue;
    messages.push({ role: roleOf(el, mode), markdown });
  }
  return {
    platform: 'grok',
    title: grokTitle(doc, url),
    url,
    time: observedTime(doc),
    messages,
  };
}

function roleOf(el, mode) {
  if (mode === 'testid') return el.getAttribute('data-testid') === 'user-message' ? 'user' : 'assistant';
  return el.closest('.items-end') ? 'user' : 'assistant';
}

function grokTitle(doc, url) {
  const id = (String(url).match(ID_RE) || [])[1];
  if (id) {
    for (const link of sidebarLinks(doc)) {
      const href = link.getAttribute('href') || '';
      if (!href.includes(id)) continue;
      const title = link.textContent.trim();
      if (title) return title;
    }
  }
  const heading = doc.querySelector('main h1, h1');
  const text = heading ? heading.textContent.trim() : '';
  if (text && !/^grok$/i.test(text)) return text;
  return null;
}

export function listGrokHistory(doc, pageUrl = 'https://grok.com/') {
  const seen = new Set();
  const items = [];
  for (const link of sidebarLinks(doc)) {
    if (!isRenderedVisible(link)) continue;
    const href = link.getAttribute('href') || '';
    const match = href.match(ID_RE);
    if (!match) continue;
    const id = match[1];
    if (seen.has(id)) continue;
    const title = link.textContent.trim();
    if (!title) continue;
    seen.add(id);
    items.push({ id, title, url: absoluteUrl(href, pageUrl), platform: 'grok' });
  }
  return items;
}

function sidebarLinks(doc) {
  const links = [...doc.querySelectorAll('a[href]')].filter((link) => ID_RE.test(link.getAttribute('href') || ''));
  const scoped = links.filter((link) => link.closest('nav, aside, [role="navigation"]'));
  return scoped.length ? scoped : links;
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
