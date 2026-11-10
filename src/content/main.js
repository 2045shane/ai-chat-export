import { assignUniqueMarkdownNames, createBulkJob, recordExtracted } from '../lib/bulk.js';
import { STORAGE_JOB, STORAGE_LICENSE, STORAGE_USAGE } from '../lib/constants.js';
import { blockedBulkCopy, historyListState, quotaLabel } from '../lib/copy.js';
import { extractCurrent, listVisibleHistory, platformFromHostname } from '../extract/index.js';
import { markdownFilename } from '../lib/filename.js';
import { isValidBuyoutCode } from '../lib/license.js';
import { conversationToMarkdown } from '../lib/markdown.js';
import { evaluateBulkAccess, nextUsage, todayKey } from '../lib/quota.js';

const PANEL_CSS = `
  :host { font-size: 14px; }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  button, a { font: inherit; }
  .launcher, .panel {
    font-family: system-ui, "Noto Sans SC", "PingFang SC", sans-serif;
    font-size: 14px;
    line-height: 1.45;
  }
  .launcher {
    border: 0;
    border-radius: 999px;
    padding: 10px 14px;
    background: #176b4d;
    color: #fff;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0,0,0,.2);
  }
  .panel {
    width: min(320px, calc(100vw - 24px));
    max-height: min(70vh, 560px);
    overflow: auto;
    padding: 12px;
    border-radius: 14px;
    background: #fff;
    color: #1c1c1c;
    border: 1px solid rgba(0,0,0,.12);
    box-shadow: 0 12px 32px rgba(0,0,0,.2);
  }
  @media (prefers-color-scheme: dark) {
    .panel { background: #1c1e21; color: #f4f4f4; border-color: rgba(255,255,255,.12); }
    .choice { border-color: rgba(255,255,255,.12); }
    .ghost { color: inherit; border-color: rgba(255,255,255,.2); }
  }
  header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
  h2 { margin: 12px 0 6px; font-size: 13px; }
  p { margin: 6px 0; }
  .row { display: flex; flex-direction: column; gap: 8px; }
  button.primary, button.ghost {
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
  }
  button.primary { border: 0; background: #176b4d; color: #fff; }
  button.primary:disabled { opacity: .45; cursor: not-allowed; }
  button.ghost { background: transparent; color: inherit; border: 1px solid rgba(0,0,0,.18); }
  .choice { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,.08); }
  .choice span { word-break: break-word; }
  .block { padding: 8px; border-radius: 8px; background: rgba(176, 64, 32, .12); }
  .block a { color: inherit; }
  .muted { opacity: .8; }
`;

let resumeStarted = false;

function boot() {
  const platform = platformFromHostname(location.hostname);
  if (!platform) return;
  const ui = mountPanel();
  ui.onExportCurrent(() => exportCurrent(platform, ui));
  ui.onExportSelected(() => exportSelected(platform, ui));
  ui.onRefresh(() => paintList(platform, ui));
  ui.onOpenOptions(() => chrome.runtime.openOptionsPage());
  paintList(platform, ui);
  refreshQuota(ui).catch((error) => ui.setStatus(error.message));
  getJob()
    .then((job) => {
      if (job) return resumeJob(platform, ui, job);
      return null;
    })
    .catch((error) => ui.setStatus(error.message));
}

