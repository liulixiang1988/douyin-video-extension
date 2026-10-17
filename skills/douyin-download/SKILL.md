---
name: douyin-download
description: "Download videos from Douyin links at the highest accessible resolution, at least 720p by default, to personal OneDrive or a specified folder. Use for 下载抖音视频、保存抖音到 OneDrive, choosing download quality, or downloading another Douyin video."
---

# Douyin Download

Download the requested video through its browser session, then verify and save the MP4. Direct playback downloads were verified on Windows on 2026-10-17. On macOS on 2026-10-18, both the Codex built-in browser with approved full CDP access and the standalone Edge resolver downloaded a verified 2560×1440 MP4.

Distinguish agent-assisted downloads from browser-extension verification. If the user asks about the extension, exercise its real download path or obtain the user's test result; a download through this skill is not evidence that the extension works. For a `blob:` player or extension troubleshooting, read [references/blob-and-extension.md](references/blob-and-extension.md).

## Destination

The user's established default is personal OneDrive's `video` folder. Resolve it from `OneDriveConsumer`, falling back to an existing `~/OneDrive`; honor an explicit destination instead. Verify the account when `OneDrive` could mean a work account. On macOS, `~/OneDrive` may be a link to `~/Library/CloudStorage/OneDrive-Personal`; the helper resolves that link.

## Load the requested video

1. Extract the Douyin URL from the user's share text; ignore the surrounding share codes. Open that URL through the available `mcp__cua_repl` browser tools. Read their current documentation before using browser APIs. On first initialization, make only the entry-point call required by the tool, for example:

   ```javascript
   var douyinTab = await cua.createBrowserTab("iab", "USER_SHARE_URL", { visible: false });
   ```

   Reuse an appropriate existing tab when available. Keep browser work in the background unless user interaction is needed.

2. Record the requested video ID from either `/video/<id>` or the `modal_id=<id>` query parameter, including `/jingxuan?modal_id=<id>`. Both identify the same video; a detail-page fallback is `https://www.douyin.com/video/<id>`. Read the page state until that video's title and player are available. A first response may show a generic title, loading text, or a temporary server error. For a persistent error, make one controlled retry of the canonical video URL and inspect the result.

   Douyin can automatically advance to a recommended video. Compare the current page URL and visible title with the requested video before downloading; restore the requested URL if it advanced. A `/note/` photo collection is a different media type: report that instead of inventing an MP4.

3. When the player is present, inspect its DOM for the actual loaded media and duration. With the currently documented API:

   ```javascript
   nodeRepl.write(await douyinTab.playwright.evaluate(() =>
     Array.from(document.querySelectorAll('video')).map(v => ({
       src: v.currentSrc,
       duration: Number.isFinite(v.duration) ? v.duration : null,
       width: v.videoWidth,
       height: v.videoHeight,
       outerHTML: v.outerHTML.slice(0, 1600)
     }))
   ));
   ```

   Choose the loaded player associated with the requested video using attributes actually observed in this DOM. Empty elements and preloaded recommendations may coexist with the real player, including several videos with `data-index="-1"`. An observed ancestor class `video_<id>` can scope the locator to the requested video. When the source URL contains `__vid`, it must match the requested ID. Record the title, duration and dimensions before download.

   `currentSrc` may be an HTTPS MP4 in one browser and a `blob:` / MSE handle in another. A blob handle is not a downloadable file URL, but does not establish that a complete MP4 is unavailable. Follow the linked blob reference before declaring that media unsupported.

## Select the best available resolution

The user's preference is **at least 720p, with the highest available resolution preferred**. Apply an explicit quality request instead when given. Treat the shorter encoded dimension as the threshold for both landscape and portrait videos: 1280×720 and 720×1280 meet 720p.

1. Open the player's visible `Quality` / `清晰度` menu. Inspect the offered levels and choose the highest accessible one. An automatic setting can select a lower stream, so select a named quality when available. Dismiss an unrelated login overlay before trying to open the menu. The menu is not an authoritative maximum for complete-file downloads: Edge showed up to 1080p while its own authenticated details response supplied a full 2K MP4. Before proposing a downgrade, use the complete-source resolver through an approved in-app CDP session or the standalone helper to check candidates at the user's requested minimum.
2. If the session is already logged in, use its highest available quality directly. If a higher level requires login, first identify the highest level available without login and ask the user to choose, using the actual observed levels: “这个视频最高支持 1080p，需要登录；不登录最高可下载 720p。你要登录下载更高画质，还是不登录下载当前最高画质？” Honor a login choice already stated for this download instead of asking again. Wait for the choice; an unanswered question is not a decision.

   **User chooses login:** show the normal login page and let the user complete authentication. Resume the same video and inspect its current dimensions before selecting quality again. The pending selection can take effect automatically: this workflow successfully downloaded and verified 1920×1080 with audio after login on 2026-10-17.

   **User chooses not to log in:** dismiss the login prompt and download the highest quality actually available in the signed-out session. This choice authorizes that fallback; do not ask again, keep prompting for login, or stop just because a higher level is locked. If the available maximum is below 720p, disclose that in the choice when known, then use the selected fallback's actual resolution as the helper's minimum. Preserve an explicit hard minimum given for the current request. If no video is accessible without login, explain that there is no signed-out version to download.
