# FEATURE_MAP

给后续改这个扩展的人。范围以 cut `AI-CHAT-EXPORT-CUT-2026-11-10-v1` 为准。

## 用户能看见的东西

| 表面 | 文件 | 行为 |
| --- | --- | --- |
| 页内面板 | `src/content/main.js` | 仅 `grok.com`、`gemini.google.com`。右下角「导出对话」。中文。 |
| 当前对话 | 同上，`exportCurrent` | 下载一个 `.md`。不计入每日批量次数。 |
| 批量 | `exportSelected` | Grok：按 id 向 grok.com 读取正文再打 zip，不逐页打开。Gemini：仍由 `resumeJob` 在当前标签页依次打开。至少 2 条。失败的条目留在 zip 里并在面板点名。 |
| 空列表 | `discoverGrokHistory` / `historyListState` | Grok 会写出试过的每一种办法（中英）。Gemini 仍是「请打开对话页」。不算导出失败。 |
| 触顶 | `blockedBulkCopy` | 「有问题请联系我」→ 小红书搜索「珊哥爱读书」；另有「一次性买断（即将上线）」，无链接。 |
| 弹窗 | `src/popup.html` | 说明要在对话页使用，并打开选项。 |
| 选项 | `src/options.js` | 保存 / 清除本地许可码。始终显示买断占位文案。无付款按钮。 |

## 模块

| 模块 | 职责 |
| --- | --- |
| `src/extract/grok.js` | **E1 不变。** `extractGrok` 仍从当前页 DOM 读正文。`listGrokHistory` 只作为批量列表的最后一道 `a[href]` 兜底。Shane 的真实页面上这类链接是 0 条。 |
| `src/extract/grok-bulk.js` | **仅 Grok 批量。未核实。** 列表按顺序 GET：`/rest/app-chat/conversations?pageSize=60`、`/rest/app-chat/conversations`、`/rest/app-chat/conversations_v2?pageSize=60`。只取第一页，不跟随下一页。正文按 id GET：`.../responses`、`.../conversations_v2/<id>`、`.../conversations/<id>`、`.../response-node?includeThreads=true`。只有前一个响应里有 response id、且没有正文时，才 POST `.../load-responses`，body 只有这些 id。然后才看侧栏 `button` / `[role=button]` / `data-*` 上的 uuid，最后才看 `a[href]`。同源、`credentials: 'include'`，不把对话发到 grok.com 以外。 |
| `src/extract/gemini.js` | `extractGemini`、`listGeminiHistory`。`div.conversation-container` 里的 `user-query` 与 `model-response`；没有容器时按这两种元素的顺序读。历史优先 `a[data-test-id="conversation"]`。本轮没有改。 |
| `src/extract/index.js` | `platformFromHostname` 只认这两个主机名。`x.com`、`www.grok.com` 都不认。 |
| `src/lib/markdown.js` | `htmlToMarkdown`、`conversationToMarkdown`。角色写成「用户 / Grok / Gemini」。代码块保留语言，表格转成 Markdown，链接保留。没有标题或 `time[datetime]` 就不写。 |
| `src/lib/visible.js` | `isRenderedVisible`。`hidden`、`display:none`、`visibility:hidden` 不算。不滚动去加载更多。 |
| `src/lib/quota.js` | `evaluateBulkAccess`、`nextUsage`、`todayKey`。本地自然日，上限来自常量。 |
| `src/lib/license.js` | `isValidBuyoutCode`、`describeLicense`。只比较本地占位码。 |
| `src/lib/constants.js` | `FREE_DAILY_BULK_LIMIT = 3`，`BUYOUT_CHECKOUT_ENABLED = false`，`BUYOUT_STUB_CODE`。 |
| `src/lib/copy.js` | 触顶文案、空列表文案、买断占位。`buyoutPlaceholder().href` 恒为 `null`。 |
| `src/lib/bulk.js` | `createBulkJob`（少于 2 条失败）、`recordExtracted`、`assignUniqueMarkdownNames`。 |
| `src/lib/zip.js` | `buildZip`。无压缩 zip，里面只有传入的 Markdown。 |
| `src/lib/filename.js` | `markdownFilename`。去掉路径字符。 |
| `src/background.js` | 消息 `type: "download"`。`kind: "markdown"` 或 `"zip"`。把 UTF-8 字节做成 `data:` URL（Markdown 为 `text/markdown;charset=utf-8`，zip 为 `application/zip`）再交给 `chrome.downloads`。服务工作者里没有 blob URL API，所以这里不用它。没有新增权限。 |
| `manifest.json` | `storage` + `downloads`。host 只有上面两个站点。 |

## 存储

| 键 | 区域 | 含义 |
| --- | --- | --- |
| `buyoutCode` | `local` | 用户输入的占位许可码 |
| `bulkUsage` | `local` | `{ date: YYYY-MM-DD, count }` |
| `bulkJob` | `session` | 进行中的批量队列、下标、已读出的 Markdown |

批量次数在任务被接受时 +1，不在单条导出时 +1。有效许可码不写入 `bulkUsage`。

## 测试

| 文件 | 覆盖 |
| --- | --- |
| `test/fixtures/grok-synthetic.html` | 合成 DOM，不是线上抓取 |
| `test/fixtures/gemini-synthetic.html` | 同上 |
| `test/extract-grok.test.js` | E1 的离线部分：角色、代码、表格、链接、不编造 |
| `test/extract-gemini.test.js` | E2 的离线部分 |
| `test/quota-license.test.js` | E3 的次数与 E4 的三态 |
| `test/zip.test.js` | zip 里只有 Markdown |
| `test/policy.test.js` | manifest 主机、无上传调用 |
| `test/build.test.js` | 内容脚本能打包，且买断开关仍是关闭文案 |
| `test/download-sw.test.js` | 服务工作者路径：单条 Markdown 与至少两条的 zip 都用 `data:` URL；源码不得出现服务工作者里不存在的页面 API |
| `test/grok-bulk.test.js` | Grok 批量：多种 JSON 形状、接口尝试顺序、侧栏兜底、按 id 打 zip、单条失败保留、失败文案列出全部尝试 |
| `.github/workflows/test.yml` | push 和 pull request 上跑 `npm ci` 与 `npm test` |

`npm test` 跑以上测试。加载扩展前还要 `npm run build`，产物是 `dist/content.js`（IIFE，给不能用 ES module 的内容脚本）。服务工作者仍是 `src/background.js`，不打进这个包。

## 不要在这个仓库里加的东西

ChatGPT、Claude、PDF、文件夹、Notion API、Takeout、全库扫描、支付 SDK、结账链接、全站权限、调试器权限。
