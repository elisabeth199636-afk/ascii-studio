'use strict';
const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d');
let source=null,sourceTones={low:0,high:1},sourceUrl='',queued=0,currentView='ascii',rendered=null,loadId=0,toastTimer;
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
  $('foreground').disabled=state['color-mode']==='original';
  $('foreground-value').textContent=state['color-mode']==='original'?'原色':state.foreground.slice(1).toUpperCase();
  $('background-value').textContent=state.background.slice(1).toUpperCase();
}
function schedule(){if(queued)cancelAnimationFrame(queued);queued=requestAnimationFrame(()=>{queued=0;render()})}
function hexRGB(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
function settingsChanged(preserveNumber=null){controls(preserveNumber);document.querySelectorAll('.preset').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});schedule()}
for(const key of Object.keys(defaults))$(key).addEventListener('input',()=>{const el=$(key);state[key]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;settingsChanged()});
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
function applyPreset(name){Object.assign(state,presets[name]);controls();document.querySelectorAll('.preset').forEach(b=>{const active=b.dataset.preset===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)});setView('ascii');schedule()}
document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
$('reset').addEventListener('click',()=>{applyPreset('original');toast('已恢复默认参数')});
function setView(view){currentView=view;canvas.hidden=view!=='ascii'||!source;$('original-image').hidden=view!=='original'||!source;for(const k of ['ascii','original']){$('view-'+k).classList.toggle('selected',view===k);$('view-'+k).setAttribute('aria-pressed',view===k)}$('empty-state').hidden=!!source;$('artboard').classList.toggle('is-transparent',!!source&&state.transparent&&view==='ascii');syncPreviewScale()}
$('view-ascii').addEventListener('click',()=>setView('ascii'));$('view-original').addEventListener('click',()=>setView('original'));
function syncPreviewScale(center=false){
  if(!source)return;
  const board=$('artboard'),zoomed=board.classList.contains('zoomed');
  const scale=Math.min(board.clientWidth/source.naturalWidth,board.clientHeight/source.naturalHeight);
  for(const element of [canvas,$('original-image')]){
    element.style.width=zoomed?Math.round(source.naturalWidth*scale*2)+'px':'';
    element.style.height=zoomed?Math.round(source.naturalHeight*scale*2)+'px':'';
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
function setBusy(busy){document.body.classList.toggle('busy',busy);$('fit').disabled=!source;for(const id of ['export','export-top'])$(id).disabled=busy||!source}
async function loadFile(file){if(!/^image\/(png|jpeg|webp|avif|gif|bmp)$/i.test(file.type)){toast('请选择 JPG、PNG、WebP、AVIF、GIF 或 BMP 图片');return}if(file.size>25*1024*1024){toast('图片超过 25 MB，请压缩后再试');return}const url=URL.createObjectURL(file);await loadImage(url,file.name,true)}
async function loadImage(url,name,isObject=false){const ticket=++loadId;setBusy(true);try{const img=new Image();img.src=url;await img.decode();if(ticket!==loadId){if(isObject)URL.revokeObjectURL(url);return}if(img.naturalWidth*img.naturalHeight>80000000)throw new Error('oversize');const tones=analyseImage(img);if(sourceUrl.startsWith('blob:'))URL.revokeObjectURL(sourceUrl);source=img;sourceTones=tones;sourceUrl=url;$('source-file').hidden=false;$('source-thumb').src=url;$('original-image').src=url;$('file-name').textContent=name;$('file-size').textContent=img.naturalWidth+' × '+img.naturalHeight;$('empty-state').hidden=true;setView('ascii');render();if(isObject)toast('图片已载入，可以开始调整了')}catch(error){if(isObject)URL.revokeObjectURL(url);if(ticket===loadId)toast(error.message==='oversize'?'图片尺寸过大，请缩小到 8000 万像素以内':'这张图片无法读取，请换一张图片重试')}finally{if(ticket===loadId)setBusy(false)}}
function render(){
  if(!source)return;
  const start=performance.now();
  const board=$('artboard'),scrollLeft=board.scrollLeft,scrollTop=board.scrollTop;
  const cols=state.density;
  const rows=Math.max(1,Math.min(400,Math.round(cols*source.naturalHeight/source.naturalWidth*.58)));
  const sampler=document.createElement('canvas');
  sampler.width=cols;sampler.height=rows;
  const sample=sampler.getContext('2d',{willReadFrequently:true});
  sample.drawImage(source,0,0,cols,rows);
  const pixels=sample.getImageData(0,0,cols,rows).data;
  const {width,height,cellW,cellH,fontSize}=AsciiCore.outputGeometry(source.naturalWidth,source.naturalHeight,cols,rows,state.size);
  if(canvas.width!==width)canvas.width=width;
  if(canvas.height!==height)canvas.height=height;
  ctx.clearRect(0,0,width,height);
  if(!state.transparent){ctx.fillStyle=state.background;ctx.fillRect(0,0,width,height)}
  ctx.font=fontSize+'px "Courier New", monospace';ctx.textBaseline='middle';ctx.textAlign='center';
  const chars=Array.from(state.charset==='custom'?(state.custom.trim()?state.custom:' .:-=+*#%@'):ramps[state.charset]).slice(0,80);
  const backgroundRGB=hexRGB(state.background);
  const lightBackground=(backgroundRGB[0]*.2126+backgroundRGB[1]*.7152+backgroundRGB[2]*.0722)>145;
  const settings={...state,lightBackground};
  const mono=state['color-mode']==='mono';
  const cells=[],lines=[];
  for(let y=0;y<rows;y++){
    let line='';
    for(let x=0;x<cols;x++){
      const p=(y*cols+x)*4;
      const char=AsciiCore.mapCell(pixels.subarray(p,p+4),settings,sourceTones,chars);
      line+=char;
      if(char===' ')continue;
      const color=mono?state.foreground:`rgb(${pixels[p]},${pixels[p+1]},${pixels[p+2]})`;
      ctx.fillStyle=color;ctx.fillText(char,(x+.5)*cellW,(y+.5)*cellH);
      cells.push({x,y,char,color});
    }
    lines.push(line);
  }
  rendered={cols,rows,cellW,cellH,fontSize,cells,text:lines.join('\n'),width,height};
  $('render-info').textContent=`${cols} × ${rows} 字符 · ${cells.length.toLocaleString()} 个可见`;
  $('export-dimensions').textContent=`${width} × ${height} px`;
  $('artboard').classList.toggle('is-transparent',state.transparent&&currentView==='ascii');
  syncPreviewScale();
  board.scrollLeft=scrollLeft;board.scrollTop=scrollTop;
  canvas.dataset.renderMs=(performance.now()-start).toFixed(1);
}
let dragDepth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false}});window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()});window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').hidden=true});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;const file=e.dataTransfer.files[0];if(file)loadFile(file)});window.addEventListener('paste',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;const item=Array.from(e.clipboardData?.items||[]).find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();loadFile(item.getAsFile())}});
function escapeXML(text){return text.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))}
async function exportArt(){if(!source)return toast('请先选择一张图片');if(queued){cancelAnimationFrame(queued);queued=0;render()}const format=$('format').value;const r=rendered;let blob;try{if(format==='png')blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));else if(format==='txt')blob=new Blob([r.text],{type:'text/plain;charset=utf-8'});else{const bg=state.transparent?'':`<rect width="100%" height="100%" fill="${state.background}"/>`;const chars=r.cells.map(c=>`<text x="${((c.x+.5)*r.cellW).toFixed(2)}" y="${((c.y+.5)*r.cellH).toFixed(2)}" fill="${c.color}">${escapeXML(c.char)}</text>`).join('');blob=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">${bg}<g font-family="Courier New,monospace" font-size="${r.fontSize}" text-anchor="middle" dominant-baseline="central">${chars}</g></svg>`],{type:'image/svg+xml;charset=utf-8'})}if(!blob)throw new Error('export');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=($('file-name').textContent.replace(/\.[^.]+$/,'')||'image')+'-ascii.'+format;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(format==='txt'?'文本已导出，用等宽字体打开效果更好':'作品已导出')}catch{toast('导出失败，请降低疏密后重试')}}
$('export').addEventListener('click',exportArt);$('export-top').addEventListener('click',exportArt);
controls();applyPreset('blue');setBusy(false);

// The agent interface configures the same controls as the visible editor.
function readConfiguration(){return {settings:{...state},image:source?{name:$('file-name').textContent,width:source.naturalWidth,height:source.naturalHeight}:null,result:rendered?{columns:rendered.cols,rows:rendered.rows,width:rendered.width,height:rendered.height}:null}}
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
