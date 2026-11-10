import { NEED_TWO_MESSAGE } from './copy.js';

export const MIN_BULK_SELECTION = 2;

export function createBulkJob({ platform, queue }) {
  const items = Array.isArray(queue) ? queue : [];
  if (items.length < MIN_BULK_SELECTION) {
    return { ok: false, message: NEED_TWO_MESSAGE };
  }
  return {
    ok: true,
    job: {
      platform,
      queue: items.map((item) => ({
        id: String(item.id || ''),
        title: String(item.title || ''),
        url: String(item.url || ''),
      })),
      index: 0,
      files: [],
    },
  };
}

export function recordExtracted(job, file) {
  const files = [...job.files, file];
  const index = job.index + 1;
  return {
    ...job,
    files,
    index,
    done: index >= job.queue.length,
  };
}

export function assignUniqueMarkdownNames(files) {
  const seen = new Map();
  return files.map((file) => {
    const base = String(file.filename || '未命名.md').replace(/\.md$/i, '');
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    const filename = count === 0 ? `${base}.md` : `${base}-${count + 1}.md`;
    return { ...file, filename };
  });
}