3. For a download from the currently playing media element, verify `videoWidth` / `videoHeight` match the intended level; the menu selection alone does not prove the stream switched. For complete-source resolution, the player establishes identity and duration, while each complete MP4 candidate establishes available resolution. The player may stay at 720p while a verified 2K file is downloaded. In both cases, validate the saved file's encoded dimensions with the helper.
4. If the highest accessible source is below 720p and the user has not already chosen the signed-out fallback or accepted lower quality, report the available resolution and ask whether it is acceptable. Use the user's selected level as the helper's minimum. Do not upscale a low-resolution source to claim it meets the threshold.

## Download and save

1. For a direct MP4, call the supported `downloadMedia` on an unambiguous, verified player locator and use the returned local path. For example, **only if the ancestor class and attribute were observed**, replace `<requested-id>`:

   ```javascript
   var downloadedPath = await douyinTab.playwright
     .locator('.video_<requested-id> video[data-index="-1"]')
     .downloadMedia({ timeoutMs: 60000 });
   nodeRepl.write(downloadedPath);
   ```

   If that ancestor is absent, build another unique locator from the observed DOM. For blob playback, resolve and download a matching complete MP4 through a supported tool surface as described in the reference. In the built-in browser, prefer the [approved CDP workflow](references/in-app-browser.md) to reuse its existing login. Discover its `cdp` capability before concluding that a separate browser is needed. If that route is unavailable or the user prefers another browser, use the [standalone browser helper](references/standalone-browser.md) where local browser automation is permitted. This helper provides its own browser session; it does not reuse the in-app browser login. Do not work around restrictions of an active browser tool. The browser handles its own session. Prefer this working path over installing a separate downloader: direct HTTP/yt-dlp requests returned HTTP 403 and a fresh-session requirement during the verified run. Download URLs expire; obtain them afresh for each video and keep them out of persistent skill files or diagnostic output.

2. Run [scripts/save_video.py](scripts/save_video.py) with the returned path and observed metadata. Resolve the script relative to this skill's actual location. In PowerShell, use literal arguments and UTF-8:

   ```powershell
   python -X utf8 '<skill-directory>\scripts\save_video.py' `
     --source '<returned-download-path>' `
     --title '<observed-title>' `
     --video-id '<requested-video-id>' `
     --expected-duration <observed-seconds> `
     --min-resolution <required-short-side-pixels>
   ```

   The minimum defaults to 720. Pass the selected level's actual shorter dimension: use 1080 for a 1920×1080 download, or 540 when the user chose a signed-out fallback whose maximum is 960×540. This both detects a stale lower-quality stream and permits an authorized lower-quality fallback. Add actual dimensions to `--title` when saving a quality upgrade to make the variants easy to distinguish. Add `--output-dir '<requested-folder>'` for an explicit destination. Add `--require-audio` only when an audio track is expected; silent videos are valid. Use safely quoted literal values, not shell expressions assembled from page text.

   The helper validates MP4 structure, encoded dimensions, video tracks and duration, sanitizes Windows filenames, preserves different existing files, reuses identical files, and verifies the saved copy by SHA-256. It reads encoded sample dimensions instead of display scaling metadata. It uses Python's standard library and leaves the browser download intact. It does not convert other formats by renaming them.

3. For an agent-assisted download, completion requires a successful helper result with the final path. Return a clickable local file link and concise size/duration/resolution information. Describe it as saved to the OneDrive **sync folder**; claim cloud upload only when synchronization was separately confirmed. For extension work, report the actual extension version and the evidence from its own runtime or the user's test, following the reference.

## When the page cannot supply the video

If the controlled retry still fails, report the observed blocker. For login-gated quality, follow the user's login choice above. Retain the relevant tab for user continuation only when the user chooses login or another necessary interaction remains pending; follow the active browser tool's interaction policy for CAPTCHA. Resume from that page after the user completes the required step. Keep authentication in the browser; exporting cookies, installing unofficial parsers, or modifying access controls is outside this workflow.

If media download fails despite a working player, use a supported page-assets download capability if the current browser documentation provides one. If no supported route yields a complete file, report that download is incomplete rather than treating a share link or HTML error page as the video.
