'use strict';
importScripts('vendor/gifenc.js','gif-export.js');
let encoder;
self.onmessage=event=>{
  try{
    const data=event.data;
    if(data.type==='start')encoder=GifExport.create(data.width,data.height,data.transparent);
    if(data.type==='frame')encoder.frame(new Uint8ClampedArray(data.buffer),data.delay);
    if(data.type==='finish'){const bytes=encoder.finish();self.postMessage({buffer:bytes.buffer},[bytes.buffer]);encoder=null;return}
    self.postMessage({ok:true});
  }catch(error){self.postMessage({error:error.message})}
};
