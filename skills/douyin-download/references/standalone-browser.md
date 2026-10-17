# Standalone browser fallback

Prefer the [in-app CDP route](in-app-browser.md) when it is available and authorized. Use this fallback when that route is unavailable, the user prefers Edge/Chromium, and the environment permits local browser automation. This is an actual executable helper, not a request to install the extension. Do not use it to circumvent an active tool restriction. If another browser is required, explain that its login is separate before starting.

## Setup

Requires Node.js, Python 3 and Playwright. Install Playwright beside the helper with the official npm package and install its Chromium browser when missing:

Honor the user's browser choice. `--browser edge` uses the already installed Microsoft Edge through Playwright's `msedge` channel; it requires no Chrome extension or bundled Chromium download. Omit the Chromium installation step below for that route. Edge uses its own dedicated profile at `~/.agents/douyin-download-edge`, so the user's normal Edge session is not imported. The default `chromium` route remains available.

```sh
cd ~/.agents/skills/douyin-download/scripts
npm install --no-save --package-lock=false playwright
npx playwright install chromium
```

Use the skill's actual absolute directory on other machines. Dependencies are local to that skill. Installation uses network and consumes disk space; honor the environment's installation policy.

## Run

```sh
node ~/.agents/skills/douyin-download/scripts/download_browser.mjs 'https://www.douyin.com/jingxuan?modal_id=7668119425446350122' --browser edge --min-resolution 1440 --output-dir '/absolute/personal/OneDrive/video'
```

Replace URL and destination with the current request. Resolve the personal sync folder before passing output-dir; never assume a work account is personal. Omitting output-dir uses save_video.py's existing destination resolver.

The helper opens the selected browser with its dedicated profile. The user logs in normally, starts the requested video, then presses Enter in the terminal. Selecting a named quality is useful when available, but a missing 2K menu entry does not preclude downloading a 2K MP4 returned by the same authenticated session. The agent can send Enter after the user reports completion. Login state remains in that dedicated local profile for later runs; no existing browser profile, cookies or credentials are extracted.

After the user has completed login, `--ready` reuses the saved dedicated session without asking for login again. The optional `--quality '高清 1080P'` selects an exact label already observed in the menu. Usually omit it and let the resolver find the highest complete file meeting `--min-resolution`. `--inspect` reports current playback, menu labels and the best matching complete MP4 without downloading. Do not infer download availability solely from the menu or current player dimensions.

The helper checks player identity and duration, requests details inside that browser session, and chooses the highest complete MP4 meeting the user's minimum. It downloads with the session's request context and invokes save_video.py using the selected source's resolution for encoded dimensions, duration, tracks and checksum verification. It fails when no candidate meets the minimum. Follow the user's existing quality choice; if only lower-quality full MP4 files exist, report that result and seek a new choice before lowering the threshold.

The resolver is adapted from the user's douyin-video-extension v0.1.1 resolve-source.js. It excludes DASH/HLS and mismatched IDs, ranks resolution before H.264 compatibility and bitrate, and does not log signed CDN URLs. Files download into a private temporary directory; validation failures retain the source for diagnosis. Buffering the MP4 uses memory proportional to file size.

## Validation status

On 2026-10-18, the Edge helper downloaded video 7668119425446350122 on macOS. Its menu listed 1080p as the maximum and its adaptive player was 1280×720, but the same-session details response supplied a full 2560×1440 MP4. save_video.py verified 433.076 seconds, audio, 88,413,790 bytes and checksum equality in the personal OneDrive sync folder. Resolver tests cover this player/source mismatch and reject a lower source when 1440p is required. Each future download still requires a fresh verified=true result. HTTP 403 or an empty detail response is a real failure; do not export cookies or bypass authentication to repair it.
