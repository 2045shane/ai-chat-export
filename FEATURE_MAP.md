# FEATURE_MAP

给后续改这个扩展的人。范围以 cut `AI-CHAT-EXPORT-CUT-2026-11-10-v1` 为准。

## 用户能看见的东西

| 表面 | 文件 | 行为 |
| --- | --- | --- |
| 页内面板 | `src/content/main.js` | 仅 `grok.com`、`gemini.google.com`。右下角「导出对话」。中文。 |
| 当前对话 | 同上，`exportCurrent` | 下载一个 `.md`。不计入每日批量次数。 |
| 批量 | 同上，`exportSelected` / `resumeJob` | 勾选至少 2 条可见历史，当前标签页依次打开，最后下载一个 zip。 |
| 空列表 | `historyListState` | 中英提示：未找到对话列表，请打开对应站点的对话页。不把这当成导出失败。 |
| 触顶 | `blockedBulkCopy` | 「有问题请联系我」→ 小红书搜索「珊哥爱读书」；另有「一次性买断（即将上线）」，无链接。 |
| 弹窗 | `src/popup.html` | 说明要在对话页使用，并打开选项。 |
| 选项 | `src/options.js` | 保存 / 清除本地许可码。始终显示买断占位文案。无付款按钮。 |

## 模块

| 模块 | 职责 |
| --- | --- |
| `src/extract/grok.js` | `extractGrok`、`listGrokHistory`。正文优先 `[data-testid="user-message|assistant-message"]`，否则 `.message-bubble`（`.items-end` 视为用户）。历史假设是 `nav` / `aside` / `[role="navigation"]` 里指向 `/c/` 或 `/chat/` 的链接；这类容器一个都没有时，才退回页面上所有同类链接。**这些选择器没有在真实 grok.com 上核实。** QA 第 1 轮看到空列表，当时的页面可能不是对话页。不要把选择器写成已验证。 |
| `src/extract/gemini.js` | `extractGemini`、`listGeminiHistory`。`div.conversation-container` 里的 `user-query` 与 `model-response`；没有容器时按这两种元素的顺序读。历史优先 `a[data-test-id="conversation"]`。 |
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
| `.github/workflows/test.yml` | push 和 pull request 上跑 `npm ci` 与 `npm test` |

`npm test` 跑以上测试。加载扩展前还要 `npm run build`，产物是 `dist/content.js`（IIFE，给不能用 ES module 的内容脚本）。服务工作者仍是 `src/background.js`，不打进这个包。

## 不要在这个仓库里加的东西

ChatGPT、Claude、PDF、文件夹、Notion API、Takeout、全库扫描、支付 SDK、结账链接、全站权限、调试器权限。
