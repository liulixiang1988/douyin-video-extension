import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../extension/download.js';

const ID = '7695941628128666745';
function browserMock(results) {
  const calls = [];
  return {
    calls, tabs: {get: async () => ({url: `https://www.douyin.com/video/${ID}`})},
    scripting: {executeScript: async arg => {
      calls.push({type: 'inspect', options: arg.args[0]});
      return [{frameId: 0, result: results.shift()}];
    }},
    downloads: {download: async options => { calls.push({type: 'download', options}); return 7; }}
  };
}
const ready = (changes = {}) => ({ok: true, video: {id: ID, title: '测试视频', source: 'https://v.zjcdn.com/sample.mp4?signature=fresh', resolution: 1080, width: 1920, height: 1080, ...changes}});

test('download rechecks source, uses native Save As and avoids overwrites', async () => {
  const browser = browserMock([ready({source: 'https://v.zjcdn.com/old.mp4'}), ready()]);
  const result = await createController(browser).startDownload({tabId: 2, expectedId: ID, height: 1080});
  assert.equal(result.downloadId, 7);
  assert.equal(browser.calls[2].options.url, 'https://v.zjcdn.com/sample.mp4?signature=fresh');
  assert.equal(browser.calls[2].options.saveAs, true);
  assert.equal(browser.calls[2].options.conflictAction, 'uniquify');
  assert.match(browser.calls[2].options.filename, /1920x1080/);
});

test('a stale 720p stream cannot be downloaded as 1080p', async () => {
  const browser = browserMock([ready(), ready({resolution: 720, width: 1280, height: 720})]);
  await assert.rejects(createController(browser).startDownload({tabId: 2, expectedId: ID, height: 1080}), /清晰度已变化/);
  assert.equal(browser.calls.some(c => c.type === 'download'), false);
});

test('changed video aborts instead of downloading the next recommendation', async () => {
  const browser = browserMock([ready(), {ok: false, code: 'video-changed', message: '视频已变化'}]);
  await assert.rejects(createController(browser).startDownload({tabId: 2, expectedId: ID, height: 1080}), /视频已变化/);
  assert.equal(browser.calls.some(c => c.type === 'download'), false);
});

test('canceling Save As releases the operation so the user can retry', async () => {
  const browser = browserMock([ready(), ready(), ready(), ready()]);
  const controller = createController(browser);
  let attempts = 0;
  browser.downloads.download = async () => { if (++attempts === 1) throw new Error('User canceled'); return 8; };
  await assert.rejects(controller.startDownload({tabId: 2, expectedId: ID, height: 1080}), /canceled/);
  assert.equal((await controller.startDownload({tabId: 2, expectedId: ID, height: 1080})).downloadId, 8);
});
