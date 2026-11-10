const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'SVG',
  'BUTTON',
  'NOSCRIPT',
  'CANVAS',
  'IFRAME',
  'MAT-ICON',
]);

export function htmlToMarkdown(root) {
  if (!root) return '';
  const rendered = renderContainer(root)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return rendered ? `${rendered}\n` : '';
}

export function conversationToMarkdown(convo) {
  const platformLabel = convo.platform === 'grok' ? 'Grok' : convo.platform === 'gemini' ? 'Gemini' : '';
  const lines = [];
  if (convo.title) lines.push(`# ${convo.title}`, '');
  if (platformLabel) lines.push(`- 平台: ${platformLabel}`);
  if (convo.url) lines.push(`- 页面: ${convo.url}`);
  if (convo.time) lines.push(`- 时间: ${convo.time}`);
  if (convo.exportedAt) lines.push(`- 导出时间: ${convo.exportedAt}`);
  lines.push('');
  const messages = Array.isArray(convo.messages) ? convo.messages : [];
  if (messages.length === 0) {
    lines.push('（未能从当前页面读到对话内容，未编造正文。）', '');
  }
  for (const message of messages) {
    const role = message.role === 'user' ? '用户' : platformLabel || '助手';
    lines.push(`## ${role}`, '', String(message.markdown || '').trim(), '');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function renderContainer(el) {
  let out = '';
  for (const node of el.childNodes) out += renderNode(node);
  return out;
}

function renderNode(node) {
  if (!node) return '';
  if (node.nodeType === 3) return String(node.nodeValue || '').replace(/\u00a0/g, ' ');
  if (node.nodeType !== 1) return '';
  const el = node;
  const tag = el.tagName;
  if (SKIP_TAGS.has(tag) || tag.endsWith('-ICON')) return '';
  if (el.getAttribute && el.getAttribute('role') === 'button') return '';
  if (el.hasAttribute && el.hasAttribute('hidden')) return '';
  if (tag === 'BR') return '\n';
  if (tag === 'CODE-BLOCK' || hasClass(el, 'code-block')) return renderCodeBlock(el);
  if (tag === 'PRE') return renderPre(el);
  if (tag === 'TABLE') return renderTable(el);
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `\n${'#'.repeat(level)} ${collapse(renderContainer(el))}\n\n`;
  }
  if (tag === 'UL') return renderList(el, false, 0);
  if (tag === 'OL') return renderList(el, true, 0);
  if (tag === 'BLOCKQUOTE') {
    const inner = renderContainer(el).trim();
    if (!inner) return '';
    return `\n${inner.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
  }
  if (tag === 'HR') return '\n---\n\n';
  if (tag === 'IMG') return renderImage(el);
  if (tag === 'A') return renderLink(el);
  if (tag === 'STRONG' || tag === 'B') {
    const text = collapse(renderContainer(el));
    return text ? `**${text}**` : '';
  }
  if (tag === 'EM' || tag === 'I') {
    const text = collapse(renderContainer(el));
    return text ? `*${text}*` : '';
  }
  if (tag === 'CODE') return renderInlineCode(el);
  if (tag === 'P') {
    const text = renderContainer(el).trim();
    return text ? `${text}\n\n` : '';
  }
  return renderContainer(el);
}

function collapse(value) {
  return String(value || '').replace(/\s*\n+\s*/g, ' ').trim();
}

function hasClass(el, name) {
  const cls = typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '';
  return cls.split(/\s+/).includes(name);
}

function renderLink(el) {
  const href = el.getAttribute('href') || '';
  const text = collapse(renderContainer(el)) || href;
  if (!href || href.startsWith('javascript:')) return text;
  return `[${text}](${href})`;
}

function renderImage(el) {
  const alt = (el.getAttribute('alt') || '').trim();
  const src = el.getAttribute('src') || '';
  if (/^https?:\/\//i.test(src)) return `![${alt}](${src})`;
  return alt ? `（图片：${alt}）` : '';
}

function renderInlineCode(el) {
  const text = String(el.textContent || '').replace(/\u00a0/g, ' ');
  if (!text.trim()) return '';
  if (text.includes('\n')) return fence(languageOf(el), text);
  return `\`${text.replace(/`/g, '\\`')}\``;
}

function renderPre(el) {
  const code = el.querySelector('code');
  const raw = code ? code.textContent : el.textContent;
  const text = String(raw || '').replace(/\u00a0/g, ' ').replace(/\n$/, '');
  return fence(languageOf(code) || languageOf(el), text);
}

function renderCodeBlock(el) {
  const code = el.querySelector('code');
  const pre = el.querySelector('pre');
  const source = code || pre;
  const text = String(source ? source.textContent : '')
    .replace(/\u00a0/g, ' ')
    .replace(/^\n/, '')
    .replace(/\n$/, '');
  const lang = languageOf(code) || languageOf(pre) || decorationLanguage(el);
  return fence(lang, text);
}

function fence(lang, text) {
  const body = String(text || '').replace(/\n$/, '');
  return `\n\`\`\`${lang || ''}\n${body}\n\`\`\`\n\n`;
}

function languageOf(el) {
  if (!el || el.nodeType !== 1) return '';
  const data = el.getAttribute('data-language') || el.getAttribute('data-lang') || '';
  if (/^[\w#+.-]{1,24}$/.test(data)) return data.toLowerCase();
  const cls = `${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('class') || ''}`;
  const match = cls.match(/(?:language|lang)-([\w#+.-]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function decorationLanguage(el) {
  const deco = el.querySelector('.code-block-decoration, .code-block-header');
  if (!deco) return '';
  for (const span of deco.querySelectorAll('span')) {
    if (span.querySelector('span, button')) continue;
    const text = span.textContent.trim();
    if (/^[\w#+.-]{1,24}$/.test(text)) return text.toLowerCase();
  }
  return '';
}

function renderTable(table) {
  const headRow = table.querySelector('thead tr');
  let header = [];
  let body = [];
  if (headRow) {
    header = rowCells(headRow);
    body = [...table.querySelectorAll('tbody tr')].map(rowCells);
  } else if (table.rows && table.rows.length) {
    header = rowCells(table.rows[0]);
    body = [...table.rows].slice(1).map(rowCells);
  }
  if (!header.length) return '';
  const width = Math.max(header.length, ...body.map((row) => row.length), 1);
  const pad = (row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  };
  const line = (row) => `| ${pad(row).join(' | ')} |`;
  const sep = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  const bodyText = body.map(line).join('\n');
  return `\n${line(header)}\n${sep}\n${bodyText}${bodyText ? '\n' : ''}\n`;
}

function rowCells(tr) {
  return [...tr.children]
    .filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD')
    .map((cell) => collapse(renderContainer(cell)).replace(/\|/g, '\\|'));
}

function renderList(list, ordered, depth) {
  const items = [...list.children].filter((node) => node.tagName === 'LI');
  if (!items.length) return '';
  const lines = items.map((item, index) => {
    const nested = [...item.children].filter((node) => node.tagName === 'UL' || node.tagName === 'OL');
    let text = '';
    for (const child of item.childNodes) {
      if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) continue;
      text += renderNode(child);
    }
    text = text.replace(/\n{2,}/g, '\n').trim();
    const indent = '  '.repeat(depth);
    const marker = ordered ? `${index + 1}. ` : '- ';
    const nestedText = nested
      .map((node) => renderList(node, node.tagName === 'OL', depth + 1).trimEnd())
      .filter(Boolean)
      .join('\n');
    return `${indent}${marker}${text}${nestedText ? `\n${nestedText}` : ''}`;
  });
  return `\n${lines.join('\n')}\n\n`;
}
