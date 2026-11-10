import { buildZip } from './lib/zip.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'download') return undefined;
  downloadLocal(message).then(
    () => sendResponse({ ok: true }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  return true;
});

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
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    await new Promise((resolve, reject) => {
      chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' }, (id) => {
        const err = chrome.runtime.lastError;
        if (err || typeof id !== 'number') reject(new Error(err ? err.message : '下载未开始'));
        else resolve(id);
      });
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

function safeDownloadName(name) {
  const base = String(name || 'export.md').split(/[/\\]/).pop();
  return base || 'export.md';
}
