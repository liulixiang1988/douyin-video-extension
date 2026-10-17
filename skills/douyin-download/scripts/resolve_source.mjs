/** Runs in the page's MAIN world to use its normal same-origin request/session. */
export async function resolveVideoSource(expected) {
  const fail = (code, message) => ({ok: false, code, message});
  const currentId = () => {
    const url = new URL(location.href);
    if (url.protocol !== 'https:' || !/(^|\.)douyin\.com$/.test(url.hostname)) return null;
    return url.pathname.match(/^\/video\/(\d+)/)?.[1] || url.searchParams.get('modal_id')?.match(/^\d+$/)?.[0] || null;
  };
  if (!/^\d{1,30}$/.test(expected?.id || '') || currentId() !== expected.id) {
    return fail('video-changed', '页面已经切换到另一条视频，请刷新扩展后重新选择。');
  }
  if (![expected.width, expected.height].every(value => Number.isInteger(value) && value > 0)) {
    return fail('not-ready', '尚未取得实际视频尺寸，请开始播放后重试。');
  }
  const minimum = expected.minimumResolution;
  if (minimum !== undefined && (!Number.isInteger(minimum) || minimum <= 0)) {
    return fail('invalid-quality', '最低分辨率必须是正整数。');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const endpoint = new URL('/aweme/v1/web/aweme/detail/', location.origin);
    endpoint.searchParams.set('aweme_id', expected.id);
    // The web application's response includes full MP4 alternatives to its DASH streams.
    endpoint.searchParams.set('aid', '6383');
    const response = await fetch(endpoint.href, {credentials: 'same-origin', signal: controller.signal});
    if (!response.ok) return fail('source-unavailable', '抖音暂未返回可下载的视频，请刷新网页后重试。');
    const data = await response.json();
    if (currentId() !== expected.id) return fail('video-changed', '页面已经切换到另一条视频，请重新选择。');
    const detail = data?.aweme_detail;
    if (data?.status_code !== 0 || String(detail?.aweme_id || '') !== expected.id || !detail?.video) {
      return fail('source-unavailable', '未取得当前视频的完整 MP4 地址，请刷新网页后重试。');
    }
    const metadata = detail.video;
    const duration = Number(metadata.duration) / 1000;
    if (Number.isFinite(expected.duration) && expected.duration > 0 &&
      (!Number.isFinite(duration) || Math.abs(duration - expected.duration) > Math.max(1, expected.duration * 0.01))) {
      return fail('video-mismatch', '视频信息与当前播放器不一致，请刷新后重试。');
    }
    const candidates = [];
    function add(address, format, codec, bitrate) {
      if (String(format).toLowerCase() !== 'mp4' || !address || !Array.isArray(address.url_list)) return;
      const width = Number(address.width);
      const height = Number(address.height);
      if (![width, height].every(value => Number.isInteger(value) && value > 0)) return;
      // Playback adaptation may hide higher-quality complete files. When a minimum
      // is requested, select by each MP4 candidate's encoded-size metadata, then
      // verify the downloaded file. The player still anchors identity and duration.
      if (minimum !== undefined) {
        if (Math.min(width, height) < minimum) return;
      } else if (!((width === expected.width && height === expected.height) ||
                   (width === expected.height && height === expected.width))) return;
      for (const raw of address.url_list) {
        try {
          const url = new URL(raw);
          if (url.protocol !== 'https:' || url.username || url.password) continue;
          const linkedId = url.searchParams.get('__vid') || url.searchParams.get('aweme_id');
          if (linkedId && linkedId !== expected.id) continue;
          if (/\.(?:mpd|m3u8|m4s)(?:$|\?)/i.test(url.href) || /dash|mpegurl/i.test(url.searchParams.get('mime_type') || '')) continue;
          candidates.push({url: url.href, width, height, codec: Number(codec) || 0, bitrate: Number(bitrate) || 0});
        } catch { /* Skip invalid URLs without exposing signed query parameters. */ }
      }
    }
    for (const rate of Array.isArray(metadata.bit_rate) ? metadata.bit_rate : []) {
      add(rate.play_addr, rate.format, rate.is_h265 || rate.is_bytevc1, rate.bit_rate);
    }
    add(metadata.play_addr_h264, metadata.format, 0, 0);
    add(metadata.play_addr, metadata.format, metadata.is_h265, 0);
    add(metadata.play_addr_265, metadata.format, 1, 0);
    candidates.sort((a, b) => (minimum === undefined ? 0 :
      Math.min(b.width,b.height)-Math.min(a.width,a.height) || b.width*b.height-a.width*a.height) ||
      a.codec - b.codec || b.bitrate - a.bitrate);
    const selected = candidates[0];
    if (!selected) {
      return fail('matching-quality-unavailable', minimum === undefined
        ? `未找到与当前 ${expected.width}×${expected.height} 匹配的完整 MP4。`
        : `当前会话未返回达到 ${minimum}p 的完整 MP4。`);
    }
    return {ok: true, id: expected.id, source: selected.url, width: selected.width, height: selected.height,
      resolution: Math.min(selected.width, selected.height), duration};
  } catch {
    return fail('source-unavailable', '获取完整视频地址超时或失败，请刷新网页后重试。');
  } finally { clearTimeout(timer); }
}
