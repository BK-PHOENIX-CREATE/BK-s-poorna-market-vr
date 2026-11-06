import * as THREE from 'three';

// Curated architectural exhibition; works with the original optimized market GLB.
// Scene locations are indicative, based on model bounding dimensions.
const $=id=>document.getElementById(id);
const v=window.poornaViewer;
if(!v) throw new Error('3D model viewer is not available');
const {camera,scene,renderer,orbit,sun,opposite,ambient,ground}=v;
let stops=[
 {id:'arrival',title:'Arrival & street edge',desc:'Examine the relationship between the market proposal and its public-facing site edges.',label:'Site and access',note:'The project panel includes site analysis and access studies. Compare this view with the contextual drawings.',anchor:[-.4,.12,.40]},
 {id:'overview',title:'The market as a whole',desc:'Understand built massing, internal routes and the overall market organization.',label:'Market organization',note:'Use the floor plans and circulation diagrams alongside this view to read the proposed trading and public spaces.',anchor:[0,.13,0]},
 {id:'plan',title:'Roof & spatial layout',desc:'Study the building volume and the organization of the levels from above.',label:'Roof and levels',note:'The architectural drawings include plans, sections and elevations showing different building levels.',anchor:[.08,.85,-.1]},
 {id:'interior',title:'Experience the architecture',desc:'Explore a lower architectural perspective and understand the scale of the market.',label:'Human-scale experience',note:'Walk Mode lets you move over modeled ramps and floors. This waypoint is a presentation camera view rather than a verified room label.',anchor:[.05,.15,-.04]},
 {id:'facade',title:'Architectural frontage',desc:'Finish with the building envelope and compare it with the presentation elevations.',label:'Elevations and sections',note:'The section and elevation sheets show vertical relationships and the expression of the proposal.',anchor:[.36,.30,-.35]}
];
const elements={
 points:$('exHotspots'),info:$('exInfo'),index:$('exInfoIndex'),title:$('exInfoTitle'),body:$('exInfoBody'),
 views:$('exViews'),lighting:$('exLighting'),toggle:$('exToggleHotspots'),
 play:$('exPlay'),prev:$('exPrev'),next:$('exNext'),tourTitle:$('exTourTitle'),tourDesc:$('exTourDesc'),tourCount:$('exTourCount')
};
let current=-1,playing=false,elapsed=0,enabled=true,tween=null,infoIndex=-1,loaded=false;
const temp=new THREE.Vector3();
let buttons=[];
function rebuildHotspots(){
 buttons.forEach(b=>b.remove());buttons=[];
 stops.forEach((stop,i)=>{

 const b=document.createElement('button');
 b.type='button';b.className='ex-hotspot';b.textContent=String(i+1).padStart(2,'0');
 b.title=stop.label;b.setAttribute('aria-label',stop.label);
 b.addEventListener('click',()=>{pause();showInfo(i)});
 elements.points.appendChild(b);buttons.push(b);
 });
}
rebuildHotspots();
function point(normalized,world=false){
 const box=v.getBounds(),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 if(!normalized)return center;
 if(world)return new THREE.Vector3(...normalized);
 return new THREE.Vector3(center.x+normalized[0]*size.x,center.y+normalized[1]*size.y,center.z+normalized[2]*size.z);
}
function showInfo(i){
 infoIndex=i;const stop=stops[i];if(!stop)return;
 elements.index.textContent=String(i+1).padStart(2,'0')+' / ARCHITECTURAL INSIGHT';
 elements.title.textContent=stop.label;elements.body.textContent=stop.note;elements.info.hidden=false;
 buttons.forEach((b,j)=>b.classList.toggle('active',j===i));
}
function closeInfo(){infoIndex=-1;elements.info.hidden=true;buttons.forEach(b=>b.classList.remove('active'))}
$('exInfoClose').addEventListener('click',closeInfo);
elements.toggle.addEventListener('click',()=>{
 enabled=!enabled;elements.toggle.setAttribute('aria-pressed',String(enabled));
 elements.toggle.textContent=enabled?'◉ Hotspots on':'○ Hotspots off';
 elements.points.hidden=!enabled;if(!enabled)closeInfo();
});
function positionFor(id){
 const custom=stops.find(stop=>stop.id===id);if(custom?.pose?.position&&custom?.pose?.target)return {position:new THREE.Vector3(...custom.pose.position),target:new THREE.Vector3(...custom.pose.target)};
 const box=v.getBounds(),size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
 const d=Math.max(size.x,size.z,35),h=Math.max(size.y,9),target=new THREE.Vector3(c.x,c.y+h*.04,c.z);
 switch(id){
 case 'arrival':return {position:new THREE.Vector3(c.x-d*.6,c.y+h*.36,c.z+d*.96),target};
 case 'overview':return {position:new THREE.Vector3(c.x+d*.85,c.y+h*.90,c.z+d*.94),target};
 case 'plan':return {position:new THREE.Vector3(c.x+.001,c.y+Math.max(d*1.4,h*2.8),c.z+.001),target};
 case 'interior':return {position:new THREE.Vector3(c.x+d*.22,c.y+Math.max(4.5,h*.24),c.z+d*.29),target:new THREE.Vector3(c.x,c.y+Math.max(1.7,h*.17),c.z)};
 default:return {position:new THREE.Vector3(c.x+d*.98,c.y+h*.50,c.z-d*.31),target};
 }
}
function view(id,fromTour=false){
 if(!v.isLoaded()){v.notice('Load the market model to use saved viewpoints.');return}
 if(renderer.xr.isPresenting){v.notice('Use saved viewpoints outside immersive VR.');return}
 if(!fromTour)pause();
 const stop=stops.find(s=>s.id===id);if(!stop)return;
 if(document.pointerLockElement===renderer.domElement)document.exitPointerLock?.();
 const beforePosition=camera.position.clone(),beforeTarget=orbit.target.clone();
 v.setMode('orbit'); // preserves existing Sky and grounded Walk functionality
 camera.position.copy(beforePosition);orbit.target.copy(beforeTarget);orbit.update();
 const pose=positionFor(id);
 tween={start:beforePosition,startTarget:beforeTarget,end:pose.position,endTarget:pose.target,time:0,duration:1.7};
 elements.views.value=id;
 v.status('Saved architectural view: '+stop.title);
}
elements.views.addEventListener('change',()=>{if(elements.views.value)view(elements.views.value)});
function updateTour(){
 const stop=stops[current];
 elements.tourTitle.textContent=stop?stop.title:'Your custom journey through Poorna Market';
 elements.tourDesc.textContent=stop?stop.desc:'Load the model to begin the journey.';
 elements.tourCount.textContent=String(Math.max(0,current+1)).padStart(2,'0')+' / '+String(stops.length).padStart(2,'0');
 elements.play.textContent=playing?'Ⅱ Pause tour':current>=stops.length-1?'↺ Replay tour':current<0?'▶ Start tour':'▶ Resume tour';
 elements.prev.disabled=!loaded||current<=0;
 elements.next.disabled=!loaded||current>=stops.length-1;
}
function pause(){playing=false;updateTour()}
function stop(){pause();tween=null}
function stopAt(i,autoplay=false){
 if(!v.isLoaded()||!stops.length)return;
 current=THREE.MathUtils.clamp(i,0,stops.length-1);elapsed=0;
 view(stops[current].id,true);
 playing=autoplay;
 if(enabled)showInfo(current);
 updateTour();
}
elements.play.addEventListener('click',()=>{
 if(!v.isLoaded()){v.notice('Load the 3D model first.');return}
 if(playing){pause();return}
 if(!stops.length){v.notice('Add at least one tour marker in Plan Tour.');return}
 if(current===-1||current>=stops.length-1){stopAt(0,true);return}
 playing=true;updateTour();
});
elements.prev.addEventListener('click',()=>stopAt(current-1,false));
elements.next.addEventListener('click',()=>stopAt(current+1,false));
// OrbitControls emits start when a visitor takes manual camera control.
orbit.addEventListener('start',()=>{stop()});
function lighting(mode){
 const fog=scene.fog;
 if(mode==='golden'){
  scene.background.set(0xc8b39c);if(fog)fog.color.set(0xc8b39c);
  sun.color.set(0xffba73);sun.intensity=3.1;sun.position.set(-75,32,20);
  opposite.intensity=.5;ambient.intensity=.6;renderer.toneMappingExposure=1.25;ground.material.color.set(0xcdb9a5);
 }else if(mode==='overcast'){
  scene.background.set(0xc5d0cd);if(fog)fog.color.set(0xc5d0cd);
  sun.color.set(0xeaf1f5);sun.intensity=1.4;sun.position.set(-25,92,25);
  opposite.intensity=.65;ambient.intensity=1.15;renderer.toneMappingExposure=1.4;ground.material.color.set(0xcbd1ca);
 }else{
  scene.background.set(0xd6e4ed);if(fog)fog.color.set(0xd6e4ed);
  sun.color.set(0xfff0d5);sun.intensity=3.1;sun.position.set(-45,80,42);
  opposite.intensity=.8;ambient.intensity=.7;renderer.toneMappingExposure=1.4;ground.material.color.set(0xd7d6c7);
 }
 v.status('Lighting selected: '+(mode==='golden'?'golden hour':mode==='overcast'?'soft overcast':'clear daylight'));
}
elements.lighting.addEventListener('change',()=>lighting(elements.lighting.value));
function tick(dt){
 if(tween&&!renderer.xr.isPresenting){
  tween.time=Math.min(tween.duration,tween.time+dt);
  const t=tween.time/tween.duration,e=t*t*(3-2*t);
  camera.position.copy(tween.start).lerp(tween.end,e);
  orbit.target.copy(tween.startTarget).lerp(tween.endTarget,e);
  orbit.update();
  if(t>=1)tween=null;
 }
 if(playing&&!renderer.xr.isPresenting){
  elapsed+=dt;
  if(elapsed>=8.5){if(current>=stops.length-1)pause();else stopAt(current+1,true)}
 }
 if(!loaded||!enabled||renderer.xr.isPresenting){
  buttons.forEach(b=>b.hidden=true);return;
 }
 const width=$('canvasMount').clientWidth,height=$('canvasMount').clientHeight;
 if(document.querySelector('.mode-tab.selected')?.dataset.mode!=='orbit'&&document.querySelector('.mode-tab.selected')?.dataset.mode!=='plan'){
  buttons.forEach(b=>b.hidden=true);return;
 }
 stops.forEach((stop,i)=>{
  temp.copy(point(stop.anchor,stop.worldAnchor)).project(camera);
  const b=buttons[i],outside=temp.z>1||temp.z< -1||Math.abs(temp.x)>.98||Math.abs(temp.y)>.96;
  b.hidden=outside;if(!outside){b.style.left=((temp.x*.5+.5)*width)+'px';b.style.top=((-temp.y*.5+.5)*height)+'px'}
 });
}
function setTourStops(next){if(!Array.isArray(next)||next.length>50)return false;
 const valid=next.every(item=>item&&typeof item.id==='string'&&typeof item.title==='string'&&typeof item.desc==='string'&&Array.isArray(item.anchor)&&item.anchor.length===3);
 if(!valid)return false;
 stops=next.map((item,i)=>({id:String(item.id).slice(0,60),title:String(item.title).slice(0,75),desc:String(item.desc).slice(0,500),label:String(item.label||item.title).slice(0,75),note:String(item.note||item.desc).slice(0,500),anchor:item.anchor.map(Number),worldAnchor:!!item.worldAnchor,pose:item.pose&&Array.isArray(item.pose.position)&&Array.isArray(item.pose.target)?{position:item.pose.position.map(Number),target:item.pose.target.map(Number)}:undefined}));
 current=-1;playing=false;tween=null;closeInfo();rebuildHotspots();
 elements.views.innerHTML='<option value="">Choose a saved view…</option>';
 stops.forEach(stop=>{const opt=document.createElement('option');opt.value=stop.id;opt.textContent=stop.title;elements.views.appendChild(opt)});
 updateTour();return true;
}
function modelReady(){loaded=true;current=-1;playing=false;elapsed=0;tween=null;closeInfo();updateTour();lighting(elements.lighting.value)}
window.poornaExhibition={tick,modelReady,stop,getStops:()=>stops.map(x=>({...x,anchor:[...x.anchor],pose:x.pose?{position:[...x.pose.position],target:[...x.pose.target]}:undefined})),setTourStops,goToStop:(i)=>stopAt(i,false),pause};
updateTour();
