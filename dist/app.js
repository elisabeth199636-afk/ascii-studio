'use strict';
const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d');
let source=null,sourceTones={low:0,high:1},sourceUrl='',queued=0,currentView='ascii',rendered=null,loadId=0,toastTimer;
let sourceMedia=null,loading=false,exporting=false,animationRequest=0,lastTick=0,lastPaint=0,playhead=0,playing=false,previewVisible=true;
let modelCache=null,activeWorker=null,exportReject=null,exportCancelled=false;
const motionDefaults={effect:'none',speed:1,intensity:50,fps:12,duration:4,direction:1};
const motion={...motionDefaults};
const originalCanvas=$('original-image'),originalContext=originalCanvas.getContext('2d');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const nextTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const defaults={density:120,size:110,charset:'standard',custom:' .:-=+*#%@',brightness:0,contrast:115,threshold:8,'color-mode':'original',foreground:'#e9eee3',background:'#141a17',invert:false,transparent:false};
const state={...defaults};
const ramps={standard:' .:-=+*#%@',detail:' .\'`^",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',binary:' 01',blocks:' ░▒▓█'};
const presets={original:{...defaults},classic:{...defaults,'color-mode':'mono',foreground:'#303534',background:'#efeee9',contrast:130,threshold:10},blue:{...defaults,'color-mode':'mono',foreground:'#eff3ff',background:'#302be2',contrast:140,threshold:16,density:100},terminal:{...defaults,'color-mode':'mono',foreground:'#a5ee99',background:'#10251c',charset:'binary',contrast:145,threshold:18,density:100}};
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500)}
const numericFields={density:{scale:1},size:{scale:1},brightness:{scale:1},contrast:{scale:100},threshold:{scale:1}};
function syncNumericFields(preserveNumber=null){
  for(const [key,{scale}] of Object.entries(numericFields)){
    const input=$(key+'-value');
    if(input.id===preserveNumber)continue;
    input.value=scale===100?(state[key]/scale).toFixed(2):String(state[key]);
    input.removeAttribute('aria-invalid');
  }
}
function controls(preserveNumber=null){
  for(const key of Object.keys(defaults)){
    const el=$(key);
    if(el.type==='checkbox')el.checked=state[key];else el.value=state[key];
    if(el.type==='range')el.style.setProperty('--fill',((Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100)+'%');
  }
  syncNumericFields(preserveNumber);
  $('custom-wrap').hidden=state.charset!=='custom';
  for(const key of ['foreground','background']){
    const input=$(key+'-value');
    if(input.id===preserveNumber)continue;
    input.value=state[key].toUpperCase();input.removeAttribute('aria-invalid');
  }
  $('color-help').textContent=state['color-mode']==='original'?'字符沿用原图颜色；修改字符色会切换为单色。':state.transparent?'当前为透明背景；修改背景色会恢复实色背景。':'点击色块选色，或输入 HEX 色值。';
}
function schedule(){if(queued)cancelAnimationFrame(queued);queued=requestAnimationFrame(()=>{queued=0;render()})}
function hexRGB(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
function settingsChanged(preserveNumber=null){modelCache=null;controls(preserveNumber);document.querySelectorAll('.preset').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});schedule()}
function applyColor(key,value,preserveInput=null){
  state[key]=value;
  if(key==='foreground')state['color-mode']='mono';
  if(key==='background')state.transparent=false;
  settingsChanged(preserveInput);
}
for(const key of Object.keys(defaults))$(key).addEventListener('input',()=>{
  const el=$(key);
  if(key==='foreground'||key==='background'){applyColor(key,el.value);return}
  state[key]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;settingsChanged();
});
function parseHex(value){
  const hex=value.trim().replace(/^#/,'');
  if(/^[\da-f]{6}$/i.test(hex))return '#'+hex.toLowerCase();
  if(/^[\da-f]{3}$/i.test(hex))return '#'+Array.from(hex,c=>c+c).join('').toLowerCase();
  return null;
}
for(const key of ['foreground','background']){
  const input=$(key+'-value');
  let beforeEdit,cancelled=false;
  input.addEventListener('focus',()=>{cancelled=false;beforeEdit={color:state[key],mode:state['color-mode'],transparent:state.transparent};input.select()});
  input.addEventListener('input',()=>{
    const color=parseHex(input.value);
    input.removeAttribute('aria-invalid');
    if(color)applyColor(key,color,input.id);
  });
  input.addEventListener('blur',()=>{
    if(cancelled){cancelled=false;return}
    const color=parseHex(input.value);
    if(color){applyColor(key,color);return}
    input.setAttribute('aria-invalid','true');
    toast('请输入 3 位或 6 位 HEX 色值，例如 #302BE2');
  });
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();input.blur()}
    if(event.key==='Escape'){
      event.preventDefault();cancelled=true;state[key]=beforeEdit.color;state['color-mode']=beforeEdit.mode;state.transparent=beforeEdit.transparent;settingsChanged();input.blur();
    }
  });
}
for(const [key,{scale}] of Object.entries(numericFields)){
  const input=$(key+'-value');
  let beforeEdit=state[key];
  input.addEventListener('focus',()=>{beforeEdit=state[key];input.select()});
  input.addEventListener('input',()=>{
    const value=input.valueAsNumber;
    const valid=Number.isFinite(value)&&value>=Number(input.min)&&value<=Number(input.max);
    input.setAttribute('aria-invalid',String(input.value!==''&&!valid));
    if(!valid)return; // Preserve incomplete or out-of-range drafts until commit.
    state[key]=Math.round(value*scale);
    settingsChanged(input.id);
  });
  input.addEventListener('blur',()=>{
    const previous=state[key];
    const value=input.valueAsNumber;
    if(Number.isFinite(value)){
      const bounded=Math.max(Number(input.min),Math.min(Number(input.max),value));
      state[key]=Math.round(bounded*scale);
      if(value!==bounded)toast(`数值已调整至允许范围 ${input.min}–${input.max}`);
    }
    if(state[key]!==previous)settingsChanged();else controls();
  });
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();input.blur()}
    if(event.key==='Escape'){
      event.preventDefault();state[key]=beforeEdit;settingsChanged();input.blur();
    }
  });
}
function applyPreset(name){modelCache=null;Object.assign(state,presets[name]);controls();document.querySelectorAll('.preset').forEach(b=>{const active=b.dataset.preset===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)});setView('ascii');schedule()}
document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
$('reset').addEventListener('click',()=>{Object.assign(motion,motionDefaults);playhead=0;setPlaying(false);applyPreset('original');syncMotion();toast('已恢复默认参数')});
function setView(view){currentView=view;canvas.hidden=view!=='ascii'||!source;$('original-image').hidden=view!=='original'||!source;for(const k of ['ascii','original']){$('view-'+k).classList.toggle('selected',view===k);$('view-'+k).setAttribute('aria-pressed',view===k)}$('empty-state').hidden=!!source;$('artboard').classList.toggle('is-transparent',!!source&&state.transparent&&view==='ascii');syncPreviewScale();schedule()}
$('view-ascii').addEventListener('click',()=>setView('ascii'));$('view-original').addEventListener('click',()=>setView('original'));
function syncPreviewScale(center=false){
  if(!source)return;
  const board=$('artboard'),zoomed=board.classList.contains('zoomed');
  const scale=Math.min(board.clientWidth/source.naturalWidth,board.clientHeight/source.naturalHeight);
  for(const element of [canvas,$('original-image')]){
    element.style.width=Math.max(1,Math.round(source.naturalWidth*scale*(zoomed?2:1)))+'px';
    element.style.height=Math.max(1,Math.round(source.naturalHeight*scale*(zoomed?2:1)))+'px';
  }
  if(center){board.scrollLeft=Math.max(0,(board.scrollWidth-board.clientWidth)/2);board.scrollTop=Math.max(0,(board.scrollHeight-board.clientHeight)/2)}
}
$('fit').addEventListener('click',()=>{
  if(!source)return;
  const zoomed=$('artboard').classList.toggle('zoomed');
  $('fit').querySelector('span').textContent=zoomed?'适应画布':'放大查看';
  $('fit').setAttribute('aria-pressed',zoomed);
  syncPreviewScale(true);
});
new ResizeObserver(()=>syncPreviewScale()).observe($('artboard'));
function analyseImage(image){
  const sample=document.createElement('canvas');
  const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
  sample.width=Math.max(1,Math.round(image.naturalWidth*scale));
  sample.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=sample.getContext('2d',{willReadFrequently:true});
  context.drawImage(image,0,0,sample.width,sample.height);
  return AsciiCore.analyseTones(context.getImageData(0,0,sample.width,sample.height).data);
}
for(const id of ['upload','replace','empty-upload'])$(id).addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0]);e.target.value=''});

