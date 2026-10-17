import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {pageTask} from '../extension/page-task.js';
import {accessibleQualities, loginNotice, filenameFor, isDouyinPage} from '../extension/core.js';

const ID = '7695941628128666745';
function fixture({locked = true, width = 1280, height = 720, menu = true, source, identity = ID, url} = {}) {
  const dom = new JSDOM(`<!doctype html><h1>测试视频：山川与时光</h1><div class="video_${identity}"><div class="xgplayer">
    <xg-video-container><video></video></xg-video-container>
    ${menu ? `<div class="gear isSmoothSwitchClarity"><div class="virtual">
      <div class="item"><div class="clarity-wrapper"><span>1080p</span>${locked ? '<span class="loginV2">登录即享</span>' : ''}</div></div>
      <div class="item">720p</div><div class="item">540p</div><div class="item selected">Quality</div>
    </div><div class="btn" tabindex="0">Quality</div></div>` : ''}
    </div></div>`, {url: url || `https://www.douyin.com/video/${ID}`, runScripts: 'outside-only'});
  const state = {width, height, source: source || `https://v5-dy-ov-experiment.zjcdn.com/video/?mime_type=video_mp4&__vid=${identity}`, clicks: []};
  const video = dom.window.document.querySelector('video');
  Object.defineProperties(video, {
    currentSrc: {get: () => state.source}, videoWidth: {get: () => state.width},
    videoHeight: {get: () => state.height}, duration: {get: () => 57.354}
  });
  video.getBoundingClientRect = () => ({width: 640, height: 360, top: 0, left: 0, right: 640, bottom: 360});
  for (const element of dom.window.document.querySelectorAll('.item')) {
    element.addEventListener('click', () => {
      state.clicks.push(element.textContent);
      const match = element.textContent.match(/^(\d+)p$/);
      if (match) { state.height = Number(match[1]); state.width = Math.round(state.height * 16 / 9); }
    });
  }
  const fn = dom.window.eval(`(${pageTask.toString()})`);
  return {dom, state, run: async options => JSON.parse(JSON.stringify(await fn(options)))};
}

test('observed Douyin menu: shows locked 1080p, offers 720p without login', async () => {
  const f = fixture();
  try {
    const result = await f.run({action: 'inspect'});
    assert.equal(result.ok, true);
    assert.deepEqual(accessibleQualities(result.video), [720, 540]);
    assert.equal(loginNotice(result.video).height, 1080);
    assert.equal(loginNotice(result.video).available, 720);
    assert.deepEqual(f.state.clicks, [], 'opening popup must not operate login or quality controls');
  } finally { f.dom.window.close(); }
});

test('unlocked 1080p is the default, no login notice', async () => {
  const f = fixture({locked: false});
  try {
    const {video} = await f.run();
    assert.deepEqual(accessibleQualities(video), [1080, 720, 540]);
    assert.equal(loginNotice(video), null);
  } finally { f.dom.window.close(); }
});

test('only an unlocked quality can be selected; actual dimensions are returned', async () => {
  const f = fixture({locked: false});
  try {
    const result = await f.run({action: 'select-quality', expectedId: ID, height: 1080});
    assert.equal(result.video.width, 1920);
    assert.equal(result.video.height, 1080);
    assert.deepEqual(f.state.clicks, ['1080p']);
  } finally { f.dom.window.close(); }
});

test('locked quality selection fails without clicking a login control', async () => {
  const f = fixture();
  try {
    const result = await f.run({action: 'select-quality', expectedId: ID, height: 1080});
    assert.equal(result.code, 'quality-unavailable');
    assert.deepEqual(f.state.clicks, []);
  } finally { f.dom.window.close(); }
});

test('autoplay change is rejected before a quality click', async () => {
  const f = fixture();
  try {
    assert.equal((await f.run({action: 'select-quality', expectedId: '123', height: 720})).code, 'video-changed');
    assert.deepEqual(f.state.clicks, []);
  } finally { f.dom.window.close(); }
});

test('a loaded recommended video cannot masquerade as the requested video', async () => {
  const f = fixture({identity: '123'});
  try { assert.equal((await f.run()).code, 'not-ready'); } finally { f.dom.window.close(); }
});

test('missing quality menu reports current quality, without inventing higher levels', async () => {
  const f = fixture({menu: false, width: 720, height: 1280});
  try {
    const {video} = await f.run();
    assert.equal(video.resolution, 720);
    assert.equal(video.qualityMenuDetected, false);
    assert.deepEqual(accessibleQualities(video), [720]);
    assert.equal(loginNotice(video), null);
  } finally { f.dom.window.close(); }
});

test('non-MP4 sources, foreign blob URLs and other sites fail clearly', async () => {
  for (const options of [{source: 'blob:https://other.invalid/sample'}, {source: 'https://example.com/error.html'}, {url: 'https://douyin.com.evil.invalid/video/123'}]) {
    const f = fixture(options);
    try { assert.equal((await f.run()).ok, false); } finally { f.dom.window.close(); }
  }
});

test('same video in modal_id page is recognized', async () => {
  const f = fixture({url: `https://www.douyin.com/jingxuan?modal_id=${ID}`});
  try { assert.equal((await f.run()).video.id, ID); } finally { f.dom.window.close(); }
});

test('filenames preserve identity and dimensions without Windows path characters', () => {
  const name = filenameFor({title: '../ 中文:标题 / "视频"?', id: ID, width: 1920, height: 1080});
  assert.match(name, /1920x1080 - 7695941628128666745\.mp4$/);
  assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f]/);
  assert.equal(isDouyinPage('https://douyin.com.evil.invalid/video/1'), false);
  assert.equal(isDouyinPage('https://www.douyin.com/video/1'), true);
});
