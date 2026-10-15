(function(root){
  'use strict';
  const TAU=Math.PI*2;
  const wrap=(value,length)=>((value%length)+length)%length;
  function frameIndex(delays,timeMs){
    const total=delays.reduce((a,b)=>a+b,0);
    let time=wrap(timeMs,total);
    for(let i=0;i<delays.length;i++){if(time<delays[i])return i;time-=delays[i]}
    return delays.length-1;
  }
  function transform(cell,settings,phase,cols,rows,chars){
    const strength=settings.intensity/100;
    const angle=wrap(phase,1)*TAU*settings.direction;
    const result={dx:0,dy:0,scale:1,alpha:1,char:cell.char};
    if(!strength||settings.effect==='none')return result;
    if(settings.effect==='wave'){
      result.dx=Math.sin(cell.y/Math.max(1,rows)*TAU*2-angle)*strength*1.8;
      result.dy=Math.cos(cell.x/Math.max(1,cols)*TAU-angle)*strength*.55;
    }else if(settings.effect==='breathe'){
      const breath=(1-Math.cos(angle))/2;
      result.scale=1-strength*.45*breath;result.alpha=1-strength*.45*breath;
    }else if(settings.effect==='scan'){
      const position=wrap(phase*settings.direction,1);
      const delta=Math.abs((cell.y+.5)/rows-position);
      const distance=Math.min(delta,1-delta);
      const highlight=Math.exp(-distance*distance/.008);
      result.alpha=1-strength*.8*(1-highlight);
    }else if(settings.effect==='scramble'){
      const seed=(Math.sin(cell.x*127.1+cell.y*311.7)*43758.5453)%1;
      const variation=Math.sin(angle*3+seed*TAU);
      const index=chars.indexOf(cell.char);
      if(index>0){const offset=Math.round(variation*strength*2);result.char=chars[Math.max(1,Math.min(chars.length-1,index+offset))]}
      result.alpha=1-strength*.25*(1+variation)/2;
    }
    return result;
  }
  function exportPlan(duration,fps,longEdge,width,height){
    if(!Number.isFinite(duration)||duration<=0||duration>30)throw new Error('GIF 导出最长 30 秒，请提高播放速度或缩短循环时长');
    const frames=Math.max(2,Math.ceil(duration*fps));
    if(frames>360)throw new Error('GIF 最多导出 360 帧，请降低帧率或提高播放速度');
    const scale=Math.min(longEdge/width,longEdge/height,1);
    const delays=Array.from({length:frames},(_,i)=>Math.max(20,10*(Math.round((i+1)*duration*100/frames)-Math.round(i*duration*100/frames))));
    return {frames,width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),delays,step:duration/frames};
  }
  const api={wrap,frameIndex,transform,exportPlan};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MotionCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
