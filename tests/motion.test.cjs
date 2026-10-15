const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Motion=require('../dist/motion-core.js');
const GifFrames=require('../dist/gif-source.js');
const GifExport=require('../dist/gif-export.js');
const {GifWriter,GifReader}=require('../dist/vendor/omggif.js');

function fixture(){
 const buffer=new Uint8Array(4096),writer=new GifWriter(buffer,3,2,{palette:[0x000000,0xff0000,0x00ff00,0x0000ff],loop:0});
 writer.addFrame(0,0,3,2,Uint8Array.from([1,0,0,0,0,0]),{delay:10,transparent:0,disposal:1});
 writer.addFrame(1,0,1,1,Uint8Array.from([2]),{delay:20,transparent:0,disposal:3});
 writer.addFrame(2,0,1,1,Uint8Array.from([3]),{delay:30,transparent:0,disposal:2});
 writer.addFrame(0,1,1,1,Uint8Array.from([2]),{delay:10,transparent:0,disposal:1});
 return buffer.slice(0,writer.end());
}
const pixel=(rgba,x,y)=>Array.from(rgba.slice((y*3+x)*4,(y*3+x+1)*4));
test('GIF compositing restores previous frames and clears disposal rectangles only',()=>{
 const frames=new GifFrames(fixture());
 const first=frames.next().slice();assert.deepEqual(pixel(first,0,0),[255,0,0,255]);assert.equal(pixel(first,1,0)[3],0);
 const second=frames.next().slice();assert.deepEqual(pixel(second,1,0),[0,255,0,255]);assert.deepEqual(pixel(second,0,0),[255,0,0,255]);
 const third=frames.next().slice();assert.equal(pixel(third,1,0)[3],0);assert.deepEqual(pixel(third,2,0),[0,0,255,255]);
 const fourth=frames.next().slice();assert.equal(pixel(fourth,2,0)[3],0);assert.deepEqual(pixel(fourth,0,1),[0,255,0,255]);assert.deepEqual(pixel(fourth,0,0),[255,0,0,255]);
 assert.deepEqual(frames.delays,[100,200,300,100]);
});
test('timeline honours unequal frame durations and wraps at the exact loop boundary',()=>{
 const delays=[100,200,300];
 for(const [time,index] of [[0,0],[99,0],[100,1],[299,1],[300,2],[599,2],[600,0],[750,1]])assert.equal(Motion.frameIndex(delays,time),index);
});
test('all animation effects are deterministic and return to their initial state at a full cycle',()=>{
 const cell={x:11,y:9,char:'@'},chars=Array.from(' .:-=+*#%@');
 for(const effect of ['breathe','wave','scan','scramble']){
  const settings={effect,intensity:80,direction:1};
  assert.deepEqual(Motion.transform(cell,settings,0,80,60,chars),Motion.transform(cell,settings,1,80,60,chars));
  assert.deepEqual(Motion.transform(cell,settings,.3,80,60,chars),Motion.transform(cell,settings,.3,80,60,chars));
  assert.notDeepEqual(Motion.transform(cell,settings,.13,80,60,chars),Motion.transform(cell,settings,.43,80,60,chars));
  assert.deepEqual(Motion.transform(cell,{...settings,intensity:0},.5,80,60,chars),{dx:0,dy:0,scale:1,alpha:1,char:'@'});
 }
});
test('GIF export preserves the requested duration in centiseconds and bounds memory work',()=>{
 const plan=Motion.exportPlan(4,12,720,1800,2400);
 assert.equal(plan.frames,48);assert.equal(plan.delays.reduce((a,b)=>a+b,0),4000);
 assert.equal(plan.width,540);assert.equal(plan.height,720);
 assert.throws(()=>Motion.exportPlan(31,12,720,1800,2400),/30 秒/);
 assert.throws(()=>Motion.exportPlan(30,24,720,1800,2400),/360 帧/);
});
test('encoded transparent GIF has multiple independent frames with correct timing and looping',()=>{
 const encoder=GifExport.create(3,2,true);
 const a=new Uint8ClampedArray(24);a.set([255,0,0,255],0);
 const b=new Uint8ClampedArray(24);b.set([0,255,0,255],20);
 encoder.frame(a,100);encoder.frame(b,200);
 const bytes=encoder.finish(),reader=new GifReader(bytes),frames=new GifFrames(bytes);
 assert.equal(reader.numFrames(),2);assert.equal(reader.loopCount(),0);assert.deepEqual(frames.delays,[100,200]);
 const first=frames.next().slice(),second=frames.next().slice();
 assert.equal(first[3],255);assert.equal(second[3],0);assert.equal(second[23],255);
});
test('GIF dimension and frame limits reject oversized headers before allocating image buffers',()=>{
 const bytes=fixture();bytes[6]=0xff;bytes[7]=0x7f;bytes[8]=0xff;bytes[9]=0x7f;
 assert.throws(()=>new GifFrames(bytes),/400 万像素/);
});
if(process.env.ASCII_FIXTURE_DIR){
 fs.mkdirSync(process.env.ASCII_FIXTURE_DIR,{recursive:true});
 fs.writeFileSync(path.join(process.env.ASCII_FIXTURE_DIR,'disposal-test.gif'),fixture());
 const buf=new Uint8Array(100000),w=new GifWriter(buf,160,120,{palette:[0x0d1820,0xfff1bb,0xff6855,0x5078f0],loop:0});
 for(let i=0;i<12;i++){
  const pixels=new Uint8Array(160*120);const cx=40+i*6;
  for(let y=25;y<95;y++)for(let x=0;x<160;x++)if((x-cx)**2+(y-60)**2<24**2)pixels[y*160+x]=i%2?1:2;
  w.addFrame(0,0,160,120,pixels,{delay:i%2?15:10,disposal:1});
 }
 fs.writeFileSync(path.join(process.env.ASCII_FIXTURE_DIR,'motion-test.gif'),buf.slice(0,w.end()));
}
