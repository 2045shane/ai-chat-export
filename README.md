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
4. 「批量导出」只列出当前页已经渲染出来的历史。没有这种列表时显示「未找到对话列表，请在 grok.com 对话页打开」（Gemini 页会写成 gemini.google.com），并附一句英文。
5. 至少勾选 2 条，再点「导出选中对话」。扩展会在**当前标签页**里依次打开这些对话，然后下载 `对话批量-日期.zip`。

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

## 已知限制

- 本环境没有打开真实的 Grok / Gemini 页面。侧栏选择器是按公开描述写的假设，**没有在线上 DOM 核对过**。列表为空时，先确认自己在对话页，再点「刷新可见列表」。
- 下载由服务工作者用 `data:` URL 交给 `chrome.downloads`。该环境没有 `URL.createObjectURL`。很大的对话可能超出浏览器对 data URL 的长度限制。
- 批量列表不滚动、不翻页，也不做全库扫描。侧栏还没渲染出来时，先点「刷新可见列表」。
- 批量导出会离开当前页，依次打开勾选的对话；中途关掉标签页，这次任务停止（免费次数在任务开始时扣除）。
- 读不到正文时，zip 里对应文件只会说明没读到，不会编造对话。
- 内嵌的 data URL 图片只保留说明文字，避免把大段二进制写进 Markdown。普通 http(s) 图片保留链接。
