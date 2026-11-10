# AI 聊天导出

Cut：`AI-CHAT-EXPORT-CUT-2026-11-10-v1`

把**当前打开**的 [Grok](https://grok.com) 或 [Gemini](https://gemini.google.com) 对话导出成 Markdown。可以勾选侧栏里**已经显示**的多条对话，打成一个只含 `.md` 的 zip。对话内容只在浏览器里读取，再下载到本机，扩展不会上传。

不支持 ChatGPT、Claude、x.com 上的 Grok、PDF、本地文件夹、Notion 或 Google Takeout。

## 安装（加载未打包的扩展）

```bash
npm install
npm test
npm run build
```

Chrome：打开 `chrome://extensions`，开启开发者模式，选择「加载已解压的扩展程序」，选中本仓库根目录（需要有 `manifest.json` 和 `dist/content.js`）。`dist/content.js` 是内容脚本的构建结果；改过 `src/` 之后重新执行 `npm run build`，再在扩展页点刷新。

## 使用

1. 打开 `grok.com` 或 `gemini.google.com` 的对话页。
2. 点右下角「导出对话」。
3. 「导出当前对话」不限次数。读不到正文时不会编造，并取消下载。
4. 「批量导出」在 Grok 上先读本站自己的对话列表（只请求第一页，不翻页）。读不到时再看侧栏里的按钮或非链接节点。都失败时，面板会用中英文写出试过的每一种办法。Gemini 仍只看页面上已经渲染的历史链接。
5. 至少勾选 2 条，再点「导出选中对话」。Grok 按对话 id 向 grok.com 读取正文并下载 zip，不会把内容发到别处；某一条失败会留在 zip 里并在面板点名，不会悄悄丢掉。Gemini 仍会在当前标签页依次打开这些对话。

页面上没有的标题、时间、代码语言不会补写。时间只在页面里存在 `time[datetime]` 时写入。

## 免费与买断占位

| 能力 | 免费档 | 本地许可码有效时 |
| --- | --- | --- |
| 当前对话 Markdown | 不限次数 | 不限次数 |
| 批量任务 | 每个自然日 3 次（`FREE_DAILY_BULK_LIMIT = 3`，按浏览器本地日期） | 不限次数 |

第 4 次批量会被拦住，并显示「有问题请联系我」，指向小红书搜索「珊哥爱读书」。同一位置和选项页都有「一次性买断（即将上线）」。

`BUYOUT_CHECKOUT_ENABLED = false`。没有付款按钮，也没有结账链接。选项页可以保存或清除一个**本地占位许可码**（只存在 `chrome.storage.local`）：

```text
ACE-LOCAL-0001
```

这不是收据，也不能用于任何真实商品。填错或清除后回到免费档。价格和正式发码不在这一版。

## 权限

| 权限 | 原因 |
| --- | --- |
| `https://grok.com/*` | 只在 Grok 对话页注入面板 |
| `https://gemini.google.com/*` | 只在 Gemini 对话页注入面板 |
| `storage` | 记住当日批量次数、本地许可码，以及一次批量任务的进度 |
| `downloads` | 把 Markdown 或 zip 下载到本机 |

没有全站权限，没有调试器权限，没有 `tabs` 读取浏览记录。

## 隐私

导出不发起网络请求。服务工作者只调用 `chrome.downloads` 把文件写到本机。唯一的外链是用户自己点击的小红书搜索，用来联系作者，不发送对话内容。

## 测试

夹具在 `test/fixtures/`，文件头标明 **SYNTHETIC FIXTURE**，不是从线上页面抓下来的。

```bash
npm test
```

## Grok 列表诊断

下面这段只在你已经打开的 grok.com 页面控制台里运行。它用相对地址读取本站接口，打印状态码和 JSON 的键名，不打印正文、cookie 或 token。接口路径都还没有在开发环境核实。

```javascript
const LIST = [
  '/rest/app-chat/conversations?pageSize=60',
  '/rest/app-chat/conversations',
  '/rest/app-chat/conversations_v2?pageSize=60',
];
const id = (location.pathname.match(/\/c\/([A-Za-z0-9_-]{8,})/) || [])[1] || '';
const contentPaths = id
  ? [
      '/rest/app-chat/conversations/' + id + '/responses',
      '/rest/app-chat/conversations_v2/' + id,
      '/rest/app-chat/conversations/' + id,
      '/rest/app-chat/conversations/' + id + '/response-node?includeThreads=true',
      '/rest/app-chat/conversations/' + id + '/load-responses',
    ]
  : [];
async function shape(path, options) {
  try {
    const res = await fetch(path, {
      method: options?.method || 'GET',
      credentials: 'include',
      headers: { accept: 'application/json', ...(options?.headers || {}) },
      body: options?.body,
    });
    const info = { status: res.status };
    if (!res.ok) return info;
    const data = await res.clone().json();
    info.type = Array.isArray(data) ? 'array' : typeof data;
    info.keys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 12) : [];
    const rows = Array.isArray(data) ? data : data.conversations || data.items || data.data || data.responses || data.messages || [];
    info.rowCount = Array.isArray(rows) ? rows.length : 0;
    info.rowKeys = rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).slice(0, 12) : [];
    return info;
  } catch {
    return { error: 'request failed' };
  }
}
for (const path of LIST) console.log(path, await shape(path));
const nodes = [...document.querySelectorAll('aside button, nav button, [role="navigation"] button, button, [role="button"]')];
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const sidebarHits = nodes.filter((node) => uuid.test(node.outerHTML.slice(0, 500))).length;
console.log('sidebar non-link uuid hits', sidebarHits, 'anchor /c/ hits', document.querySelectorAll('a[href*="/c/"]').length);
for (const path of contentPaths) {
  const options = path.endsWith('/load-responses')
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ responseIds: [] }) }
    : undefined;
  console.log(path, await shape(path, options));
}
```

`load-responses` 这一步在诊断里会带上空的 `responseIds`，只为了看状态码。扩展本身只有在前一个接口返回了 id、且没有正文时，才会把那些 id 发回 grok.com。

## 已知限制

- 本环境没有打开真实的 grok.com。列表接口、正文接口和侧栏非链接节点都**没有核实**。Shane 的页面上历史项不是 `a[href]`。
- Grok 批量只请求列表的第一页，不跟随下一页，也不做全库扫描。Gemini 批量仍会依次打开当前标签页里勾选的对话。
- 下载由服务工作者用 `data:` URL 交给 `chrome.downloads`。该环境没有 `URL.createObjectURL`。很大的对话可能超出浏览器对 data URL 的长度限制。
- 读不到正文时，zip 里对应文件只会说明没读到，不会编造对话。
- 内嵌的 data URL 图片只保留说明文字，避免把大段二进制写进 Markdown。普通 http(s) 图片保留链接。
