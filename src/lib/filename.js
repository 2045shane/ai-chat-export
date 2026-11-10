export function safeFilename(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function markdownFilename(platform, title, id) {
  const prefix = platform === 'gemini' ? 'gemini' : 'grok';
  const label = safeFilename(title) || safeFilename(id).slice(0, 12) || '未命名';
  return `${prefix}-${label}.md`;
}
