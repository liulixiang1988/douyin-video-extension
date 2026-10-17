# Blob playback and extension verification

Read this when the player's `currentSrc` is `blob:`, or when the task concerns the `douyin-video-extension` browser extension.

## Resolve a complete MP4

In the verified failure, the same Douyin video played through a direct HTTPS MP4 in the agent's browser and through a blob-backed player in the user's browser. Extension v0.1.0 rejected the blob handle. Matching the URL shape alone did not establish download support.

The working fallback uses the page's normal same-origin video-details request:

```text
GET /aweme/v1/web/aweme/detail/?aweme_id=<requested-id>&aid=6383
```

The web application parameter `aid=6383` matters: the tested response included complete 1080p MP4 and DASH variants, whereas omitting it returned a different set of media variants. Use the current browser session for this read. Copying old signed request strings is not a reliable substitute.

Use only browser-session request surfaces permitted by the current tools. In the extension, the implementation runs through `chrome.scripting.executeScript` in the page's `MAIN` world and uses `fetch` with `credentials: 'same-origin'`. Read-only `playwright.evaluate` is for DOM inspection, not for transplanting this network operation. If the available agent tools cannot make the request or download the resolved media, use a supported media/page-assets capability or explain the concrete tool limitation. Keep authentication in the browser.

Accept a result only when:

1. The current URL's `/video/<id>` or `modal_id` still matches the requested video, both before and after the request.
2. `status_code` is `0` and `aweme_detail.aweme_id` matches exactly.
3. The metadata's duration agrees with the current player; the validated implementation allows the larger of one second or one percent.
4. A candidate in `video.bit_rate` has `format: 'mp4'`, and its `play_addr.width` / `height` match the actual player dimensions. Matching `play_addr_h264`, `play_addr`, or `play_addr_265` may also be used when `video.format` confirms MP4. Original-video dimensions at `video.width` / `height` alone do not identify the candidate's resolution.
5. The selected `url_list` entry is HTTPS. Exclude DASH, HLS manifests and media segments, even if they have a high bitrate or an MP4-like container name. Among equivalent full MP4 candidates, prefer H.264 compatibility and then higher bitrate.

Recheck the current player's identity and dimensions immediately before download. If only lower-quality MP4 alternatives are available, report their actual quality and follow the user's quality choice; never label one as the selected higher resolution. A blob handle is not converted into a full video by renaming it `.mp4`.

The maintained implementation and regression tests are in the extension repository:

- [v0.1.1 source resolver](https://github.com/liulixiang1988/douyin-video-extension/blob/v0.1.1/extension/resolve-source.js)
- [v0.1.1 blob download tests](https://github.com/liulixiang1988/douyin-video-extension/blob/v0.1.1/test/blob-source.test.js)

Keep signed CDN URLs, authentication headers and cookies out of saved examples and diagnostics. Record video IDs, response status, format, dimensions and duration instead.

## Preserve the extension's product behavior

The extension is a pure-browser solution. It uses the current webpage session, offers accessible quality choices and shows an informational higher-quality login notice when the user clicks the extension icon. It does not operate login or block a current-quality download while waiting for login. The user may log in on the website and refresh the popup.

Saving goes through the browser's Save As dialog; the user can choose OneDrive or another directory. The agent's Python copy/validation helper is part of the agent-assisted workflow, not an extension dependency or a substitute for testing the extension.

## Evidence and completion

Track these separately:

- **Agent download:** a browser tool downloaded the file and the local helper verified it.
- **Extension automated test:** extension parsing/download code passed a fixture or mocked browser test.
- **Real extension download:** the loaded extension completed a real download, observed through its runtime or confirmed by the user.

Report only the level established. In this session, the user explicitly confirmed that v0.1.1 could download the previously failing video `7691115495852434594`; that is user-confirmed real extension success, not independent measurement of the downloaded file's dimensions or audio tracks.

For a version update, have the user replace the files in the originally loaded extension directory, reload the extension and refresh the video page when those steps cannot be performed through the available tools. If a browser tool blocks an extension-management URL, hand off that management step instead of attempting another route around the block. When verification succeeds, update the repository and Release validation notes if maintaining that project is within the current task.