function isAnimated(){return !!source&&(sourceMedia.frames.length>1||motion.effect!=='none')}
function baseDuration(){return sourceMedia?.frames.length>1?sourceMedia.duration/1000:motion.duration}
function duration(){return baseDuration()/motion.speed}
function syncMotion(preserve=null){
  $('motion-effect').value=motion.effect;$('motion-direction').value=String(motion.direction);
  for(const key of ['speed','intensity','fps','duration']){
    const range=$('motion-'+key),input=$('motion-'+key+'-value');range.value=motion[key];
    range.style.setProperty('--fill',((motion[key]-Number(range.min))/(Number(range.max)-Number(range.min))*100)+'%');
    if(input.id!==preserve){input.value=String(motion[key]);input.removeAttribute('aria-invalid')}
  }
  const gif=sourceMedia?.frames.length>1,active=isAnimated();
  $('source-kind').textContent=gif?`GIF · ${sourceMedia.frames.length} 帧`:'静态图片也能动起来';
  $('motion-controls').hidden=!gif&&motion.effect==='none';
  $('motion-intensity-group').hidden=motion.effect==='none';
  $('motion-duration-group').hidden=!!gif;
  $('motion-direction-group').hidden=!['wave','scan'].includes(motion.effect);
  $('playback-bar').hidden=!active;
  $('motion-help').textContent=gif?`源动图 ${baseDuration().toFixed(2)} 秒，可叠加效果或仅保留原动作。`:motion.effect==='none'?'上传 GIF 保留原始动作；静态图可选择动画效果。':'效果会应用到字符本身；选择 GIF 动画可保存完整循环。';
  updatePlayback();updateExportInfo();
}
function updatePlayback(){
  $('play-toggle').textContent=playing?'暂停':'播放';$('play-toggle').setAttribute('aria-label',playing?'暂停动画':'播放动画');
  $('play-toggle').setAttribute('aria-pressed',String(playing));
  $('play-time').textContent=`${playhead.toFixed(1)} / ${duration().toFixed(1)} s`;
  $('timeline').value=String(Math.round(playhead/duration()*1000));
  $('timeline').setAttribute('aria-valuetext',`${playhead.toFixed(1)} 秒，共 ${duration().toFixed(1)} 秒`);
}
function ensureLoop(){
  if(animationRequest||!playing||!isAnimated()||loading||exporting||document.hidden||!previewVisible)return;
  lastTick=0;animationRequest=requestAnimationFrame(tick);
}
function tick(now){
  animationRequest=0;
  if(!playing||!isAnimated()||loading||exporting||document.hidden||!previewVisible){lastTick=0;return}
  if(lastTick)playhead=MotionCore.wrap(playhead+(now-lastTick)/1000,duration());
  lastTick=now;
  if(now-lastPaint>=1000/motion.fps){lastPaint=now;render();updatePlayback()}
  animationRequest=requestAnimationFrame(tick);
}
function setPlaying(value){
  playing=!!value&&isAnimated();cancelAnimationFrame(animationRequest);animationRequest=0;lastTick=0;lastPaint=0;
  updatePlayback();ensureLoop();
}
function motionChanged(preserve=null){
  playhead=Math.min(playhead,Math.max(0,duration()-.001));syncMotion(preserve);schedule();ensureLoop();
}
$('motion-effect').addEventListener('change',()=>{motion.effect=$('motion-effect').value;playhead=0;motionChanged();setPlaying(isAnimated())});
$('motion-direction').addEventListener('change',()=>{motion.direction=Number($('motion-direction').value);motionChanged()});
for(const key of ['speed','intensity','fps','duration']){
  const range=$('motion-'+key),input=$('motion-'+key+'-value');let previous=motion[key];
  range.addEventListener('input',()=>{motion[key]=Number(range.value);motionChanged()});
  input.addEventListener('focus',()=>{previous=motion[key];input.select()});
  input.addEventListener('input',()=>{const n=input.valueAsNumber;const valid=Number.isFinite(n)&&n>=Number(input.min)&&n<=Number(input.max);input.setAttribute('aria-invalid',String(input.value!==''&&!valid));if(valid){motion[key]=key==='fps'||key==='intensity'?Math.round(n):n;motionChanged(input.id)}});
  input.addEventListener('blur',()=>{const n=input.valueAsNumber;if(Number.isFinite(n)){motion[key]=Math.max(Number(input.min),Math.min(Number(input.max),n));if(key==='fps'||key==='intensity')motion[key]=Math.round(motion[key])}motionChanged()});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur()}if(event.key==='Escape'){event.preventDefault();motion[key]=previous;motionChanged();input.blur()}});
}
$('play-toggle').addEventListener('click',()=>setPlaying(!playing));
$('restart').addEventListener('click',()=>{playhead=0;schedule();setPlaying(true)});
$('timeline').addEventListener('input',()=>{const position=Number($('timeline').value)/1000;setPlaying(false);playhead=Math.min(duration()-.001,position*duration());updatePlayback();schedule()});
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(animationRequest);animationRequest=0;lastTick=0;ensureLoop()});
new IntersectionObserver(entries=>{previewVisible=entries[0].isIntersecting;if(!previewVisible){cancelAnimationFrame(animationRequest);animationRequest=0}else ensureLoop()}).observe($('stage'));
reducedMotion.addEventListener('change',event=>{if(event.matches)setPlaying(false)});
function updateExportInfo(){
  const format=$('format').value;$('gif-quality-wrap').hidden=format!=='gif';
  let message='上传后即可导出',valid=!!source;
  if(source){
    const geometry=AsciiCore.outputGeometry(source.naturalWidth,source.naturalHeight,state.density,1,state.size);
    message=`${geometry.width} × ${geometry.height} px${isAnimated()?' · 当前帧':''}`;
    if(format==='gif'){
      if(!isAnimated()){message='选择一种动画效果，或上传 GIF 后导出';valid=false}
      else try{const p=MotionCore.exportPlan(duration(),motion.fps,Number($('gif-quality').value),geometry.width,geometry.height);message=`${p.width} × ${p.height} px · ${duration().toFixed(1)} s · ${p.frames} 帧${state.transparent?' · 透明背景':''}`}catch(error){message=error.message;valid=false}
    }
  }
  $('export-dimensions').textContent=message;
  for(const id of ['export','export-top'])$(id).disabled=loading||exporting||!valid;
}
$('format').addEventListener('change',updateExportInfo);$('gif-quality').addEventListener('change',updateExportInfo);
function setBusy(busy){loading=busy;document.body.classList.toggle('busy',busy);$('fit').disabled=!source||busy;updateExportInfo();if(!busy)ensureLoop()}
function showProgress(label,percent,note){$('export-progress').hidden=false;$('progress-label').textContent=label;$('progress-bar').value=percent;$('progress-note').textContent=note}
function clearMedia(media){if(media?.frames.length>1)for(const frame of media.frames){frame.width=1;frame.height=1}}
function animatedOther(bytes){
  if(String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(12,16))==='VP8X')return !!(bytes[20]&2);
  if(bytes[0]===137&&bytes[1]===80){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=8;i+12<=bytes.length;){const length=view.getUint32(i),type=String.fromCharCode(...bytes.subarray(i+4,i+8));if(type==='acTL')return true;if(type==='IDAT')break;i+=12+length}}
  return false;
}
async function decodeGif(bytes,ticket){
  const gif=new GifFrames(bytes);
  const scale=Math.min(1,480/Math.max(gif.width,gif.height),Math.sqrt(16000000/(gif.width*gif.height*gif.info.length)));
  const width=Math.max(1,Math.floor(gif.width*scale)),height=Math.max(1,Math.floor(gif.height*scale));
  const full=document.createElement('canvas');full.width=gif.width;full.height=gif.height;const fullContext=full.getContext('2d');
  const probe=document.createElement('canvas');probe.width=32;probe.height=32;const probeContext=probe.getContext('2d',{willReadFrequently:true});
  const tones=new Uint8ClampedArray(gif.info.length*32*32*4),frames=[];
  try{
    for(let i=0;i<gif.info.length;i++){
      if(ticket!==loadId)throw new DOMException('Cancelled','AbortError');
      fullContext.putImageData(new ImageData(gif.next(),gif.width,gif.height),0,0);
      const frame=document.createElement('canvas');frame.width=width;frame.height=height;frame.getContext('2d').drawImage(full,0,0,width,height);frames.push(frame);
      probeContext.clearRect(0,0,32,32);probeContext.drawImage(frame,0,0,32,32);tones.set(probeContext.getImageData(0,0,32,32).data,i*32*32*4);
      showProgress('正在读取 GIF',100*(i+1)/gif.info.length,`${i+1} / ${gif.info.length} 帧`);await nextTask();
    }
    frames[0].naturalWidth=gif.width;frames[0].naturalHeight=gif.height;
    return {frames,delays:gif.delays,duration:gif.duration,tones:AsciiCore.analyseTones(tones)};
  }catch(error){clearMedia({frames});throw error}
  finally{full.width=1;full.height=1}
}
async function loadFile(file){
  if(exporting)return toast('请先等待导出完成，或取消导出');
  if(!/^image\/(png|jpeg|webp|avif|gif|bmp)$/i.test(file.type)&&!(/\.(gif|png|jpe?g|webp|avif|bmp)$/i.test(file.name)&&!file.type)){toast('请选择 GIF、JPG、PNG、WebP、AVIF 或 BMP 图片');return}
  if(file.size>25*1024*1024){toast('图片超过 25 MB，请压缩后再试');return}
  const ticket=++loadId,url=URL.createObjectURL(file);let adopted=false,media=null;setBusy(true);cancelAnimationFrame(animationRequest);animationRequest=0;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());if(ticket!==loadId)throw new DOMException('Cancelled','AbortError');
    const isGif=String.fromCharCode(...bytes.subarray(0,6)).match(/^GIF8[79]a$/);
    if(isGif)media=await decodeGif(bytes,ticket);
    else{
      if(animatedOther(bytes))throw new Error('目前支持 GIF 动图；APNG 和动态 WebP 请先转为 GIF');
      const img=new Image();img.src=url;await img.decode();
      if(img.naturalWidth*img.naturalHeight>80000000)throw new Error('图片尺寸过大，请缩小到 8000 万像素以内');
      media={frames:[img],delays:[100],duration:100,tones:analyseImage(img)};
    }
    if(ticket!==loadId)throw new DOMException('Cancelled','AbortError');
    clearMedia(sourceMedia);if(sourceUrl.startsWith('blob:'))URL.revokeObjectURL(sourceUrl);
    sourceMedia=media;source=media.frames[0];sourceTones=media.tones;sourceUrl=url;adopted=true;modelCache=null;playhead=0;
    $('source-file').hidden=false;$('source-thumb').src=media.frames.length>1?source.toDataURL():url;
    $('file-name').textContent=file.name;$('file-size').textContent=`${source.naturalWidth} × ${source.naturalHeight}${media.frames.length>1?' · '+media.frames.length+' 帧':''}`;
    $('empty-state').hidden=true;setView('ascii');syncMotion();render();setPlaying(isAnimated()&&!reducedMotion.matches);
    toast(media.frames.length>1?'GIF 已载入，可调节动画并导出':'图片已载入，可选择动画效果');
  }catch(error){if(ticket===loadId&&error.name!=='AbortError')toast(error.message&&!(error instanceof TypeError)?error.message:'这张图片无法读取，请换一张图片重试')}
  finally{if(!adopted){URL.revokeObjectURL(url);clearMedia(media)}if(ticket===loadId){$('export-progress').hidden=true;setBusy(false)}}
}
function sourceAt(time){const index=sourceMedia.frames.length>1?MotionCore.frameIndex(sourceMedia.delays,time*motion.speed*1000):0;return {index,image:sourceMedia.frames[index]}}
function modelAt(time){
  const {index,image}=sourceAt(time),key=index+'|'+JSON.stringify(state);
  if(modelCache?.key===key)return modelCache;
  const cols=state.density,rows=Math.max(1,Math.min(400,Math.round(cols*source.naturalHeight/source.naturalWidth*.58)));
  const sampler=document.createElement('canvas');sampler.width=cols;sampler.height=rows;
  const sample=sampler.getContext('2d',{willReadFrequently:true});sample.drawImage(image,0,0,cols,rows);
  const pixels=sample.getImageData(0,0,cols,rows).data;
  const chars=Array.from(state.charset==='custom'?(state.custom.trim()?state.custom:' .:-=+*#%@'):ramps[state.charset]).slice(0,80);
  const bg=hexRGB(state.background),lightBackground=(bg[0]*.2126+bg[1]*.7152+bg[2]*.0722)>145;
  const settings={...state,lightBackground},cells=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const p=(y*cols+x)*4,char=AsciiCore.mapCell(pixels.subarray(p,p+4),settings,sourceTones,chars);
    if(char!==' ')cells.push({x,y,char,color:state['color-mode']==='mono'?state.foreground:`rgb(${pixels[p]},${pixels[p+1]},${pixels[p+2]})`});
  }
  modelCache={key,cols,rows,cells,chars,index,image};return modelCache;
}
function paintFrame(target,time,longEdge=Infinity,capture=false){
  const model=modelAt(time),{cols,rows,cells,chars}=model;
  const full=AsciiCore.outputGeometry(source.naturalWidth,source.naturalHeight,cols,rows,state.size);
  const scale=Math.min(1,longEdge/Math.max(full.width,full.height));
  const width=Math.max(1,Math.round(full.width*scale)),height=Math.max(1,Math.round(full.height*scale));
  const cellW=width/cols,cellH=height/rows,fontSize=Math.min(cellH,cellW/.6)*state.size/100;
  if(target.width!==width)target.width=width;if(target.height!==height)target.height=height;
  const context=target.getContext('2d');context.globalAlpha=1;context.clearRect(0,0,width,height);
  if(!state.transparent){context.fillStyle=state.background;context.fillRect(0,0,width,height)}
  context.textBaseline='middle';context.textAlign='center';
  const phase=time*motion.speed/baseDuration(),output=[],lines=capture?Array.from({length:rows},()=>Array(cols).fill(' ')):null;
  let font='',color='';
  for(const cell of cells){
    const effect=MotionCore.transform(cell,motion,phase,cols,rows,chars);
    const nextFont=fontSize*effect.scale+'px "Courier New", monospace';
    if(font!==nextFont){context.font=nextFont;font=nextFont}if(color!==cell.color){context.fillStyle=cell.color;color=cell.color}
    context.globalAlpha=effect.alpha;
    const x=(cell.x+.5+effect.dx)*cellW,y=(cell.y+.5+effect.dy)*cellH;
    context.fillText(effect.char,x,y);
    if(capture){output.push({x,y,char:effect.char,color:cell.color,alpha:effect.alpha,fontSize:fontSize*effect.scale});lines[cell.y][cell.x]=effect.char}
  }
  context.globalAlpha=1;
  return {cols,rows,cellW,cellH,fontSize,cells:output,text:lines?.map(line=>line.join('')).join('\n'),width,height,visible:cells.length};
}
function render(){
  if(!source)return;
  const start=performance.now(),board=$('artboard'),scrollLeft=board.scrollLeft,scrollTop=board.scrollTop;
  rendered=paintFrame(canvas,playhead,isAnimated()?960:Infinity);
  const {image,index}=sourceAt(playhead);
  if(originalCanvas.dataset.frame!==String(index)||originalCanvas.dataset.source!==String(loadId)){
    const scale=Math.min(1,960/Math.max(source.naturalWidth,source.naturalHeight));originalCanvas.width=Math.max(1,Math.round(source.naturalWidth*scale));originalCanvas.height=Math.max(1,Math.round(source.naturalHeight*scale));originalContext.drawImage(image,0,0,originalCanvas.width,originalCanvas.height);originalCanvas.dataset.frame=String(index);originalCanvas.dataset.source=String(loadId);
  }
  $('render-info').textContent=`${rendered.cols} × ${rendered.rows} 字符 · ${rendered.visible.toLocaleString()} 个可见`;
  updateExportInfo();$('artboard').classList.toggle('is-transparent',state.transparent&&currentView==='ascii');
  syncPreviewScale();board.scrollLeft=scrollLeft;board.scrollTop=scrollTop;
  canvas.dataset.renderMs=(performance.now()-start).toFixed(1);canvas.dataset.frame=String(index);canvas.dataset.time=playhead.toFixed(3);
}
let dragDepth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false}});window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()});window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').hidden=true});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;const file=e.dataTransfer.files[0];if(file)loadFile(file)});window.addEventListener('paste',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;const item=Array.from(e.clipboardData?.items||[]).find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();loadFile(item.getAsFile())}});
function escapeXML(text){return text.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))}