function mountPanel() {
  const host = document.createElement('div');
  host.id = 'ace-export-root';
  host.style.cssText = 'position:fixed;z-index:2147483646;right:16px;bottom:16px;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  const launcher = button('导出对话', 'launcher');
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.hidden = true;
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = 'AI 聊天导出';
  const close = button('收起', 'ghost');
  header.append(title, close);
  const current = button('导出当前对话', 'primary');
  const status = document.createElement('p');
  status.className = 'muted';
  const heading = document.createElement('h2');
  heading.textContent = '批量导出';
  const quota = document.createElement('p');
  const block = document.createElement('div');
  block.className = 'block';
  block.hidden = true;
  const empty = document.createElement('p');
  empty.hidden = true;
  const list = document.createElement('div');
  const refresh = button('刷新可见列表', 'ghost');
  const selected = button('导出选中对话', 'primary');
  const options = button('打开许可码选项', 'ghost');
  const row = document.createElement('div');
  row.className = 'row';
  row.append(current, status, heading, quota, block, empty, list, refresh, selected, options);
  panel.append(header, row);
  shadow.append(style, launcher, panel);
  document.documentElement.append(host);
  const keep = new MutationObserver(() => {
    if (!host.isConnected) document.documentElement.append(host);
  });
  keep.observe(document.documentElement, { childList: true });

  const open = () => {
    panel.hidden = false;
    launcher.hidden = true;
  };
  const shut = () => {
    panel.hidden = true;
    launcher.hidden = false;
  };
  launcher.addEventListener('click', open);
  close.addEventListener('click', shut);

  return {
    open,
    setStatus(text) {
      status.textContent = text || '';
    },
    setQuota(text) {
      quota.textContent = text;
    },
    setList(items, platform) {
      list.replaceChildren();
      const state = historyListState(items, platform);
      empty.hidden = !state.empty;
      empty.textContent = state.message;
      for (const item of items) {
        const label = document.createElement('label');
        label.className = 'choice';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.id = item.id;
        input.dataset.title = item.title;
        input.dataset.url = item.url;
        const span = document.createElement('span');
        span.textContent = item.title;
        label.append(input, span);
        list.append(label);
      }
    },
    selectedItems() {
      return [...list.querySelectorAll('input:checked')].map((input) => ({
        id: input.dataset.id,
        title: input.dataset.title,
        url: input.dataset.url,
      }));
    },
    showBlocked(copy) {
      block.hidden = false;
      block.replaceChildren();
      const lead = document.createElement('p');
      lead.textContent = copy.title;
      const link = document.createElement('a');
      link.href = copy.ctaHref;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = copy.ctaLabel;
      const handle = document.createElement('p');
      handle.textContent = `小红书：${copy.handle}`;
      const buyout = document.createElement('p');
      buyout.textContent = copy.buyout;
      block.append(lead, link, handle, buyout);
    },
    hideBlocked() {
      block.hidden = true;
      block.replaceChildren();
    },
    setBulkEnabled(enabled) {
      selected.disabled = !enabled;
    },
    onExportCurrent(fn) {
      current.addEventListener('click', () => fn());
    },
    onExportSelected(fn) {
      selected.addEventListener('click', () => fn());
    },
    onRefresh(fn) {
      refresh.addEventListener('click', () => fn());
    },
    onOpenOptions(fn) {
      options.addEventListener('click', () => fn());
    },
  };
}

function button(text, className) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  return el;
}

function paintList(platform, ui) {
  ui.setList(listVisibleHistory(platform, document, location.href), platform);
}

async function refreshQuota(ui) {
  const licensed = await readLicensed();
  const usage = await readUsage();
  const gate = evaluateBulkAccess({ usage, today: todayKey(), licensed });
  ui.setQuota(quotaLabel(gate));
  ui.setBulkEnabled(gate.allowed);
  if (gate.allowed) ui.hideBlocked();
  else ui.showBlocked(blockedBulkCopy());
  return gate;
}

async function exportCurrent(platform, ui) {
  const convo = extractCurrent(platform, document, location.href);
  if (!convo.messages.length) {
    ui.setStatus('没有读到对话内容，已取消导出');
    return;
  }
  const markdown = conversationToMarkdown({ ...convo, exportedAt: new Date().toISOString() });
  const response = await sendDownload({
    type: 'download',
    kind: 'markdown',
    filename: markdownFilename(platform, convo.title, idFromUrl(location.href)),
    markdown,
  });
  ui.setStatus(response.ok ? '已开始下载当前对话' : `下载失败：${response.error || ''}`);
}

async function exportSelected(platform, ui) {
  if (resumeStarted) {
    ui.setStatus('已有批量任务进行中');
    return;
  }
  const created = createBulkJob({ platform, queue: ui.selectedItems() });
  if (!created.ok) {
    ui.setStatus(created.message);
    return;
  }
  const licensed = await readLicensed();
  const today = todayKey();
  const usage = await readUsage();
  const gate = evaluateBulkAccess({ usage, today, licensed });
  if (!gate.allowed) {
    const copy = blockedBulkCopy();
    ui.showBlocked(copy);
    ui.setBulkEnabled(false);
    ui.setStatus(copy.title);
    return;
  }
  if (!licensed) await writeUsage(nextUsage(usage, today));
  await setJob(created.job);
  await refreshQuota(ui);
  ui.open();
  await resumeJob(platform, ui, created.job);
}

