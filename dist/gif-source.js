(function(root){
  'use strict';
  const Reader=typeof module!=='undefined'&&module.exports?require('./vendor/omggif.js').GifReader:root.GifReader;
  class GifFrames{
    constructor(bytes){
      this.reader=new Reader(bytes);this.width=this.reader.width;this.height=this.reader.height;
      if(this.width*this.height>4000000)throw new Error('GIF 分辨率过大，请缩小到 400 万像素以内');
      const count=this.reader.numFrames();
      if(!count||count>360)throw new Error('GIF 最多支持 360 帧，请先缩短动图');
      this.info=Array.from({length:count},(_,i)=>this.reader.frameInfo(i));
      for(const f of this.info)if(f.x+f.width>this.width||f.y+f.height>this.height)throw new Error('GIF 帧尺寸无效，请重新导出后再试');
      this.delays=this.info.map(f=>f.delay<2?100:f.delay*10);
      this.duration=this.delays.reduce((a,b)=>a+b,0);
      if(this.duration>30000)throw new Error('GIF 最长支持 30 秒，请先缩短动图');
      const offset=13+bytes[11]*3;
      this.background=(bytes[10]&128)?[bytes[offset],bytes[offset+1],bytes[offset+2],255]:[0,0,0,0];
      this.pixels=new Uint8ClampedArray(this.width*this.height*4);this.saved=null;this.index=-1;
      this.clear({x:0,y:0,width:this.width,height:this.height},this.info[0].transparent_index!==null);
    }
    clear(rect,transparent){
      const color=transparent?[0,0,0,0]:this.background;
      for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++){
        const p=(y*this.width+x)*4;this.pixels.set(color,p);
      }
    }
    next(){
      const previous=this.info[this.index];
      if(previous?.disposal===2)this.clear(previous,previous.transparent_index!==null);
      if(previous?.disposal===3&&this.saved)this.pixels.set(this.saved);
      const index=++this.index,frame=this.info[index];
      if(!frame)throw new Error('No more GIF frames');
      this.saved=frame.disposal===3?this.pixels.slice():null;
      this.reader.decodeAndBlitFrameRGBA(index,this.pixels);
      return this.pixels;
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=GifFrames;else root.GifFrames=GifFrames;
})(typeof globalThis!=='undefined'?globalThis:this);
