const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyseTones,mapCell,outputGeometry}=require('../dist/ascii-core.js');
const settings={contrast:145,brightness:13,threshold:39,invert:false,lightBackground:false};
const blue=[192,218,251,255],white=[255,255,255,255];
const pixels=new Uint8ClampedArray([...Array.from({length:80},()=>blue).flat(),...Array.from({length:20},()=>white).flat()]);
test('pale blue + white remains a silhouette at the reported binary settings',()=>{
 const tones=analyseTones(pixels);
 assert.equal(mapCell(blue,settings,tones,Array.from(' 01')),' ');
 assert.equal(mapCell(white,settings,tones,Array.from(' 01')),'1');
});
test('transparent RGB never changes the source tonal range or produces a glyph',()=>{
 const opaque=analyseTones(pixels);
 const withAlpha=analyseTones(new Uint8ClampedArray([...pixels,...Array(1000).fill([0,0,0,0]).flat()]));
 assert.deepEqual(withAlpha,opaque);
 assert.equal(mapCell([255,255,255,0],settings,withAlpha,Array.from(' 01')),' ');
});
test('a solid colour is not expanded into an artificial tonal range',()=>{
 assert.deepEqual(analyseTones(new Uint8ClampedArray(Array(100).fill(blue).flat())),{low:0,high:1});
});
test('density changes glyph size while output dimensions and image aspect stay fixed',()=>{
 const sparse=outputGeometry(377,467,53,38,110),dense=outputGeometry(377,467,106,76,110);
 assert.equal(sparse.width,dense.width);assert.equal(sparse.height,dense.height);
 assert.equal(sparse.cellW,dense.cellW*2);assert.equal(sparse.fontSize,dense.fontSize*2);
 assert.ok(Math.abs(sparse.height/sparse.width-467/377)<.001);
});
test('brightness, glyph size and inversion still change the generated result',()=>{
 const tones=analyseTones(pixels),chars=Array.from(' .:-=+*#%@');
 assert.notEqual(mapCell(blue,settings,tones,chars),mapCell(blue,{...settings,invert:true},tones,chars));
 assert.notEqual(mapCell(blue,settings,tones,chars),mapCell(blue,{...settings,brightness:80,contrast:100},tones,chars));
 assert.ok(outputGeometry(377,467,53,38,50).fontSize<outputGeometry(377,467,53,38,110).fontSize);
});
test('light background retains the dark silhouette; extreme aspect ratios remain bounded',()=>{
 const tone=analyseTones(new Uint8ClampedArray([0,0,0,255,255,255,255,255]));
 assert.equal(mapCell([255,255,255,255],{...settings,lightBackground:true},tone,Array.from(' 01')),' ');
 assert.equal(mapCell([0,0,0,255],{...settings,lightBackground:true},tone,Array.from(' 01')),'1');
 for(const [w,h] of [[1,10000],[10000,1]]){const g=outputGeometry(w,h,100,400,110);assert.ok(g.width>=1&&g.width<=1800);assert.ok(g.height>=1&&g.height<=2400)}
});
