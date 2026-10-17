import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createController} from '../extension/download.js';
import {resolveVideoSource} from '../extension/resolve-source.js';

test('a blob-backed player resolves and downloads the matching full MP4', async () => {
  const id = '7691115495852434594';
  const source = `https://v.zjcdn.com/video/?mime_type=video_mp4&__vid=${id}`;
  const dom = new JSDOM(`<h1>敦煌飞天</h1><div class="video_${id}"><div class="xgplayer"><video></video></div></div>`,
    {url: `https://www.douyin.com/video/${id}`, runScripts: 'outside-only'});
  try {
    const video = dom.window.document.querySelector('video');
    Object.defineProperties(video, {
      currentSrc: {get: () => `blob:https://www.douyin.com/test-player`},
      videoWidth: {get: () => 1920}, videoHeight: {get: () => 1080}, duration: {get: () => 101.007}
    });
    video.getBoundingClientRect = () => ({width: 640, height: 360, top: 0, left: 0, right: 640, bottom: 360});
    const downloads = [];
    const requests = [];
    dom.window.fetch = async value => {
      const url = new URL(value, dom.window.location.href);
      requests.push(url);
      assert.equal(url.pathname, '/aweme/v1/web/aweme/detail/');
      assert.equal(url.searchParams.get('aid'), '6383');
      assert.equal(url.searchParams.get('aweme_id'), id);
      return {ok: true, json: async () => ({status_code: 0, aweme_detail: {
        aweme_id: id, video: {duration: 101007, bit_rate: [
          {format: 'dash', bit_rate: 9000000, play_addr: {width: 1920, height: 1080, url_list: ['https://v.zjcdn.com/segments.mpd']}},
          {format: 'mp4', bit_rate: 2053000, is_h265: 0, play_addr: {width: 1920, height: 1080, url_list: [source]}},
          {format: 'mp4', bit_rate: 800000, play_addr: {width: 1280, height: 720, url_list: ['https://v.zjcdn.com/720.mp4']}}
        ]}
      }})};
    };
    const browser = {
      tabs: {get: async () => ({url: dom.window.location.href})},
      scripting: {executeScript: async ({func, args}) => [{frameId: 0, result: await dom.window.eval(`(${func.toString()})`)(...args)}]},
      downloads: {download: async options => {downloads.push(options); return 1;}}
    };
    const controller = createController(browser);
    const result = await controller.inspect(1);
    assert.equal(result.ok, true, result.message);
    assert.equal(result.video.source, source);
    assert.equal(result.video.id, id);
    assert.equal(result.video.resolution, 1080);
    await controller.startDownload({tabId: 1, expectedId: id, height: 1080});
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].url, source);
    assert.equal(downloads[0].saveAs, true);
    assert.match(downloads[0].filename, /1920x1080/);
    assert.ok(requests.length > 0);
  } finally { dom.window.close(); }
});

function sourceFixture({detailId = '7691115495852434594', duration = 101007, format = 'mp4',
  width = 1920, height = 1080, httpOk = true, failJson = false, changePage = false} = {}) {
  const id = '7691115495852434594';
  const dom = new JSDOM('', {url: `https://www.douyin.com/video/${id}`, runScripts: 'outside-only'});
  let fetches = 0;
  dom.window.fetch = async (value, options) => {
    fetches++;
    assert.equal(new URL(value).origin, dom.window.location.origin);
    assert.equal(options.credentials, 'same-origin');
    if (changePage) dom.window.history.pushState({}, '', '/video/123');
    return {ok: httpOk, json: async () => {
      if (failJson) throw new Error('not JSON');
      return {status_code: 0, aweme_detail: {aweme_id: detailId, video: {duration, bit_rate: [
        {format, is_h265: 0, play_addr: {width, height, url_list: ['https://v.zjcdn.com/full.mp4']}}
      ]}}};
    }};
  };
  const run = dom.window.eval(`(${resolveVideoSource.toString()})`);
  return {dom, run, fetches: () => fetches, expected: {id, width: 1920, height: 1080, duration: 101.007}};
}

test('resolver refuses metadata for another video', async () => {
  const f = sourceFixture({detailId: '123'});
  try { assert.equal((await f.run(f.expected)).ok, false); } finally { f.dom.window.close(); }
});

test('resolver never replaces requested 1080p with a lower-resolution MP4', async () => {
  const f = sourceFixture({width: 1280, height: 720});
  try { assert.equal((await f.run(f.expected)).code, 'matching-quality-unavailable'); } finally { f.dom.window.close(); }
});

test('DASH-only metadata is not downloaded as a complete MP4', async () => {
  const f = sourceFixture({format: 'dash'});
  try { assert.equal((await f.run(f.expected)).code, 'matching-quality-unavailable'); } finally { f.dom.window.close(); }
});

test('duration mismatch and navigation during resolution abort safely', async () => {
  for (const options of [{duration: 57000}, {changePage: true}]) {
    const f = sourceFixture(options);
    try { assert.equal((await f.run(f.expected)).ok, false); } finally { f.dom.window.close(); }
  }
});

test('HTTP failures and malformed metadata do not leak URLs or report success', async () => {
  for (const options of [{httpOk: false}, {failJson: true}]) {
    const f = sourceFixture(options);
    try {
      const result = await f.run(f.expected);
      assert.equal(result.ok, false);
      assert.doesNotMatch(result.message, /https?:/);
    } finally { f.dom.window.close(); }
  }
});

test('resolver checks page identity before sending a request', async () => {
  const f = sourceFixture();
  try {
    assert.equal((await f.run({...f.expected, id: '123'})).code, 'video-changed');
    assert.equal(f.fetches(), 0);
  } finally { f.dom.window.close(); }
});
