(() => {
  // src/lib/constants.js
  var FREE_DAILY_BULK_LIMIT = 3;
  var BUYOUT_CHECKOUT_ENABLED = false;
  var BUYOUT_STUB_CODE = "ACE-LOCAL-0001";
  var STORAGE_LICENSE = "buyoutCode";
  var STORAGE_USAGE = "bulkUsage";
  var STORAGE_JOB = "bulkJob";

  // src/lib/copy.js
  var CONTACT_CTA_LABEL = "有问题请联系我";
  var CONTACT_HANDLE = "珊哥爱读书";
  var CONTACT_URL = "https://www.xiaohongshu.com/search_result?keyword=" + encodeURIComponent(CONTACT_HANDLE);
  var BUYOUT_PLACEHOLDER_LABEL = "一次性买断（即将上线）";
  function emptyHistoryMessage(platform) {
    if (platform === "grok") {
      return "未找到对话列表，请在 grok.com 对话页打开。No conversation list found. Open a grok.com chat.";
    }
    if (platform === "gemini") {
      return "未找到对话列表，请在 gemini.google.com 对话页打开。No conversation list found. Open a gemini.google.com chat.";
    }
    return "未找到对话列表，请在 grok.com 或 gemini.google.com 的对话页打开。No conversation list found. Open a chat on grok.com or gemini.google.com.";
  }
  var NEED_TWO_MESSAGE = "请至少勾选 2 条可见对话";
  function buyoutPlaceholder() {
    if (BUYOUT_CHECKOUT_ENABLED) {
      throw new Error("BUYOUT_CHECKOUT_ENABLED must stay false");
    }
    return { label: BUYOUT_PLACEHOLDER_LABEL, href: null };
  }
  function blockedBulkCopy() {
    const buyout = buyoutPlaceholder();
    return {
      title: `今日批量次数已用完（上限 ${FREE_DAILY_BULK_LIMIT} 次）`,
      ctaLabel: CONTACT_CTA_LABEL,
      ctaHref: CONTACT_URL,
      handle: CONTACT_HANDLE,
      buyout: buyout.label,
      buyoutHref: buyout.href
    };
  }
  function quotaLabel(gate) {
    if (gate.licensed) return "本地买断已生效，批量不限次";
    return `今日剩余批量次数：${gate.remaining}`;
  }
  function historyListState(items, platform) {
    if (!items || items.length === 0) {
      return { empty: true, message: emptyHistoryMessage(platform) };
    }
    return { empty: false, message: "" };
  }

  // src/lib/bulk.js
  var MIN_BULK_SELECTION = 2;
  function createBulkJob({ platform, queue }) {
    const items = Array.isArray(queue) ? queue : [];
    if (items.length < MIN_BULK_SELECTION) {
      return { ok: false, message: NEED_TWO_MESSAGE };
    }
    return {
      ok: true,
      job: {
        platform,
        queue: items.map((item) => ({
          id: String(item.id || ""),
          title: String(item.title || ""),
          url: String(item.url || "")
        })),
        index: 0,
        files: []
      }
    };
  }
  function recordExtracted(job, file) {
    const files = [...job.files, file];
    const index = job.index + 1;
    return {
      ...job,
      files,
      index,
      done: index >= job.queue.length
    };
  }
  function assignUniqueMarkdownNames(files) {
    const seen = /* @__PURE__ */ new Map();
    return files.map((file) => {
      const base = String(file.filename || "未命名.md").replace(/\.md$/i, "");
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      const filename = count === 0 ? `${base}.md` : `${base}-${count + 1}.md`;
      return { ...file, filename };
    });
  }

  // src/lib/markdown.js
  var SKIP_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "SVG",
    "BUTTON",
    "NOSCRIPT",
    "CANVAS",
    "IFRAME",
    "MAT-ICON"
  ]);
  function htmlToMarkdown(root) {
    if (!root) return "";
    const rendered = renderContainer(root).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return rendered ? `${rendered}
` : "";
  }
  function conversationToMarkdown(convo) {
    const platformLabel = convo.platform === "grok" ? "Grok" : convo.platform === "gemini" ? "Gemini" : "";
    const lines = [];
    if (convo.title) lines.push(`# ${convo.title}`, "");
    if (platformLabel) lines.push(`- 平台: ${platformLabel}`);
    if (convo.url) lines.push(`- 页面: ${convo.url}`);
    if (convo.time) lines.push(`- 时间: ${convo.time}`);
    if (convo.exportedAt) lines.push(`- 导出时间: ${convo.exportedAt}`);
    lines.push("");
    const messages = Array.isArray(convo.messages) ? convo.messages : [];
    if (messages.length === 0) {
      lines.push("（未能从当前页面读到对话内容，未编造正文。）", "");
    }
    for (const message of messages) {
      const role = message.role === "user" ? "用户" : platformLabel || "助手";
      lines.push(`## ${role}`, "", String(message.markdown || "").trim(), "");
    }
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}
`;
  }
  function renderContainer(el) {
    let out = "";
    for (const node of el.childNodes) out += renderNode(node);
    return out;
  }
  function renderNode(node) {
    if (!node) return "";
    if (node.nodeType === 3) return String(node.nodeValue || "").replace(/\u00a0/g, " ");
    if (node.nodeType !== 1) return "";
    const el = node;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag) || tag.endsWith("-ICON")) return "";
    if (el.getAttribute && el.getAttribute("role") === "button") return "";
    if (el.hasAttribute && el.hasAttribute("hidden")) return "";
    if (tag === "BR") return "\n";
    if (tag === "CODE-BLOCK" || hasClass(el, "code-block")) return renderCodeBlock(el);
    if (tag === "PRE") return renderPre(el);
    if (tag === "TABLE") return renderTable(el);
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return `
${"#".repeat(level)} ${collapse(renderContainer(el))}

