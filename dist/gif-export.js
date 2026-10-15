(function(root){
  'use strict';
  const encoder=typeof module!=='undefined'&&module.exports?require('./vendor/gifenc.js'):root.Gifenc;
  function create(width,height,transparent){
    const gif=encoder.GIFEncoder();
    return {
      frame(rgba,delay){
        const palette=encoder.quantize(rgba,transparent?255:256);
        const index=encoder.applyPalette(rgba,palette);
        const transparentIndex=transparent?palette.length:0;
        if(transparent){palette.push([0,0,0]);for(let i=0;i<index.length;i++)if(rgba[i*4+3]<128)index[i]=transparentIndex}
        gif.writeFrame(index,width,height,{palette,delay,repeat:0,transparent,transparentIndex,dispose:transparent?2:1});
        if(gif.bytesView().length>100*1024*1024)throw new Error('GIF 文件过大，请降低画质或帧率');
      },
      finish(){gif.finish();return gif.bytes()}
    };
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={create};else root.GifExport={create};
})(typeof globalThis!=='undefined'?globalThis:this);
