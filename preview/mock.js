const scenario = new URL(location.href).searchParams.get('case') || 'locked';
let video = {
  id:'7695941628128666745', title:'我是所有兴亡的余烬，我是岁月抽生的野草',
  source:'https://media.invalid/preview.mp4', width:1280, height:720, resolution:720, duration:57.354,
  qualities:[{height:1080,locked:scenario!=='unlocked',lockKind:scenario!=='unlocked'?'login':null},{height:720,locked:false},{height:540,locked:false}],
  qualityMenuDetected:true
};
if(scenario==='low') { video={...video,width:960,height:540,resolution:540,qualities:[{height:1080,locked:true,lockKind:'login'},{height:540,locked:false}]}; }
if(scenario==='missing') { video.qualities=[];video.qualityMenuDetected=false; }
globalThis.chrome = {
  tabs:{query:async()=>[{id:42}]},
  runtime:{sendMessage:async request=>{
    await new Promise(resolve=>setTimeout(resolve,200));
    if(scenario==='error') return {ok:false,message:'请先打开一条抖音视频的详情页，再点击扩展图标。'};
    if(request.type==='download') {
      if(scenario==='changed') return {ok:false,message:'页面已经切换到另一条视频，请刷新扩展后重新选择。'};
      if(scenario==='cancel') return {ok:false,message:'已取消保存，可以重新下载。'};
      video={...video,width:Math.round(request.height*16/9),height:request.height,resolution:request.height};
      return {ok:true,downloadId:1,video};
    }
    return {ok:true,video};
  }}
};
document.body.style.margin='40px auto';
document.body.style.boxShadow='0 12px 60px #163e341a';
document.body.style.borderRadius='20px';
document.querySelector('footer').textContent='界面预览 · 使用模拟视频，不执行真实下载';
await import('/extension/popup.js');
