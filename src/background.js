import { buildZip } from './lib/zip.js';

const api = globalThis.chrome;
if (api?.runtime?.onMessage && api?.downloads?.download) {
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'download') return undefined;
    downloadLocal(message).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true;
  });
}

async function downloadLocal(message) {
  const filename = safeDownloadName(message.filename);
  let bytes;
  let mime;
  if (message.kind === 'zip') {
    const files = Array.isArray(message.files) ? message.files : [];
    bytes = buildZip(files.map((file) => ({ name: file.filename, data: String(file.markdown || '') })));
    mime = 'application/zip';
  } else if (message.kind === 'markdown') {
    bytes = new TextEncoder().encode(String(message.markdown || ''));
    mime = 'text/markdown;charset=utf-8';
  } else {
    throw new Error('未知下载类型');
  }
  const url = toDataUrl(bytes, mime);
  const downloads = globalThis.chrome.downloads;
  await new Promise((resolve, reject) => {
    downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' }, (id) => {
      const err = globalThis.chrome.runtime.lastError;
      if (err || typeof id !== 'number') reject(new Error(err ? err.message : '下载未开始'));
      else resolve(id);
    });
  });
}

function toDataUrl(bytes, mime) {
  return `data:${mime};base64,${toBase64(bytes)}`;
}

function toBase64(bytes) {
  let binary = '';
  const size = 8192;
  for (let index = 0; index < bytes.length; index += size) {
    const end = Math.min(index + size, bytes.length);
    let block = '';
    for (let cursor = index; cursor < end; cursor += 1) block += String.fromCharCode(bytes[cursor]);
    binary += block;
  }
  return btoa(binary);
}

function safeDownloadName(name) {
  const base = String(name || 'export.md').split(/[/\\]/).pop();
  return base || 'export.md';
}
