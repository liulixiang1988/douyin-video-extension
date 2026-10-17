# Built-in browser: approved CDP download

Use this route to reuse the existing built-in browser login and download a complete MP4 even when the player uses blob/MSE. No external browser or Chrome extension is required. Respect the user's browser choice and the active tools' permission checks.

## Discover and authorize the capability

1. Bind the intended built-in tab through the documented cua entry point. Check its URL: Douyin auto-advance can change modal_id while leaving an old page title. Restore the requested video when needed.
2. Call `tab.capabilities.list()`. If `cdp` is listed, acquire it and read `documentation()` before sending commands. Browser-level capability listings alone do not answer this question: CDP is a **tab** capability.
3. If absent, explain the required access and ask the user to enable **Settings → Browser → Developer mode → Enable full CDP access**. Full CDP exposes sensitive page/runtime/network internals and requires explicit website approval. Honor prior approval for the same task; let the product enforce its origin-scoped approval flow. Do not edit configuration or use an undocumented transport to bypass this gate. If managed policy disables it, stop this route.
4. After the user enables it, refresh the capability list. If the bound runtime still shows stale capabilities, reset cua_repl once and rebind the same tab according to the first-call rules, then discover capabilities again. Do not repeatedly ask the user to enable the same setting.

Official setup: https://learn.chatgpt.com/docs/browser#developer-mode

## Resolve the full source in the same page session

Use the shared `scripts/resolve_source.mjs`. It makes the normal same-origin details request, validates video ID and duration, excludes manifests/segments, and ranks complete MP4 candidates meeting the user's minimum. Do not run this network operation through the read-only Playwright evaluate API.

Example after binding `douyinTab`, reading CDP documentation, confirming the video container in the DOM and receiving the required permission:

```javascript
var requestedVideoId = '7668119425446350122';
var minimumResolution = 1440;
var dyCdp = await douyinTab.capabilities.get('cdp');
var dyFs = await import('node:fs/promises');
// Resolve this path from the actual installed skill directory.
var resolverSource = (await dyFs.readFile(SKILL_DIRECTORY + '/scripts/resolve_source.mjs', 'utf8'))
  .replace('export async function', 'async function');
var expected = await douyinTab.playwright
  .locator('.video_' + requestedVideoId + ' video')
  .evaluate(v => ({width:v.videoWidth, height:v.videoHeight, duration:v.duration}));
expected.id = requestedVideoId;
expected.minimumResolution = minimumResolution;
var resolution = await dyCdp.send('Runtime.evaluate', {
  expression: '(' + resolverSource + ')(' + JSON.stringify(expected) + ')',
  awaitPromise: true,
  returnByValue: true
}, {timeoutMs:20000});
var selected = resolution.result?.value;
if (!selected?.ok) throw new Error(selected?.message || 'Source resolution failed');
nodeRepl.write({id:selected.id, width:selected.width, height:selected.height, duration:selected.duration});
```

Keep `selected.source` only in memory; do not print signed CDN URLs or export cookies. A 720p player may still have a complete 2K candidate. The candidate's own dimensions and final file validation determine download quality.

## Download through the built-in browser

The verified bridge is a temporary hidden file link created through the authorized CDP surface, followed by the documented `downloadMedia` method. This uses the browser's download path and login session. Remove the link in `finally` even on failure.

```javascript
var linkId = 'douyin-skill-download-' + Date.now();
var created = false;
var downloadedPath;
try {
  var linkResult = await dyCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const u = new URL(location.href);
      const parts = u.pathname.split('/');
      const id = parts[1] === 'video' ? parts[2] : u.searchParams.get('modal_id');
      if (id !== ${JSON.stringify(requestedVideoId)}) throw new Error('Video changed');
      if (document.getElementById(${JSON.stringify(linkId)})) throw new Error('Link collision');
      const a = document.createElement('a');
      a.id = ${JSON.stringify(linkId)};
      a.href = ${JSON.stringify(selected.source)};
      a.download = 'douyin-' + ${JSON.stringify(requestedVideoId)} + '.mp4';
      a.hidden = true;
      document.body.appendChild(a);
      return true;
    })()`,
    returnByValue: true
  });
  created = linkResult.result?.value === true;
  if (!created) throw new Error('Could not prepare the download link');
  downloadedPath = await douyinTab.playwright.locator('#' + linkId)
    .downloadMedia({timeoutMs:60000});
  nodeRepl.write({downloadedPath});
} finally {
  if (created) await dyCdp.send('Runtime.evaluate', {
    expression: 'document.getElementById(' + JSON.stringify(linkId) + ')?.remove()',
    returnByValue: true
  });
}
```

Use the tool-returned local path, never an assumed filename. Run save_video.py with the selected candidate's resolution and duration; require audio when expected. Only a successful verification completes the download.

## Avoid misleading dead ends

- A failed `downloadMedia` on a blob video proves only that the blob handle could not be exported.
- Page assets can expose `media-video-hvc1` and `media-audio-und-mp4a` as kind `other`; bundle may reject them as unsupported. Do not alter the inventory or repeatedly retry that route.
- Navigating directly to the details endpoint returned `Blocked by ArgusSecurityPlugin Uifid Not Found`. The approved page-context request succeeded. A top-level navigation is not equivalent to the site's own fetch with its session handling.
- Do not use the website's Save Video control when the user requested extension-style resolution. Its download availability is separate from complete MP4 candidates returned to the authorized session.
- Do not claim the built-in browser cannot do this solely because read-only evaluate has no fetch. Check the supported, explicitly authorized CDP path first.

## Verified result

On 2026-10-18, this route downloaded video 7668119425446350122 entirely through the Codex built-in browser: same-page resolver → temporary link → downloadMedia → local validation. The saved file was 2560×1440, 433.076 seconds, with audio, 88,413,790 bytes. Its SHA-256 matched the independently downloaded Edge file. The temporary link was removed. No Edge browser, separate login, extension installation, exported cookies or webpage Save Video action was used for this successful download.
