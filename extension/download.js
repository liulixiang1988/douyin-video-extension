import {isDouyinPage, mediaUrl, filenameFor} from './core.js';
import {pageTask} from './page-task.js';

export function createController(browser) {
  const inFlight = new Set();

  async function runPage(tabId, options) {
    if (!Number.isInteger(tabId)) throw new Error('找不到当前视频页面，请重新打开扩展。');
    const tab = await browser.tabs.get(tabId);
    if (!isDouyinPage(tab.url)) throw new Error('请在抖音视频页面使用这个扩展。');
    const results = await browser.scripting.executeScript({target: {tabId}, func: pageTask, args: [options]});
    const result = results.find(item => item.frameId === 0)?.result;
    if (!result) throw new Error('无法读取当前播放器，请刷新页面后重试。');
    return result;
  }

  async function startDownload({tabId, expectedId, height}) {
    if (inFlight.has(tabId)) throw new Error('这条视频正在准备下载，请稍候。');
    if (!/^\d{1,30}$/.test(String(expectedId || ''))) throw new Error('无法确认目标视频，请刷新后重试。');
    if (!Number.isInteger(height) || height < 1 || height > 8640) throw new Error('请选择有效的清晰度。');
    inFlight.add(tabId);
    try {
      const selected = await runPage(tabId, {action: 'select-quality', expectedId, height});
      if (!selected.ok) throw new Error(selected.message);
      // Re-read just before download: autoplay or a quality change can invalidate a popup snapshot.
      const fresh = await runPage(tabId, {action: 'inspect', expectedId});
      if (!fresh.ok) throw new Error(fresh.message);
      const video = fresh.video;
      if (video.id !== expectedId || video.resolution !== height) throw new Error('视频或清晰度已变化，请刷新扩展后重试。');
      const downloadId = await browser.downloads.download({
        url: mediaUrl(video.source), filename: filenameFor(video), saveAs: true, conflictAction: 'uniquify'
      });
      return {ok: true, downloadId, video};
    } finally { inFlight.delete(tabId); }
  }

  return {inspect: tabId => runPage(tabId, {action: 'inspect'}), startDownload};
}