function download(blob,format){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=($('file-name').textContent.replace(/\.[^.]+$/,'')||'image')+'-ascii.'+format;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function workerCall(worker,message,transfer=[]){
  return new Promise((resolve,reject)=>{exportReject=reject;worker.onmessage=event=>{exportReject=null;event.data.error?reject(new Error(event.data.error)):resolve(event.data)};worker.onerror=()=>{exportReject=null;reject(new Error('GIF 编码线程无法启动'))};worker.postMessage(message,transfer)});
}
async function exportGif(){
  const full=AsciiCore.outputGeometry(source.naturalWidth,source.naturalHeight,state.density,1,state.size);
  const plan=MotionCore.exportPlan(duration(),motion.fps,Number($('gif-quality').value),full.width,full.height);
  const output=document.createElement('canvas');let encoder=null,worker=null;
  try{
    if(location.protocol!=='file:'&&typeof Worker!=='undefined'){
      try{worker=new Worker('gif-worker.js');activeWorker=worker;await workerCall(worker,{type:'start',width:plan.width,height:plan.height,transparent:state.transparent})}
      catch(error){worker?.terminate();worker=null;activeWorker=null;if(exportCancelled)throw error}
    }
    if(!worker)encoder=GifExport.create(plan.width,plan.height,state.transparent);
    for(let i=0;i<plan.frames;i++){
      if(exportCancelled)throw new DOMException('Cancelled','AbortError');
      paintFrame(output,i*plan.step,Number($('gif-quality').value));
      const rgba=output.getContext('2d').getImageData(0,0,output.width,output.height).data;
      if(worker)await workerCall(worker,{type:'frame',buffer:rgba.buffer,delay:plan.delays[i]},[rgba.buffer]);else encoder.frame(rgba,plan.delays[i]);
      showProgress('正在导出 GIF',100*(i+1)/plan.frames,`${i+1} / ${plan.frames} 帧 · 可随时取消`);await nextTask();
    }
    if(exportCancelled)throw new DOMException('Cancelled','AbortError');
    const bytes=worker?new Uint8Array((await workerCall(worker,{type:'finish'})).buffer):encoder.finish();
    return new Blob([bytes],{type:'image/gif'});
  }finally{worker?.terminate();activeWorker=null;exportReject=null;output.width=1;output.height=1}
}
$('cancel-export').addEventListener('click',()=>{
  if(loading){++loadId;setBusy(false);$('export-progress').hidden=true;toast('已取消载入');return}
  exportCancelled=true;activeWorker?.terminate();exportReject?.(new DOMException('Cancelled','AbortError'));exportReject=null;
});
async function exportArt(){
  if(!source||exporting||loading)return;
  const format=$('format').value,wasPlaying=playing;
  if(format==='gif'&&!isAnimated())return toast('请先选择动画效果或上传 GIF');
  exporting=true;exportCancelled=false;setPlaying(false);document.querySelector('.workspace').inert=true;$('reset').disabled=true;document.body.classList.add('exporting');updateExportInfo();
  showProgress(format==='gif'?'正在准备 GIF':'正在导出当前帧',0,'图片仅在当前浏览器中处理');
  try{
    let blob;
    if(format==='gif')blob=await exportGif();
    else{
      const output=document.createElement('canvas'),r=paintFrame(output,playhead,Infinity,format!=='png');
      if(format==='png')blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
      else if(format==='txt')blob=new Blob([r.text],{type:'text/plain;charset=utf-8'});
      else{
        const bg=state.transparent?'':`<rect width="100%" height="100%" fill="${state.background}"/>`;
        const chars=r.cells.map(c=>`<text x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" fill="${c.color}" opacity="${c.alpha.toFixed(3)}" font-size="${c.fontSize.toFixed(3)}">${escapeXML(c.char)}</text>`).join('');
        blob=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">${bg}<g font-family="Courier New,monospace" text-anchor="middle" dominant-baseline="central">${chars}</g></svg>`],{type:'image/svg+xml;charset=utf-8'});
      }
      output.width=1;output.height=1;
    }
    if(exportCancelled)throw new DOMException('Cancelled','AbortError');
    if(!blob)throw new Error('导出失败，请降低画质后重试');download(blob,format);toast(format==='gif'?'ASCII 动画已导出':format==='txt'?'当前帧文本已导出，文本不含颜色和位移':'当前帧已导出');
  }catch(error){toast(exportCancelled||error.name==='AbortError'?'已取消导出':error.message||'导出失败，请降低画质后重试')}
  finally{exporting=false;exportReject=null;$('export-progress').hidden=true;document.querySelector('.workspace').inert=false;$('reset').disabled=false;document.body.classList.remove('exporting');updateExportInfo();render();setPlaying(wasPlaying)}
}
$('export').addEventListener('click',exportArt);$('export-top').addEventListener('click',exportArt);
controls();applyPreset('blue');syncMotion();setBusy(false);

// The agent interface configures the same controls as the visible editor.
function readConfiguration(){return {settings:{...state},animation:{...motion,playing,time:playhead,duration:duration(),sourceFrames:sourceMedia?.frames.length||0},image:source?{name:$('file-name').textContent,width:source.naturalWidth,height:source.naturalHeight}:null,result:rendered?{columns:rendered.cols,rows:rendered.rows,width:rendered.width,height:rendered.height}:null}}
const context=document.modelContext;
if(context?.registerTool){
 const lifecycle=new AbortController();
 const specs=[{name:'read_ascii_settings',description:'Read current ASCII editor settings and image/output dimensions.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>readConfiguration()},
 {name:'configure_ascii',description:'Adjust ASCII density, glyph size, brightness, contrast, threshold or a visual preset. Does not upload or export.',inputSchema:{type:'object',properties:{preset:{type:'string',enum:['original','classic','blue','terminal']},density:{type:'integer',minimum:30,maximum:240},size:{type:'integer',minimum:40,maximum:130},brightness:{type:'integer',minimum:-80,maximum:80},contrast:{type:'integer',minimum:40,maximum:240},threshold:{type:'integer',minimum:0,maximum:75}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Settings must be an object');
  const bounds={density:[30,240],size:[40,130],brightness:[-80,80],contrast:[40,240],threshold:[0,75]};
  for(const [key,value] of Object.entries(input)){if(key==='preset'){if(!Object.hasOwn(presets,value))throw new Error('Unknown preset')}else if(!Object.hasOwn(bounds,key)||!Number.isInteger(value)||value<bounds[key][0]||value>bounds[key][1])throw new Error('Invalid setting: '+key)}
  if(input.preset)applyPreset(input.preset);
  const updates=Object.fromEntries(Object.entries(input).filter(([k])=>k!=='preset'));
  if(Object.keys(updates).length){Object.assign(state,updates);settingsChanged()}
  if(queued){cancelAnimationFrame(queued);queued=0}render();return readConfiguration();
 }}];
 for(const tool of specs){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
