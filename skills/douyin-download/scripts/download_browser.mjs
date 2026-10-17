#!/usr/bin/env node
// Dedicated browser session; never attaches to or extracts another browser profile.
import {resolveVideoSource} from './resolve_source.mjs';
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {mkdtemp, writeFile, chmod} from 'node:fs/promises';
import {tmpdir, homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage: node download_browser.mjs DOUYIN_URL [--browser edge|chromium] [--min-resolution 1440] [--output-dir DIRECTORY] [--inspect] [--ready] [--quality LABEL]\nRequires playwright installed next to this script. Opens a dedicated browser; log in and select quality, then press Enter. --inspect checks without downloading. --ready reuses a session whose login was already completed.');
  process.exit(0);
}
let context;
try {
  const url = new URL(args[0]);
  const id = url.pathname.match(/^\/video\/(\d+)$/)?.[1] || url.searchParams.get('modal_id');
  if (url.protocol !== 'https:' || !/(^|\.)douyin\.com$/.test(url.hostname) || !/^\d{1,30}$/.test(id || '')) throw Error('Provide a valid HTTPS Douyin video URL.');
  const option = name => { const i=args.indexOf(name); if(i<0)return undefined; if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing ${name}`); return args[i+1]; };
  const minimum = Number(option('--min-resolution') || 720);
  if (!Number.isInteger(minimum) || minimum<=0) throw Error('Invalid minimum resolution.');
  const output = option('--output-dir');
  const browser = option('--browser') || 'chromium';
  if (!['edge', 'chromium'].includes(browser)) throw Error('Browser must be edge or chromium.');
  const {chromium} = await import('playwright');
  const profile = path.join(homedir(), '.agents', browser === 'edge' ? 'douyin-download-edge' : 'douyin-download-browser');
  context = await chromium.launchPersistentContext(profile, {headless:false, acceptDownloads:true, ...(browser === 'edge' ? {channel:'msedge'} : {})});
  await chmod(profile, 0o700);
  const page = await context.newPage();
  await page.goto(url.href, {waitUntil:'domcontentloaded'});
  if (!args.includes('--inspect') && !args.includes('--ready')) {
    const prompt = createInterface({input:stdin, output:stdout});
    await prompt.question('请在浏览器登录、选好画质并开始播放；完成后在此按 Enter：');
    prompt.close();
  }
  await page.waitForFunction(videoId => {
    const v = document.querySelector(`.video_${videoId} video`);
    return v && v.videoWidth > 0 && Number.isFinite(v.duration) && v.duration > 0;
  }, id, {timeout:15000});
  const selectedQuality = option('--quality');
  if (selectedQuality) {
    const scope = page.locator(`.video_${id}`);
    const control = scope.getByText(/^(智能|高清\s*\d+P|超清\s*2K)$/).filter({visible:true});
    if (await control.count() !== 1) throw Error('Cannot uniquely identify the quality control.');
    await control.click();
    await scope.getByText(selectedQuality,{exact:true}).filter({visible:true}).click();
    await page.waitForFunction(({videoId,min}) => {
      const v=document.querySelector(`.video_${videoId} video`);
      return v && Math.min(v.videoWidth,v.videoHeight)>=min;
    }, {videoId:id,min:minimum}, {timeout:15000});
  }
  const inspect = async () => {
    const current = new URL(page.url());
    if ((current.pathname.match(/^\/video\/(\d+)/)?.[1] || current.searchParams.get('modal_id')) !== id) throw Error('Video changed; restore requested video and retry.');
    return page.locator(`.video_${id} video`).evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
  };
  const expected = {id,...await inspect()};
  console.log(JSON.stringify({player:expected, required_short_side:minimum}));
  if (args.includes('--inspect')) {
    const scope = page.locator(`.video_${id}`);
    const quality = scope.getByText(/^(智能|高清\s*\d+P|超清\s*2K)$/).filter({visible:true});
    if (await quality.count() === 1) await quality.click();
    console.log(JSON.stringify({quality_menu:(await scope.innerText()).split('\n').filter(line=>/^(智能|高清\s*\d+P|标清\s*\d+P|超清\s*2K)$/.test(line))}));
    const source = await page.evaluate(resolveVideoSource, {...expected,minimumResolution:minimum});
    console.log(JSON.stringify({available_mp4:source.ok
      ? {width:source.width,height:source.height,duration:source.duration}
      : {code:source.code,message:source.message}}));
    const proof = path.join(await mkdtemp(path.join(tmpdir(),'douyin-quality-')), 'page.png');
    await page.screenshot({path:proof});
    console.log(JSON.stringify({screenshot:proof}));
    await context.close();
    process.exit(0);
  }
  const result = await page.evaluate(resolveVideoSource, {...expected, minimumResolution:minimum});
  if (!result.ok) throw Error(result.message);
  console.log(JSON.stringify({selected_mp4:{width:result.width,height:result.height,duration:result.duration}}));
  const fresh = await inspect();
  if(Math.abs(fresh.duration-expected.duration)>Math.max(1,expected.duration*0.01)) throw Error('Video duration changed during resolution.');
  // Session stays within Playwright. No cookies, headers or signed URLs are printed/saved.
  const response = await context.request.get(result.source, {headers:{Referer:page.url()},timeout:120000});
  if(!response.ok()) throw Error(`Media download HTTP ${response.status()}`);
  const directory = await mkdtemp(path.join(tmpdir(),'douyin-'));
  const source = path.join(directory,'video.mp4');
  await writeFile(source,await response.body(),{mode:0o600});
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)),'save_video.py');
  const cmd = ['-X','utf8',helper,'--source',source,'--title',id,'--video-id',id,'--expected-duration',String(expected.duration),'--min-resolution',String(result.resolution)];
  cmd[cmd.indexOf('--title')+1] = (await page.title()).split(' - 抖音')[0].slice(0,50);
  if(output)cmd.push('--output-dir',output);
  const saved = spawnSync(process.env.PYTHON || (process.platform==='win32'?'python':'python3'),cmd,{stdio:'inherit'});
  if(saved.error || saved.status!==0) throw Error('MP4 verification/save failed; temporary source retained.');
} catch(error) {
  console.error(error.code==='ERR_MODULE_NOT_FOUND'?'Install playwright in the skill scripts directory first; see references/standalone-browser.md.':String(error.message).replace(/https?:\/\/\S+/g,'[URL redacted]'));
  process.exitCode=1;
} finally { if(context) await context.close(); }