`;
    }
    if (tag === "UL") return renderList(el, false, 0);
    if (tag === "OL") return renderList(el, true, 0);
    if (tag === "BLOCKQUOTE") {
      const inner = renderContainer(el).trim();
      if (!inner) return "";
      return `
${inner.split("\n").map((line) => `> ${line}`).join("\n")}

`;
    }
    if (tag === "HR") return "\n---\n\n";
    if (tag === "IMG") return renderImage(el);
    if (tag === "A") return renderLink(el);
    if (tag === "STRONG" || tag === "B") {
      const text = collapse(renderContainer(el));
      return text ? `**${text}**` : "";
    }
    if (tag === "EM" || tag === "I") {
      const text = collapse(renderContainer(el));
      return text ? `*${text}*` : "";
    }
    if (tag === "CODE") return renderInlineCode(el);
    if (tag === "P") {
      const text = renderContainer(el).trim();
      return text ? `${text}

` : "";
    }
    return renderContainer(el);
  }
  function collapse(value) {
    return String(value || "").replace(/\s*\n+\s*/g, " ").trim();
  }
  function hasClass(el, name) {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute?.("class") || "";
    return cls.split(/\s+/).includes(name);
  }
  function renderLink(el) {
    const href = el.getAttribute("href") || "";
    const text = collapse(renderContainer(el)) || href;
    if (!href || href.startsWith("javascript:")) return text;
    return `[${text}](${href})`;
  }
  function renderImage(el) {
    const alt = (el.getAttribute("alt") || "").trim();
    const src = el.getAttribute("src") || "";
    if (/^https?:\/\//i.test(src)) return `![${alt}](${src})`;
    return alt ? `（图片：${alt}）` : "";
  }
  function renderInlineCode(el) {
    const text = String(el.textContent || "").replace(/\u00a0/g, " ");
    if (!text.trim()) return "";
    if (text.includes("\n")) return fence(languageOf(el), text);
    return `\`${text.replace(/`/g, "\\`")}\``;
  }
  function renderPre(el) {
    const code = el.querySelector("code");
    const raw = code ? code.textContent : el.textContent;
    const text = String(raw || "").replace(/\u00a0/g, " ").replace(/\n$/, "");
    return fence(languageOf(code) || languageOf(el), text);
  }
  function renderCodeBlock(el) {
    const code = el.querySelector("code");
    const pre = el.querySelector("pre");
    const source = code || pre;
    const text = String(source ? source.textContent : "").replace(/\u00a0/g, " ").replace(/^\n/, "").replace(/\n$/, "");
    const lang = languageOf(code) || languageOf(pre) || decorationLanguage(el);
    return fence(lang, text);
  }
  function fence(lang, text) {
    const body = String(text || "").replace(/\n$/, "");
    return `
\`\`\`${lang || ""}
${body}
\`\`\`

`;
  }
  function languageOf(el) {
    if (!el || el.nodeType !== 1) return "";
    const data = el.getAttribute("data-language") || el.getAttribute("data-lang") || "";
    if (/^[\w#+.-]{1,24}$/.test(data)) return data.toLowerCase();
    const cls = `${typeof el.className === "string" ? el.className : ""} ${el.getAttribute("class") || ""}`;
    const match = cls.match(/(?:language|lang)-([\w#+.-]+)/i);
    return match ? match[1].toLowerCase() : "";
  }
  function decorationLanguage(el) {
    const deco = el.querySelector(".code-block-decoration, .code-block-header");
    if (!deco) return "";
    for (const span of deco.querySelectorAll("span")) {
      if (span.querySelector("span, button")) continue;
      const text = span.textContent.trim();
      if (/^[\w#+.-]{1,24}$/.test(text)) return text.toLowerCase();
    }
    return "";
  }
  function renderTable(table) {
    const headRow = table.querySelector("thead tr");
    let header = [];
    let body = [];
    if (headRow) {
      header = rowCells(headRow);
      body = [...table.querySelectorAll("tbody tr")].map(rowCells);
    } else if (table.rows && table.rows.length) {
      header = rowCells(table.rows[0]);
      body = [...table.rows].slice(1).map(rowCells);
    }
    if (!header.length) return "";
    const width = Math.max(header.length, ...body.map((row) => row.length), 1);
    const pad = (row) => {
      const next = row.slice(0, width);
      while (next.length < width) next.push("");
      return next;
    };
    const line = (row) => `| ${pad(row).join(" | ")} |`;
    const sep = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
    const bodyText = body.map(line).join("\n");
    return `
${line(header)}
${sep}
${bodyText}${bodyText ? "\n" : ""}
`;
  }
  function rowCells(tr) {
    return [...tr.children].filter((cell) => cell.tagName === "TH" || cell.tagName === "TD").map((cell) => collapse(renderContainer(cell)).replace(/\|/g, "\\|"));
  }
  function renderList(list, ordered, depth) {
    const items = [...list.children].filter((node) => node.tagName === "LI");
    if (!items.length) return "";
    const lines = items.map((item, index) => {
      const nested = [...item.children].filter((node) => node.tagName === "UL" || node.tagName === "OL");
      let text = "";
      for (const child of item.childNodes) {
        if (child.nodeType === 1 && (child.tagName === "UL" || child.tagName === "OL")) continue;
        text += renderNode(child);
      }
      text = text.replace(/\n{2,}/g, "\n").trim();
      const indent = "  ".repeat(depth);
      const marker = ordered ? `${index + 1}. ` : "- ";
      const nestedText = nested.map((node) => renderList(node, node.tagName === "OL", depth + 1).trimEnd()).filter(Boolean).join("\n");
      return `${indent}${marker}${text}${nestedText ? `
${nestedText}` : ""}`;
    });
    return `
${lines.join("\n")}

`;
  }

  // src/lib/visible.js
  function computedStyle(el) {
    const view = el.ownerDocument && el.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === "function") return view.getComputedStyle(el);
    if (typeof getComputedStyle === "function") return getComputedStyle(el);
    return null;
  }
  function isRenderedVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.hasAttribute && node.hasAttribute("hidden")) return false;
      const inline = node.style || {};
      const computed = computedStyle(node);
      const display = computed && computed.display || inline.display || "";
      const visibility = computed && computed.visibility || inline.visibility || "";
      if (display === "none" || visibility === "hidden" || visibility === "collapse") return false;
      node = node.parentElement;
    }
    return true;
  }

  // src/extract/gemini.js
  var APP_ID = /\/app\/([0-9a-zA-Z_-]{8,})/;
  function extractGemini(doc, pageUrl = "") {
    const url = pageUrl || "";
    const containers = [...doc.querySelectorAll("div.conversation-container")].filter(
      (el) => !el.closest("#ace-export-root")
    );
    const messages = [];
    if (containers.length) {
      for (const container of containers) messages.push(...readScope(container));
    } else {
      const nodes = [...doc.querySelectorAll("user-query, model-response")].filter(
        (el) => !el.closest("#ace-export-root")
      );
      for (const node of nodes) messages.push(...readNode(node));
    }
    return {
      platform: "gemini",
      title: geminiTitle(doc),
      url,
      time: observedTime(doc),
      messages
    };
  }
  function readScope(container) {
    const messages = [];
    const user = container.querySelector("user-query");
    const model = container.querySelector("model-response");
    if (user) messages.push(...readNode(user));
    if (model) messages.push(...readNode(model));
    return messages;
  }
  function readNode(node) {
    if (node.tagName === "USER-QUERY") {
      const root2 = node.querySelector(".query-text") || node;
      const markdown2 = htmlToMarkdown(root2);
      return markdown2.trim() ? [{ role: "user", markdown: markdown2 }] : [];
    }
    const root = node.querySelector(".markdown") || node.querySelector("message-content") || node;
    const markdown = htmlToMarkdown(root);
    return markdown.trim() ? [{ role: "assistant", markdown }] : [];
  }
  function geminiTitle(doc) {
    const current = doc.querySelector(
      'a[data-test-id="conversation"][aria-current="true"] .conversation-title'
    );
    const text = current ? current.textContent.trim() : "";
    return text || null;
  }
  function listGeminiHistory(doc, pageUrl = "https://gemini.google.com/") {
    const preferred = [...doc.querySelectorAll('a[data-test-id="conversation"]')];
    const links = preferred.length ? preferred : [...doc.querySelectorAll('a[href*="/app/"]')].filter((link) => APP_ID.test(link.getAttribute("href") || ""));
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    for (const link of links) {
      if (link.closest("#ace-export-root")) continue;
      if (!isRenderedVisible(link)) continue;
      const href = link.getAttribute("href") || "";
      const match = href.match(APP_ID);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      const titleNode = link.querySelector(".conversation-title");
      const title = (titleNode ? titleNode.textContent : link.textContent).trim();
      if (!title) continue;
      seen.add(id);
      items.push({ id, title, url: absoluteUrl(href, pageUrl), platform: "gemini" });
    }
    return items;
  }
  function observedTime(doc) {
    const node = doc.querySelector("time[datetime]");
    const value = node ? (node.getAttribute("datetime") || "").trim() : "";
    return value || null;
  }
  function absoluteUrl(href, base) {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  }

  // src/extract/grok.js
  var ID_RE = /\/(?:c|chat)\/([0-9a-zA-Z-]{8,})/;
  function extractGrok(doc, pageUrl = "") {
    const url = pageUrl || "";
    let nodes = [...doc.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')];
    let mode = "testid";
    if (nodes.length === 0) {
      nodes = [...doc.querySelectorAll(".message-bubble")];
      mode = "bubble";
    }
    const messages = [];
    for (const el of nodes) {
      if (el.closest("#ace-export-root")) continue;
      const root = el.querySelector(".response-content-markdown") || el;
      const markdown = htmlToMarkdown(root);
      if (!markdown.trim()) continue;
      messages.push({ role: roleOf(el, mode), markdown });
    }
    return {
      platform: "grok",
      title: grokTitle(doc, url),
      url,
      time: observedTime2(doc),
      messages
    };
  }
  function roleOf(el, mode) {
    if (mode === "testid") return el.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
    return el.closest(".items-end") ? "user" : "assistant";
  }
  function grokTitle(doc, url) {
    const id = (String(url).match(ID_RE) || [])[1];
    if (id) {
      for (const link of sidebarLinks(doc)) {
        const href = link.getAttribute("href") || "";
        if (!href.includes(id)) continue;
        const title = link.textContent.trim();
        if (title) return title;
      }
    }
    const heading = doc.querySelector("main h1, h1");
    const text = heading ? heading.textContent.trim() : "";
    if (text && !/^grok$/i.test(text)) return text;
    return null;
  }
  function listGrokHistory(doc, pageUrl = "https://grok.com/") {
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    for (const link of sidebarLinks(doc)) {
      if (!isRenderedVisible(link)) continue;
      const href = link.getAttribute("href") || "";
      const match = href.match(ID_RE);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      const title = link.textContent.trim();
      if (!title) continue;
      seen.add(id);
      items.push({ id, title, url: absoluteUrl2(href, pageUrl), platform: "grok" });
    }
    return items;
  }
  function sidebarLinks(doc) {
    const links = [...doc.querySelectorAll("a[href]")].filter((link) => ID_RE.test(link.getAttribute("href") || ""));
    const scoped = links.filter((link) => link.closest('nav, aside, [role="navigation"]'));
    return scoped.length ? scoped : links;
  }
  function observedTime2(doc) {
    const node = doc.querySelector("time[datetime]");
    const value = node ? (node.getAttribute("datetime") || "").trim() : "";
    return value || null;
  }
  function absoluteUrl2(href, base) {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  }

  // src/extract/index.js
  function platformFromHostname(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host === "grok.com") return "grok";
    if (host === "gemini.google.com") return "gemini";
    return null;
  }
  function extractCurrent(platform, doc, pageUrl) {
    if (platform === "grok") return extractGrok(doc, pageUrl);
    if (platform === "gemini") return extractGemini(doc, pageUrl);
    return { platform, title: null, url: pageUrl || "", time: null, messages: [] };
  }
  function listVisibleHistory(platform, doc, pageUrl) {
    if (platform === "grok") return listGrokHistory(doc, pageUrl);
    if (platform === "gemini") return listGeminiHistory(doc, pageUrl);
    return [];
  }

  // src/lib/filename.js
  function safeFilename(name) {
    return String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  }
  function markdownFilename(platform, title, id) {
    const prefix = platform === "gemini" ? "gemini" : "grok";
    const label = safeFilename(title) || safeFilename(id).slice(0, 12) || "未命名";
    return `${prefix}-${label}.md`;
  }

  // src/lib/license.js
  function normalizeLicenseCode(value) {
    return String(value ?? "").trim().toUpperCase();
  }
  function isValidBuyoutCode(value) {
    const code = normalizeLicenseCode(value);
    return code.length > 0 && code === BUYOUT_STUB_CODE;
  }

  // src/lib/quota.js
  function todayKey(date = /* @__PURE__ */ new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function usageCount(usage, today) {
    if (!usage || usage.date !== today) return 0;
    const count = Number(usage.count);
    if (!Number.isFinite(count) || count <= 0) return 0;
    return Math.floor(count);
  }
  function evaluateBulkAccess(input) {
    const today = input.today;
    const limit = input.limit ?? FREE_DAILY_BULK_LIMIT;
    const count = usageCount(input.usage, today);
    if (input.licensed) {
      return { allowed: true, remaining: null, licensed: true, count };
    }
    const remaining = Math.max(0, limit - count);
    return { allowed: remaining > 0, remaining, licensed: false, count };
  }
  function nextUsage(usage, today) {
    return { date: today, count: usageCount(usage, today) + 1 };
  }

  // src/content/main.js
  var PANEL_CSS = `
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
  var resumeStarted = false;
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
    getJob().then((job) => {
      if (job) return resumeJob(platform, ui, job);
      return null;
    }).catch((error) => ui.setStatus(error.message));
  }
  function mountPanel() {
    const host = document.createElement("div");
    host.id = "ace-export-root";
    host.style.cssText = "position:fixed;z-index:2147483646;right:16px;bottom:16px;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    const launcher = button("导出对话", "launcher");
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.hidden = true;
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = "AI 聊天导出";
    const close = button("收起", "ghost");
    header.append(title, close);
    const current = button("导出当前对话", "primary");
    const status = document.createElement("p");
    status.className = "muted";
    const heading = document.createElement("h2");
    heading.textContent = "批量导出";
    const quota = document.createElement("p");
    const block = document.createElement("div");
    block.className = "block";
    block.hidden = true;
    const empty = document.createElement("p");
    empty.hidden = true;
    const list = document.createElement("div");
    const refresh = button("刷新可见列表", "ghost");
    const selected = button("导出选中对话", "primary");
    const options = button("打开许可码选项", "ghost");
    const row = document.createElement("div");
    row.className = "row";
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
    launcher.addEventListener("click", open);
    close.addEventListener("click", shut);
    return {
      open,
      setStatus(text) {
        status.textContent = text || "";
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
          const label = document.createElement("label");
          label.className = "choice";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.dataset.id = item.id;
          input.dataset.title = item.title;
          input.dataset.url = item.url;
          const span = document.createElement("span");
          span.textContent = item.title;
          label.append(input, span);
          list.append(label);
        }
      },
      selectedItems() {
        return [...list.querySelectorAll("input:checked")].map((input) => ({
          id: input.dataset.id,
          title: input.dataset.title,
          url: input.dataset.url
        }));
      },
      showBlocked(copy) {
        block.hidden = false;
        block.replaceChildren();
        const lead = document.createElement("p");
        lead.textContent = copy.title;
        const link = document.createElement("a");
        link.href = copy.ctaHref;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = copy.ctaLabel;
        const handle = document.createElement("p");
        handle.textContent = `小红书：${copy.handle}`;
        const buyout = document.createElement("p");
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
        current.addEventListener("click", () => fn());
      },
      onExportSelected(fn) {
        selected.addEventListener("click", () => fn());
      },
      onRefresh(fn) {
        refresh.addEventListener("click", () => fn());
      },
      onOpenOptions(fn) {
        options.addEventListener("click", () => fn());
      }
    };
  }
  function button(text, className) {
    const el = document.createElement("button");
    el.type = "button";
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
      ui.setStatus("没有读到对话内容，已取消导出");
      return;
    }
    const markdown = conversationToMarkdown({ ...convo, exportedAt: (/* @__PURE__ */ new Date()).toISOString() });
    const response = await sendDownload({
      type: "download",
      kind: "markdown",
      filename: markdownFilename(platform, convo.title, idFromUrl(location.href)),
      markdown
    });
    ui.setStatus(response.ok ? "已开始下载当前对话" : `下载失败：${response.error || ""}`);
  }
  async function exportSelected(platform, ui) {
    if (resumeStarted) {
      ui.setStatus("已有批量任务进行中");
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
    const job = existing || await getJob();
    if (!job || resumeStarted) return;
    if (job.platform !== platform) {
      await clearJob();
      ui.setStatus("批量任务与当前站点不一致，已停止");
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
          exportedAt: (/* @__PURE__ */ new Date()).toISOString()
        })
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
    let status = "批量导出已开始下载";
    try {
      const files = assignUniqueMarkdownNames(job.files);
      const response = await sendDownload({
        type: "download",
        kind: "zip",
        filename: `对话批量-${todayKey()}.zip`,
        files
      });
      status = response.ok ? "批量导出已开始下载" : `下载失败：${response.error || ""}`;
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
      }, 12e3);
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
    return match ? match[1] : "";
  }
  function normalizeUrl(value) {
    try {
      const url = new URL(value, location.href);
      url.hash = "";
      const path = url.pathname.replace(/\/$/, "");
      return `${url.origin}${path}${url.search}`;
    } catch {
      return String(value || "");
    }
  }
  function storageGet(area, key) {
    return new Promise((resolve, reject) => {
      chrome.storage[area].get(key, (data) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(data ? data[key] : void 0);
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
    return storageGet("local", STORAGE_LICENSE).then((code) => isValidBuyoutCode(code));
  }
  function readUsage() {
    return storageGet("local", STORAGE_USAGE).then((usage) => usage || null);
  }
  function writeUsage(usage) {
    return storageSet("local", { [STORAGE_USAGE]: usage });
  }
  function getJob() {
    return storageGet("session", STORAGE_JOB).then((job) => job || null);
  }
  function setJob(job) {
    return storageSet("session", { [STORAGE_JOB]: job });
  }
  function clearJob() {
    return storageRemove("session", STORAGE_JOB);
  }
  function sendDownload(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ ok: false, error: err.message });
        else resolve(response || { ok: false, error: "无响应" });
      });
    });
  }
  boot();
})();
