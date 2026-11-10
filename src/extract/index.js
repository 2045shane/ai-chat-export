import { extractGemini, listGeminiHistory } from './gemini.js';
import { extractGrok, listGrokHistory } from './grok.js';

export function platformFromHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host === 'grok.com') return 'grok';
  if (host === 'gemini.google.com') return 'gemini';
  return null;
}

export function extractCurrent(platform, doc, pageUrl) {
  if (platform === 'grok') return extractGrok(doc, pageUrl);
  if (platform === 'gemini') return extractGemini(doc, pageUrl);
  return { platform, title: null, url: pageUrl || '', time: null, messages: [] };
}

export function listVisibleHistory(platform, doc, pageUrl) {
  if (platform === 'grok') return listGrokHistory(doc, pageUrl);
  if (platform === 'gemini') return listGeminiHistory(doc, pageUrl);
  return [];
}
