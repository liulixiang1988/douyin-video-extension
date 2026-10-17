export function isDouyinPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)douyin\.com$/.test(url.hostname);
  } catch { return false; }
}

export function mediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('当前视频没有可直接下载的 HTTPS 地址。');
  }
  return url.href;
}

export function filenameFor(video) {
  if (!/^\d{1,30}$/.test(video.id)) throw new Error('无法确认视频编号，请刷新后重试。');
  let title = Array.from(String(video.title || '抖音视频')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim()).slice(0, 70).join('').replace(/[ .]+$/, '');
  title ||= '抖音视频';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(title)) title = '_' + title;
  return `${title} - ${video.width}x${video.height} - ${video.id}.mp4`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '时长未知';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

export function accessibleQualities(video) {
  const options = video.qualities.filter(q => !q.locked).map(q => q.height);
  if (video.resolution > 0) options.push(video.resolution);
  return [...new Set(options)].sort((a, b) => b - a);
}

export function loginNotice(video) {
  const best = Math.max(...accessibleQualities(video));
  const locked = video.qualities.filter(q => q.lockKind === 'login' && q.height > best);
  if (!locked.length) return null;
  return {
    height: Math.max(...locked.map(q => q.height)),
    available: best,
    text: `登录后可选 ${Math.max(...locked.map(q => q.height))}p。当前可下载最高 ${best}p，直接下载即可。`
  };
}

export function userFacingError(error) {
  const message = String(error?.message || error || '');
  if (/cancel|取消/i.test(message)) return '已取消保存，可以重新下载。';
  if (/Cannot access|Missing host permission|extensions gallery|No tab with id|Frame.*removed/i.test(message)) {
    return '页面已变化或无法访问。请回到抖音视频页，重新点击扩展图标。';
  }
  if (/Failed to fetch|NETWORK|SERVER_FORBIDDEN|403|FILE_FAILED/i.test(message)) {
    return '视频地址可能已过期或请求失败。请刷新抖音视频，再重新下载。';
  }
  // Browser transport errors can contain signed media URLs. Keep those out of UI.
  return /https?:\/\//.test(message) ? '下载请求失败，请刷新视频后重试。' : message || '操作未完成，请重试。';
}
