import {accessibleQualities, formatDuration, loginNotice, userFacingError} from './core.js';

const $ = id => document.getElementById(id);
let currentVideo = null;
let activeTabId = null;
let generation = 0;
let downloading = false;

function status(text, error = false) {
  $('status').textContent = text;
  $('status').hidden = !text;
  $('status').classList.toggle('error-status', error);
}

function updateChoice() {
  const resolution = Number($('quality').value);
  $('download-label').textContent = `下载 ${resolution}p 视频`;
  $('low-quality').hidden = resolution >= 720;
  $('quality-note').textContent = currentVideo.qualityMenuDetected
    ? '默认选择当前可用的最高画质'
    : '未识别到可选画质，将保存当前播放版本';
}

function render(video) {
  currentVideo = video;
  $('video-title').textContent = video.title || '抖音视频';
  $('video-title').title = video.title || '抖音视频';
  $('resolution').textContent = `当前 ${video.resolution}p`;
  $('dimensions').textContent = `${video.width} × ${video.height}`;
  $('duration').textContent = formatDuration(video.duration);
  $('quality').replaceChildren(...accessibleQualities(video).map(height => {
    const option = document.createElement('option');
    option.value = height;
    option.textContent = `${height}p${height === video.resolution ? ' · 当前播放' : ''}`;
    return option;
  }));
  const notice = loginNotice(video);
  $('login-notice').hidden = !notice;
  if (notice) {
    $('login-title').textContent = `还可以更清晰：${notice.height}p`;
    $('login-text').textContent = notice.text;
  }
  updateChoice();
  $('video').hidden = false;
}

async function inspect() {
  if (downloading) return;
  const request = ++generation;
  $('loading').hidden = false;
  $('video').hidden = true;
  $('error').hidden = true;
  $('refresh').disabled = true;
  status('');
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id) throw new Error('找不到当前页面，请在抖音视频页面打开扩展。');
    activeTabId = tab.id;
    const result = await chrome.runtime.sendMessage({type: 'inspect', tabId: activeTabId});
    if (request !== generation) return;
    if (!result?.ok) throw new Error(result?.message || '视频尚未加载，请稍后刷新。');
    render(result.video);
  } catch (error) {
    if (request !== generation) return;
    currentVideo = null;
    $('error-text').textContent = userFacingError(error);
    $('error').hidden = false;
  } finally {
    if (request === generation) { $('loading').hidden = true; $('refresh').disabled = false; }
  }
}

async function download() {
  if (!currentVideo || downloading) return;
  const height = Number($('quality').value);
  downloading = true;
  for (const id of ['download', 'quality', 'refresh']) $(id).disabled = true;
  $('download-label').textContent = height === currentVideo.resolution ? '正在准备保存…' : `正在切换到 ${height}p…`;
  status('');
  try {
    const result = await chrome.runtime.sendMessage({type: 'download', tabId: activeTabId, expectedId: currentVideo.id, height});
    if (!result?.ok) throw new Error(result?.message || '未能开始下载，请重试。');
    render(result.video);
    status('已交给浏览器下载，可在浏览器下载列表查看进度。');
  } catch (error) { status(userFacingError(error), true); }
  finally {
    downloading = false;
    for (const id of ['download', 'quality', 'refresh']) $(id).disabled = false;
    if (currentVideo) updateChoice();
  }
}

$('quality').addEventListener('change', updateChoice);
$('refresh').addEventListener('click', inspect);
$('retry').addEventListener('click', inspect);
$('download').addEventListener('click', download);
inspect();
