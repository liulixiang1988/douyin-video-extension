# 抖音视频下载扩展

面向 Chrome / Edge 的纯浏览器扩展。打开抖音视频详情页，点击扩展图标，选择画质并下载 MP4。无需 Python、本地助手或 AI 服务。

仓库同时提供 [douyin-download skill](skills/douyin-download/SKILL.md)，供 Codex 执行浏览器下载、画质选择和本地文件校验。

## 安装

安装包见 [GitHub Releases](https://github.com/liulixiang1988/douyin-video-extension/releases)。请选择 `douyin-video-extension-版本.zip`，并按以下步骤加载。

1. 在 Edge 打开 `edge://extensions`，或在 Chrome 打开 `chrome://extensions`。
2. 开启「开发人员模式」，选择「加载解压缩的扩展」。
3. 选择本项目的 `extension` 文件夹。使用 ZIP 分发包时，先解压，再选择包含 `manifest.json` 的文件夹。
4. 将扩展固定到工具栏。

升级时，将新版 ZIP 解压覆盖原来加载的扩展文件夹，在扩展管理页点击「重新加载」，再刷新抖音视频页。

## 安装 Codex skill

Skill 位于 [`skills/douyin-download`](skills/douyin-download)，包含入口说明、界面信息、MP4 校验/保存脚本和 blob/MSE 处理参考文档。它需要可用的浏览器工具及 Python 3，保存脚本只使用 Python 标准库。

克隆本仓库后，在仓库根目录运行以下 PowerShell 命令，将完整 skill 文件夹复制到 Codex 的个人技能目录：

```powershell
$skillInstallRoot = if ($env:CODEX_HOME) {
    Join-Path $env:CODEX_HOME 'skills'
} else {
    Join-Path $HOME '.codex\skills'
}
New-Item -ItemType Directory -Path $skillInstallRoot -Force | Out-Null
Copy-Item -LiteralPath '.\skills\douyin-download' -Destination $skillInstallRoot -Recurse -Force
```

安装后可以使用 `$douyin-download 视频链接`，也可以直接要求 Codex 下载抖音视频。默认优先最高可用画质、至少 720p，并保存到个人 OneDrive 的 `video` 文件夹；可在请求中指定其他目录。

Skill 的源码在本仓库中维护，更新后可重复复制到个人技能目录。浏览器扩展安装包只包含扩展文件；使用 skill 时请从源码仓库获取完整的 `skills/douyin-download` 文件夹。

## 使用

打开一条抖音视频详情页，让播放器出现在屏幕内并开始播放。点击扩展图标后，弹窗展示视频标题、实际播放尺寸、时长和当前可用的画质，默认选择最高可用级别。

如果清晰度菜单存在「1080p 登录即享」等标记，并且比当前可用画质更高，扩展仅在自己的弹窗中提示。它不会点击登录、读取 Cookie、填写验证码或要求用户先登录。用户可以直接下载现有画质；自行在网页登录后，点击弹窗右上角刷新即可。

点击下载会弹出浏览器的「另存为」窗口，可选择个人 OneDrive 的 `video` 文件夹。文件名包含标题、实际尺寸和视频编号，同名文件不会被静默覆盖。浏览器原有的下载安全检查继续生效。

## 支持范围

- 抖音 `/video/数字编号` 详情页，以及带 `modal_id` 的视频页面。
- 页面播放器当前提供的 HTTPS MP4 直链；高画质选择通过页面已有的清晰度控件完成。
- 播放器使用 `blob:` / MSE 时，通过页面的同源视频详情接口寻找同一视频、同一实际尺寸的完整 MP4。该请求只在用户操作扩展时发生，使用浏览器已有会话，不读取 Cookie。
- 切换画质后检查实际 `videoWidth` / `videoHeight`；下载前复查视频编号、分辨率和最新地址，避免连播造成误下载。
- 如无法识别清晰度菜单，只提供当前实际播放画质，明确提示未能识别菜单。
- 本版不处理图文集或直播，也不自行合并分段文件；对于 DASH 播放，下载平台同时提供的完整 MP4。若平台没有对应画质的完整 MP4，则明确提示，不把分段流或低画质文件冒充目标文件。
- 清晰度低于 720p 时提示实际级别，仍允许用户按所选画质保存。
- 分辨率以网页播放器实际解码尺寸为依据。下载进度及文件保存由浏览器管理，扩展不读取下载后的本地文件。

## 权限与数据

只申请 `activeTab`、`scripting`、`downloads`。没有常驻网页脚本、全站访问权限、Cookie 权限、服务器、统计或上传接口。只有用户点击扩展时才读取当前标签页；已选择的下载操作会在用户关掉弹窗后由浏览器继续完成。

## 开发与验证

开发环境建议使用 Node.js 24.15+（24.x）。运行 `npm ci`、`npm test`、`npm run check`。`npm run preview` 提供仅用于外观和交互检查的本地预览；预览使用模拟的浏览器接口，不会执行真实下载，不包含在扩展发布包内。

发布前执行 `npm run package`，需要 Python 3，仅使用标准库。它会核对版本号，在 `dist/` 生成可加载的扩展 ZIP 及 `SHA256SUMS.txt`，并验证压缩包与源文件逐字节一致。用户安装和运行扩展不需要 Node.js 或 Python。

自动化测试覆盖直链、blob 播放时的完整 MP4 解析、视频/画质/时长匹配、DASH 排除、连播变化和下载控制。清晰度控件结构和网页视频详情请求已与真实抖音页面核对。弹窗界面检查覆盖登录受限、已可用高画质、低画质和错误页面。

2026-10-17，用户确认更新至 v0.1.1 后，已能通过扩展下载此前报错的视频 `7691115495852434594`。这是用户在实际浏览器中的扩展下载验证。

页面解析适配 2026-10-17 观察到的 `.xgplayer .gear .item` 清晰度控件。抖音变更页面结构后，适配代码位于 `extension/page-task.js`。

完整 MP4 解析位于 `extension/resolve-source.js`。页面请求使用 `/aweme/v1/web/aweme/detail/` 和网页应用参数 `aid=6383`，严格核对返回的视频编号，只选择 `format=mp4` 且尺寸匹配的版本；接口变化时需要相应维护。
