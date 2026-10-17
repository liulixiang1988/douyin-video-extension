/** Self-contained: chrome.scripting serializes this function into the active page. */
export async function pageTask(options = {}) {
  const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
  const fail = (code, message) => ({ok: false, code, message});
  const routeId = () => {
    const url = new URL(location.href);
    if (url.protocol !== 'https:' || !/(^|\.)douyin\.com$/.test(url.hostname)) return null;
    return url.pathname.match(/^\/video\/(\d+)/)?.[1] || url.searchParams.get('modal_id')?.match(/^\d+$/)?.[0] || null;
  };

  function identityOf(video) {
    for (let parent = video; parent; parent = parent.parentElement) {
      const match = String(parent.className || '').match(/(?:^|\s)video_(\d+)(?:\s|$)/);
      if (match) return match[1];
    }
    try { return new URL(video.currentSrc).searchParams.get('__vid'); } catch { return null; }
  }

  function findVideo(id) {
    const candidates = Array.from(document.querySelectorAll('video')).filter(video => {
      if (!video.currentSrc || video.videoWidth <= 0 || video.videoHeight <= 0) return false;
      const identity = identityOf(video);
      if (identity && identity !== id) return false;
      const style = getComputedStyle(video);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const box = video.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
    });
    const exact = candidates.filter(video => identityOf(video) === id);
    if (exact.length === 1) return exact[0];
    return candidates.length === 1 ? candidates[0] : null;
  }

  function qualityEntries(video) {
    const root = video.closest('.xgplayer');
    if (!root) return [];
    return Array.from(root.querySelectorAll('.gear .item')).flatMap(element => {
      const label = compact(element.textContent);
      const number = label.match(/^(\d{3,4})\s*p\b/i);
      if (!number) return [];
      const login = /登录|登入|log\s*in|sign\s*in/i.test(label);
      const otherLock = /会员|VIP|购买|付费/i.test(label) || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('disabled');
      return [{element, height: Number(number[1]), label, locked: login || otherLock,
        lockKind: login ? 'login' : otherLock ? 'other' : null,
        selected: element.classList.contains('selected')}];
    });
  }

  function inspect() {
    const id = routeId();
    if (!id) return fail('unsupported-page', '请先打开一条抖音视频的详情页，再点击扩展图标。');
    if (options.expectedId && options.expectedId !== id) return fail('video-changed', '页面已经切换到另一条视频，请刷新扩展后重新选择。');
    const video = findVideo(id);
    if (!video) return fail('not-ready', '视频尚未加载，或当前播放器不在屏幕内。请让目标视频显示并开始播放，再点刷新。');
    let source;
    try { source = new URL(video.currentSrc); } catch { return fail('unsupported-media', '当前播放器没有可下载的视频地址。'); }
    if (source.protocol !== 'https:' || source.username || source.password) {
      return fail('unsupported-media', '当前播放器使用分段流或非直接视频地址，这一版暂不支持。');
    }
    const format = source.searchParams.get('mime_type') || '';
    const sourceNode = Array.from(video.querySelectorAll('source')).find(node => node.src === video.currentSrc);
    if (!/video_mp4|video\/mp4/i.test(format) && !/\.mp4(?:$|\?)/i.test(source.href) && !/video\/mp4/i.test(sourceNode?.type || video.getAttribute('type') || '')) {
      return fail('unsupported-media', '尚未确认这条视频使用 MP4 直链，请在详情页刷新后重试。');
    }
    const title = compact(document.querySelector('h1')?.textContent || document.title.replace(/\s*[-–]\s*抖音\s*$/, ''));
    const qualities = qualityEntries(video).map(({element, ...quality}) => quality);
    return {ok: true, video: {
      id, title: title.slice(0, 400), pageUrl: location.href, source: source.href,
      width: video.videoWidth, height: video.videoHeight,
      resolution: Math.min(video.videoWidth, video.videoHeight),
      duration: Number.isFinite(video.duration) ? video.duration : null,
      qualities, qualityMenuDetected: qualities.length > 0
    }};
  }

  const initial = inspect();
  if (!initial.ok || options.action !== 'select-quality') return initial;
  const desired = options.height;
  if (!Number.isInteger(desired) || desired <= 0 || desired > 8640) return fail('bad-quality', '无效的清晰度选项。');
  if (initial.video.resolution === desired) return initial;
  const video = findVideo(initial.video.id);
  const entry = qualityEntries(video).find(item => item.height === desired && !item.locked);
  if (!entry) return fail('quality-unavailable', '所选画质当前不可用，请刷新后选择已有画质。');
  // Only an explicitly selected, unlocked quality is clicked. Authentication is left to the user.
  entry.element.click();
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const next = inspect();
    if (next.code === 'video-changed') return next;
    if (next.ok && next.video.id !== initial.video.id) return fail('video-changed', '页面已经切换到另一条视频，请重新选择。');
    if (next.ok && next.video.resolution === desired) return next;
  }
  return fail('quality-timeout', '画质还没有完成切换。请在网页选择所需清晰度，播放几秒后重新点击扩展。');
}