async function resumeJob(platform, ui, existing) {
  const job = existing || (await getJob());
  if (!job || resumeStarted) return;
  if (job.platform !== platform) {
    await clearJob();
    ui.setStatus('批量任务与当前站点不一致，已停止');
    return;
  }
  resumeStarted = true;
  ui.open();
  try {
    const target = job.queue[job.index];
    if (!target) {
      await finishJob(job, ui);
      return;
    }
    if (normalizeUrl(target.url) !== normalizeUrl(location.href)) {
      ui.setStatus(`正在打开第 ${job.index + 1} / ${job.queue.length} 条…`);
      location.assign(target.url);
      return;
    }
    ui.setStatus(`正在读取第 ${job.index + 1} / ${job.queue.length} 条…`);
    const convo = await waitForConversation(platform);
    const title = convo.title || target.title || null;
    const file = {
      filename: markdownFilename(platform, title, target.id),
      markdown: conversationToMarkdown({
        ...convo,
        title,
        exportedAt: new Date().toISOString(),
      }),
    };
    const next = recordExtracted(job, file);
    if (next.done) {
      await finishJob(next, ui);
      return;
    }
    await setJob(next);
    ui.setStatus(`正在打开第 ${next.index + 1} / ${next.queue.length} 条…`);
    location.assign(next.queue[next.index].url);
  } catch (error) {
    resumeStarted = false;
    ui.setStatus(`批量导出中断：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function finishJob(job, ui) {
  let status = '批量导出已开始下载';
  try {
    const files = assignUniqueMarkdownNames(job.files);
    const response = await sendDownload({
      type: 'download',
      kind: 'zip',
      filename: `对话批量-${todayKey()}.zip`,
      files,
    });
    status = response.ok ? '批量导出已开始下载' : `下载失败：${response.error || ''}`;
  } catch (error) {
    status = `下载失败：${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    await clearJob();
  } catch {
    status = `${status}（进度未能清除）`;
  }
  resumeStarted = false;
  ui.setStatus(status);
  try {
    await refreshQuota(ui);
  } catch {
    // The download result still stands when the quota label cannot refresh.
  }
}

function waitForConversation(platform) {
  const read = () => extractCurrent(platform, document, location.href);
  const current = read();
  if (current.messages.length) return Promise.resolve(current);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(read());
    }, 12000);
    const observer = new MutationObserver(() => {
      const next = read();
      if (!next.messages.length) return;
      clearTimeout(timer);
      observer.disconnect();
      resolve(next);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function idFromUrl(value) {
  const match = String(value).match(/\/(?:c|chat|app)\/([^/?#]+)/);
  return match ? match[1] : '';
}

function normalizeUrl(value) {
  try {
    const url = new URL(value, location.href);
    url.hash = '';
    const path = url.pathname.replace(/\/$/, '');
    return `${url.origin}${path}${url.search}`;
  } catch {
    return String(value || '');
  }
}

function storageGet(area, key) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(key, (data) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(data ? data[key] : undefined);
    });
  });
}

function storageSet(area, values) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(values, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function storageRemove(area, key) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].remove(key, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function readLicensed() {
  return storageGet('local', STORAGE_LICENSE).then((code) => isValidBuyoutCode(code));
}

function readUsage() {
  return storageGet('local', STORAGE_USAGE).then((usage) => usage || null);
}

function writeUsage(usage) {
  return storageSet('local', { [STORAGE_USAGE]: usage });
}

function getJob() {
  return storageGet('session', STORAGE_JOB).then((job) => job || null);
}

function setJob(job) {
  return storageSet('session', { [STORAGE_JOB]: job });
}

function clearJob() {
  return storageRemove('session', STORAGE_JOB);
}

function sendDownload(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message });
      else resolve(response || { ok: false, error: '无响应' });
    });
  });
}

boot();
