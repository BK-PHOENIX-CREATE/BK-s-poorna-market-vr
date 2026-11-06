import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {VRButton} from 'three/addons/webxr/VRButton.js';

window.market3dReady=true;
// Interactive viewer for the user's consolidated SVP Market model.
// Geometry is pre-optimized; unlike the raw SketchUp export, it contains only 39 material batches.
const $=(id)=>document.getElementById(id);
const mount=$('canvasMount');
if (!mount) throw new Error('Missing model canvas');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xd6d9cd);
scene.fog=new THREE.Fog(0xd6d9cd,170,430);
const camera=new THREE.PerspectiveCamera(56,1,.08,800);
const rig=new THREE.Group();rig.name='VR Player';scene.add(rig);rig.add(camera);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.45;
renderer.xr.enabled=true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.shadowMap.enabled=false;
mount.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);
orbit.enableDamping=true;orbit.dampingFactor=.07;orbit.maxPolarAngle=Math.PI*.49;orbit.minDistance=3;orbit.maxDistance=220;
orbit.target.set(0,6,0);
scene.add(new THREE.HemisphereLight(0xf8faf2,0x829383,3));
const ambient=new THREE.AmbientLight(0xffffff,.7);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffe8c7,3.5);sun.position.set(-35,75,30);scene.add(sun);
const opposite=new THREE.DirectionalLight(0xd9e9ff,1.1);opposite.position.set(35,30,-35);scene.add(opposite);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(520,520),new THREE.MeshStandardMaterial({color:0xd7d6c7,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;scene.add(ground);
const grid=new THREE.GridHelper(260,52,0xa4aea3,0xc7d1c6);grid.position.y=-.07;grid.material.opacity=.22;grid.material.transparent=true;scene.add(grid);
let model=null,modelBounds=new THREE.Box3(new THREE.Vector3(-46,0,-38),new THREE.Vector3(46,20,38));
let modelLoaded=false,isLoading=false,currentMode='orbit',visible=true,lockRequested=false;
const EYE=1.7, STEP=.55, SLOPE=.55, RADIUS=.28;
let collisionMeshes=[],collisionReady=false,collisionPromise=null,collisionFailure='',fallSpeed=0;
const downRay=new THREE.Raycaster(),wallRay=new THREE.Raycaster(),DOWN=new THREE.Vector3(0,-1,0),NORMAL=new THREE.Vector3();
const keys=new Set();let yaw=0,pitch=0;
const text=$('viewerStatus'),tag=$('modelState'),modeLabel=$('viewModeName');
function status(s){text.textContent=s}
function notice(s){(window.marketToast||console.warn)(s)}
// Shared entrance-side corner spawn for desktop Walk and immersive Quest VR.
// The min-X / max-Z corner shows the long entrance façade receding to the
// right, as in the project's preferred exterior walkthrough screenshot.
// Save an exact desktop Walk viewpoint as the common Walk + Quest spawn.
// Local storage remembers it in this browser; the share URL transfers it
// to another device (including Meta Quest Browser).
// v2 intentionally drops the old opposite-corner saved start.
const START_STORAGE='poorna-walk-vr-start-v2';
let chosenStart=null;
function validStart(value){
 return value&&Array.isArray(value.position)&&value.position.length===3&&
 value.position.every(n=>Number.isFinite(n)&&Math.abs(n)<10000)&&
 Number.isFinite(value.yaw)&&Math.abs(value.yaw)<100;
}
function parseStart(raw){
 try{
  const vals=raw.split(',').map(Number);
  const value={position:vals.slice(0,3),yaw:vals[3]};
  return vals.length===4&&validStart(value)?value:null;
 }catch{return null}
}
try{
 const fromURL=new URLSearchParams(window.location.search).get('start');
 const stored=JSON.parse(localStorage.getItem(START_STORAGE)||'null');
 chosenStart=(fromURL?parseStart(fromURL):null)||(validStart(stored)?stored:null);
 if(chosenStart&&fromURL)localStorage.setItem(START_STORAGE,JSON.stringify(chosenStart));
}catch(e){console.warn('Start view storage unavailable',e)}
function setStartButtons(){
 const has=!!chosenStart;
 const save=$('saveWalkStartBtn'),share=$('shareWalkStartBtn'),clear=$('clearWalkStartBtn');
 if(save)save.hidden=currentMode!=='walk'||!modelLoaded||renderer.xr.isPresenting;
 if(share)share.hidden=!has;
 if(clear)clear.hidden=!has;
}
function startLink(){
 const url=new URL(window.location.href);
 url.hash='experience';
 const encoded=[...chosenStart.position,chosenStart.yaw].map(n=>n.toFixed(4)).join(',');
 url.searchParams.set('start',encoded);
 return url.href;
}
function writeStartToUI(){
 setStartButtons();
 if(chosenStart&&modelLoaded)status('Custom Walk / Quest spawn loaded · save another viewpoint to replace it');
}
$('saveWalkStartBtn')?.addEventListener('click',()=>{
 if(currentMode!=='walk'||!modelLoaded||renderer.xr.isPresenting){notice('Switch to Walk Mode and face the exact view you want first.');return}
 chosenStart={position:[camera.position.x,camera.position.y-EYE,camera.position.z],yaw};
 try{localStorage.setItem(START_STORAGE,JSON.stringify(chosenStart))}catch(e){}
 setStartButtons();
 status('Starting view saved for Walk and VR. Copy its link to use it on Quest 3.');
 notice('Starting view saved. Use Copy start link to open this exact view on Quest 3.');
});
$('shareWalkStartBtn')?.addEventListener('click',async()=>{
 if(!chosenStart)return;
 const link=startLink();
 try{await navigator.clipboard.writeText(link);notice('Starting-view link copied. Open this link on your Quest 3.')}
 catch(e){window.prompt('Copy starting-view link for Quest 3:',link)}
});
$('clearWalkStartBtn')?.addEventListener('click',()=>{
 chosenStart=null;
 try{localStorage.removeItem(START_STORAGE)}catch(e){}
 const url=new URL(window.location.href);url.searchParams.delete('start');
 window.history.replaceState(null,'',url.pathname+url.search+url.hash);
 setStartButtons();status('Custom starting view cleared');
});

function entranceSpawn(){
 if(chosenStart&&validStart(chosenStart)){
  const position=new THREE.Vector3(...chosenStart.position);
  const target=position.clone().add(new THREE.Vector3(-Math.sin(chosenStart.yaw),0,-Math.cos(chosenStart.yaw)).multiplyScalar(12));
  return {position,target};
 }
 const b=modelBounds,sz=b.getSize(new THREE.Vector3());
 // Correct market entry corner: on the minimap this is the BOTTOM-RIGHT
 // (max X, min Z), where the signed brick corner is on the LEFT and the
 // long white-arched façade recedes to the RIGHT in the user's reference.
 const position=new THREE.Vector3(b.max.x+Math.max(5,sz.x*.075),b.min.y,b.min.z-Math.max(7,sz.z*.12));
 const target=new THREE.Vector3(b.max.x-sz.x*.54,b.min.y+EYE,b.min.z+sz.z*.23);
 return {position,target};
}
function entranceYaw(){
 if(chosenStart&&validStart(chosenStart))return chosenStart.yaw;
 const {position,target}=entranceSpawn();
 const direction=target.sub(position);
 return Math.atan2(-direction.x,-direction.z);
}
function makeCamera(mode){
 const box=modelBounds,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const r=Math.max(25,size.x,size.z),h=Math.max(9,size.y);
 camera.up.set(0,1,0);camera.fov=56;camera.updateProjectionMatrix();
 if(mode==='orbit'){
   camera.position.set(center.x+r*.86,Math.max(h*1.8,r*.65),center.z+r*.99);
   orbit.target.set(center.x,h*.4,center.z);orbit.enableRotate=true;orbit.enableZoom=true;orbit.enabled=true;orbit.update();
   modeLabel.textContent='PERSPECTIVE / ORBIT';
 }else if(mode==='plan'){
   camera.position.set(center.x,Math.max(90,r*1.65),center.z+.01);camera.up.set(0,0,-1);camera.lookAt(center.x,0,center.z);orbit.target.set(center.x,0,center.z);orbit.enableRotate=false;orbit.enabled=true;orbit.update();modeLabel.textContent='ARCHITECTURAL / PLAN';
 }else{
   const start=entranceSpawn();
   camera.position.set(mode==='sky'?center.x+r*.8:start.position.x,mode==='sky'?Math.max(h+12,r*.7):start.position.y+EYE,mode==='sky'?center.z+r*.85:start.position.z);
   const target=mode==='sky'?new THREE.Vector3(center.x,Math.max(3,h*.4),center.z):start.target;
   const dir=target.sub(camera.position).normalize();
   yaw=Math.atan2(-dir.x,-dir.z);pitch=mode==='sky'?Math.asin(THREE.MathUtils.clamp(dir.y,-1,1)):0;
   camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);orbit.enabled=false;
   modeLabel.textContent=mode==='sky'?'AERIAL / FREE FLIGHT':'HUMAN SCALE / GROUNDED WALK';
   if(mode==='walk'){
     fallSpeed=0;desktopWalkState.velocity=0;
     const floor=collisionReady?floorAt(camera.position.x,camera.position.z,camera.position.y-EYE,STEP,8):null;
     if(floor!==null)camera.position.y=floor+EYE;
     status('Walk: WASD across real floors/ramps · Shift faster · click to look · Esc release');
   }else status('Sky: WASD fly · Space/E up · C/Q down · Shift faster · click to look');
 }
}
function setMode(next){
 keys.clear();currentMode=next;
 document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('selected',b.dataset.mode===next));
 if(document.pointerLockElement===renderer.domElement)document.exitPointerLock?.();
 makeCamera(next);
 setStartButtons();
}
document.querySelectorAll('.mode-tab').forEach(btn=>btn.addEventListener('click',async()=>{
 const next=btn.dataset.mode;
 if(next==='walk'){
   if(!modelLoaded){notice('Load the market model first.');return}
   if(!await buildWalkPhysics()){notice('Could not prepare walk collisions. You can still use Sky Mode.');return}
 }
 setMode(next);
}));
window.poornaViewer={THREE,scene,camera,renderer,orbit,rig,sun,opposite,ambient,ground,getBounds:()=>modelBounds.clone(),getModel:()=>model,isLoaded:()=>modelLoaded,getMode:()=>currentMode,setMode,status,notice};
function resize(){const w=Math.max(1,mount.clientWidth),h=Math.max(1,mount.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
const ro=new ResizeObserver(resize);ro.observe(mount);resize();makeCamera('orbit');
const io=new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??true},{threshold:.005});io.observe(mount);

/* Collision queries use the actual market triangles. The BVH makes floor
   raycasts practical without loading a simplified replacement model. */
async function buildWalkPhysics(){
 if(collisionReady)return true;
 if(collisionPromise)return collisionPromise;
 collisionPromise=(async()=>{
  status('Preparing floors, stairs and ramps for Walk Mode…');
  try{
   const {computeBoundsTree,disposeBoundsTree,acceleratedRaycast}=await import('three-mesh-bvh');
   THREE.BufferGeometry.prototype.computeBoundsTree=computeBoundsTree;
   THREE.BufferGeometry.prototype.disposeBoundsTree=disposeBoundsTree;
   THREE.Mesh.prototype.raycast=acceleratedRaycast;
   const meshes=[];model.updateMatrixWorld(true);
   model.traverse(o=>{if(o.isMesh&&o.geometry?.getAttribute('position'))meshes.push(o)});
   collisionMeshes=[];
   for(let i=0;i<meshes.length;i++){
     const geometry=meshes[i].geometry;
     if(!geometry.boundsTree)geometry.computeBoundsTree({maxLeafSize:20});
     // Use a collision-only double-sided copy of the mesh transform.
     // SketchUp GLB ramp/slab faces may face downward or be back-face culled.
     const collider=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
     collider.matrixAutoUpdate=false;
     collider.matrix.copy(meshes[i].matrixWorld);
     collider.matrixWorld.copy(meshes[i].matrixWorld);
     // Bounds cached once for broad-phase capsule collision culling.
     geometry.computeBoundingBox();
     collider.userData.collisionWorldBox=geometry.boundingBox.clone().applyMatrix4(collider.matrixWorld);
     collisionMeshes.push(collider);
     if(i%3===0){status('Indexing building surfaces '+(i+1)+' / '+meshes.length);await new Promise(resolve=>setTimeout(resolve,0))}
   }
   collisionReady=true;collisionFailure='';status('Real floor collisions ready.');return true;
  }catch(e){console.error('Collision geometry failed',e);collisionFailure=String(e?.message||e);collisionMeshes.forEach(mesh=>mesh.material?.dispose?.());collisionMeshes=[];status('Walk collisions failed: '+collisionFailure);return false}
 })();
 const ok=await collisionPromise;if(!ok)collisionPromise=null;return ok;
}
function floorAt(x,z,foot,step=STEP,drop=2.6){
 if(!collisionReady)return null;
 downRay.set(new THREE.Vector3(x,foot+step+.08,z),DOWN);
 downRay.near=0;downRay.far=step+drop+.08;downRay.firstHitOnly=false;
 for(const hit of downRay.intersectObjects(collisionMeshes,false)){
   if(!hit.face)continue;
   NORMAL.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
   if(Math.abs(NORMAL.y)>=SLOPE)return hit.point.y;
 }
 // Exterior ground exists in the display scene at -0.08m.
 if(foot>=-2.5&&foot<=3&&x>=modelBounds.min.x-12&&x<=modelBounds.max.x+12&&z>=modelBounds.min.z-12&&z<=modelBounds.max.z+12)return -.08;
 return null;
}
// Both desktop Walk and Quest VR call ONE surface-following controller.
// x/z represent the player's horizontal body center; feet is the ground
// contact height (not the headset's eye height).
const walkRayDir=new THREE.Vector3(),walkNormal=new THREE.Vector3(),walkSide=new THREE.Vector3();
const walkWallRay=new THREE.Raycaster();
function wallAheadAt(x,z,feet,dx,dz){
 const distance=Math.hypot(dx,dz);
 if(distance<.00001||!collisionReady)return false;
 walkRayDir.set(dx/distance,0,dz/distance);
 walkSide.set(-walkRayDir.z,0,walkRayDir.x);
 // Body-width samples at ankle, knee, torso and shoulder height.
 for(const side of [-RADIUS,0,RADIUS]){
  for(const height of [.25,.65,1.12,1.52]){
   walkWallRay.set(new THREE.Vector3(x+walkSide.x*side,feet+height,z+walkSide.z*side),walkRayDir);
   walkWallRay.near=0;walkWallRay.far=distance+RADIUS*.6;walkWallRay.firstHitOnly=false;
   for(const hit of walkWallRay.intersectObjects(collisionMeshes,false)){
    if(!hit.face)continue;
    walkNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    if(Math.abs(walkNormal.y)<.52)return true;
   }
  }
 }
 return false;
}
function groundedStep(x,z,feet,dx,dz,dt,state){
 if(!collisionReady)return {x,z,feet};
 let candidateX=x+dx,candidateZ=z+dz;
 if(wallAheadAt(x,z,feet,dx,dz)){
  candidateX=wallAheadAt(x,z,feet,dx,0)?x:x+dx;
  candidateZ=wallAheadAt(candidateX,z,feet,0,dz)?z:z+dz;
 }
 // Identical geometry query and step rules for desktop and VR.
 let floor=floorAt(candidateX,candidateZ,feet,STEP,2.2);
 if(floor!==null&&floor>feet+STEP+.02){
  candidateX=x;candidateZ=z;
  floor=floorAt(x,z,feet,STEP,2.2);
 }
 let nextFeet=feet;
 if(floor!==null&&floor>=feet-.75){
  nextFeet=floor;state.velocity=0;
 }else{
  state.velocity=Math.min(23,state.velocity+17*dt);
  const falling=feet-state.velocity*dt;
  const landing=floorAt(candidateX,candidateZ,falling,STEP,1.5);
  if(landing!==null&&falling<=landing){nextFeet=landing;state.velocity=0}
  else nextFeet=falling;
 }
 const bounds=modelBounds.clone().expandByScalar(12);
 candidateX=THREE.MathUtils.clamp(candidateX,bounds.min.x,bounds.max.x);
 candidateZ=THREE.MathUtils.clamp(candidateZ,bounds.min.z,bounds.max.z);
 if(nextFeet<modelBounds.min.y-2){nextFeet=modelBounds.min.y;state.velocity=0}
 return {x:candidateX,z:candidateZ,feet:nextFeet};
}
const desktopWalkState={velocity:0},vrWalkState={velocity:0};
function moveWalk(dx,dz,dt){
 const result=groundedStep(camera.position.x,camera.position.z,camera.position.y-EYE,dx,dz,dt,desktopWalkState);
 camera.position.set(result.x,result.feet+EYE,result.z);
}

const clock=new THREE.Clock();
renderer.setAnimationLoop((time,xrFrame)=>{
 const delta=Math.min(clock.getDelta(),.05);
 if(!visible&&!renderer.xr.isPresenting)return;
 if(!renderer.xr.isPresenting){
   if(currentMode==='sky'||currentMode==='walk'){
     const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(-forward.z,0,forward.x);
     let dx=0,dz=0;
     if(keys.has('KeyW')||keys.has('ArrowUp')){dx+=forward.x;dz+=forward.z}
     if(keys.has('KeyS')||keys.has('ArrowDown')){dx-=forward.x;dz-=forward.z}
     if(keys.has('KeyD')||keys.has('ArrowRight')){dx+=right.x;dz+=right.z}
     if(keys.has('KeyA')||keys.has('ArrowLeft')){dx-=right.x;dz-=right.z}
     const len=Math.hypot(dx,dz);if(len){dx/=len;dz/=len}
     const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?9:3.4)*delta;
     if(currentMode==='walk'&&collisionReady)moveWalk(dx*speed,dz*speed,delta);
     else if(currentMode==='sky'){
       camera.position.x+=dx*speed;camera.position.z+=dz*speed;
       if(keys.has('Space')||keys.has('KeyE')||keys.has('KeyR'))camera.position.y+=speed;
       if(keys.has('KeyC')||keys.has('KeyQ')||keys.has('KeyF'))camera.position.y-=speed;
       const bounds=modelBounds.clone().expandByScalar(25);
       camera.position.x=THREE.MathUtils.clamp(camera.position.x,bounds.min.x,bounds.max.x);
       camera.position.z=THREE.MathUtils.clamp(camera.position.z,bounds.min.z,bounds.max.z);
       camera.position.y=THREE.MathUtils.clamp(camera.position.y,modelBounds.min.y+EYE,modelBounds.max.y+60);
     }
   }else orbit.update();
 }
 if(renderer.xr.isPresenting){try{updateXRLocomotion(delta,xrFrame)}catch(error){if(!vrReport.error||vrReport.frames%120===0)recordXRFailure(error)}}
 window.poornaExhibition?.tick(delta);
 window.poornaNavigation?.tick(delta);
 if(!window.poornaNavigation?.renderStereo?.())renderer.render(scene,camera);
});
mount.addEventListener('click',()=>{if((currentMode==='walk'||currentMode==='sky')&&!renderer.xr.isPresenting&&document.pointerLockElement!==renderer.domElement){renderer.domElement.requestPointerLock?.().catch(()=>{})}});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement||!['walk','sky'].includes(currentMode))return;yaw-=e.movementX*.0021;pitch=Math.max(-1.42,Math.min(1.42,pitch-e.movementY*.0021));camera.rotation.set(pitch,yaw,0)});
window.addEventListener('keydown',e=>{if(e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;keys.add(e.code);if((currentMode==='walk'||currentMode==='sky')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault()});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
const loader=new GLTFLoader();
function load(file){
 if(isLoading)return;
 isLoading=true;tag.textContent='LOADING GEOMETRY';status('Downloading and preparing market model…');
 const splash=$('viewerSplash'),progress=$('loadProgress'),bar=$('loadProgressBar'),progText=$('loadProgressText');
 splash.hidden=false;progress.hidden=false;$('loadModelBtn').disabled=true;$('loadModelBtn').textContent='Preparing 3D experience…';
 const isBlob=file instanceof File;const url=isBlob?URL.createObjectURL(file):file;
 loader.load(url,gltf=>{
  if(model){scene.remove(model);model.traverse(obj=>{if(obj.isMesh){obj.geometry?.disposeBoundsTree?.();obj.geometry?.dispose?.()}})}
   collisionMeshes.forEach(mesh=>mesh.material?.dispose?.());collisionMeshes=[];collisionReady=false;collisionPromise=null;collisionFailure='';fallSpeed=0;
  model=gltf.scene;
  let meshCount=0;model.traverse(obj=>{if(obj.isMesh){meshCount++;obj.castShadow=false;obj.receiveShadow=false;obj.frustumCulled=true}});
  // Source model is pre-batched, positioned at ground level, and measured in meters.
  modelBounds=new THREE.Box3().setFromObject(model);
  if(modelBounds.isEmpty()||!Number.isFinite(modelBounds.min.x))throw new Error('Invalid model bounds');
  const modelSize=modelBounds.getSize(new THREE.Vector3());
  if(modelSize.x>2000||modelSize.z>2000){const scale=95/Math.max(modelSize.x,modelSize.z);model.scale.setScalar(scale);modelBounds.setFromObject(model)}
  scene.add(model);
  modelLoaded=true;isLoading=false;tag.textContent='ACTUAL MARKET MODEL LOADED';splash.hidden=true;progress.hidden=true;grid.visible=false;ground.visible=true;
  setMode('orbit');writeStartToUI();buildWalkPhysics().catch(error=>console.error('Preparing VR walking surfaces',error));window.poornaExhibition?.modelReady();window.poornaNavigation?.modelReady();status(`Loaded successfully · ${meshCount} draw groups · Orbit / Sky / Walk / Plan / VR available`);
  if(isBlob)URL.revokeObjectURL(url);
 },evt=>{if(evt.lengthComputable){const pct=Math.min(98,Math.round(evt.loaded/evt.total*100));bar.style.width=pct+'%';progText.textContent=`Downloading 3D architecture · ${pct}%`;
 }else{progText.textContent=`Downloading model · ${(evt.loaded/1024/1024).toFixed(0)} MB received`}
 },err=>{console.error('Model loading failed',err);tag.textContent='MODEL UNAVAILABLE';isLoading=false;progress.hidden=true;$('loadModelBtn').disabled=false;$('loadModelBtn').textContent='Retry loading the market model';status('Could not load the 3D model. Try refreshing or uploading a GLB from your computer.');notice('Model loading failed. Check your connection or try a local GLB.');if(isBlob)URL.revokeObjectURL(url)});
}
$('loadModelBtn').addEventListener('click',()=>load('/models/svp-market-optimized.glb'));
$('fileButton').addEventListener('click',()=>$('modelFile').click());
$('modelFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!file.name.toLowerCase().endsWith('.glb')){notice('Please choose a .glb file.');return}
 if(file.size>180*1024*1024&&!window.confirm('This model exceeds 180 MB. Large unoptimized GLBs may freeze your browser. Try loading anyway?'))return;
 load(file);e.target.value=''});
$('resetViewBtn').addEventListener('click',()=>setMode(currentMode));
$('helpBtn').addEventListener('click',()=>$('viewerHelp').hidden=!$('viewerHelp').hidden);
$('closeHelpBtn').addEventListener('click',()=>$('viewerHelp').hidden=true);
$('fullscreenBtn').addEventListener('click',async()=>{const shell=$('viewerShell');if(document.fullscreenElement){await document.exitFullscreen?.();shell.classList.remove('is-fullscreen')}else{if(shell.requestFullscreen){try{await shell.requestFullscreen()}catch{shell.classList.add('is-fullscreen')}}else shell.classList.add('is-fullscreen')}resize()});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)$('viewerShell').classList.remove('is-fullscreen');resize()});

// Quest 3: left thumbstick is relative to headset yaw; right thumbstick
// turns continuously while held. Ground movement is shared with desktop Walk.
// Quest diagnostics on the controller: shows whether physics is actually active,
// the ground ray's reading, and the tracked player floor elevation.

// A persistent Quest diagnostics log survives exiting VR or reloading the page.
// This avoids dependence on a floating WebXR HUD, which may be hard to see.
const vrReportEl=$('vrReport'),vrReportText=$('vrReportText');
let vrReport={state:'Not tested',indexedMeshes:0,floorRayHits:0,groundY:null,playerY:null,
 position:null,frames:0,error:'',updatedAt:''};
function publishVRReport(){
 if(!vrReportEl||!vrReportText)return;
 const report=vrReport;
 vrReportText.textContent=[
  'Physics: '+report.state,
  'Indexed meshes: '+report.indexedMeshes,
  'Floor ray hits: '+report.floorRayHits,
  'Ground Y: '+(report.groundY===null?'NONE':report.groundY.toFixed(2)),
  'Player Y: '+(report.playerY===null?'NONE':report.playerY.toFixed(2)),
  'Position X/Z: '+(report.position?report.position.map(n=>n.toFixed(2)).join(' / '):'NONE'),
  'Rig X/Z: '+(report.rigPosition?report.rigPosition.map(n=>n.toFixed(2)).join(' / '):'NONE'),
  'Left stick X/Y: '+(report.leftStick?report.leftStick.map(n=>n.toFixed(2)).join(' / '):'NONE'),
  'Updated frames: '+report.frames,
  report.error?'Error: '+report.error:'Error: none'
 ].join('\n');
 vrReportEl.hidden=false;
 try{localStorage.setItem('poorna-quest-diagnostics',JSON.stringify(report))}catch(e){}
}
try{
 const previous=JSON.parse(localStorage.getItem('poorna-quest-diagnostics')||'null');
 if(previous&&typeof previous==='object'){vrReport={...vrReport,...previous};publishVRReport()}
}catch(e){}
$('vrReportCopy')?.addEventListener('click',()=>{
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(vrReportText.textContent).then(()=>status('VR diagnostics copied')).catch(()=>{});
 else {const range=document.createRange();range.selectNodeContents(vrReportText);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)}
});
function recordXRFailure(error){
 vrReport.error=String(error?.stack||error?.message||error).slice(0,600);
 vrReport.state=collisionReady?'PHYSICS READY (runtime error)':'PHYSICS NOT READY (runtime error)';
 vrReport.indexedMeshes=collisionMeshes.length;
 vrReport.updatedAt=new Date().toISOString();
 publishVRReport();
 console.error('Quest locomotion diagnostics',error);
}

const xrInfoCanvas=document.createElement('canvas');xrInfoCanvas.width=512;xrInfoCanvas.height=256;
const xrInfoCtx=xrInfoCanvas.getContext('2d'),xrInfoTexture=new THREE.CanvasTexture(xrInfoCanvas);
xrInfoTexture.colorSpace=THREE.SRGBColorSpace;
// A head-locked diagnostic HUD is more reliable than a controller overlay:
 // walls cannot overwrite it, even when the player is inside dense geometry.
const xrInfoMat=new THREE.MeshBasicMaterial({map:xrInfoTexture,side:THREE.DoubleSide,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
const xrInfoPanel=new THREE.Mesh(new THREE.PlaneGeometry(.36,.18),xrInfoMat);
xrInfoPanel.renderOrder=10000;
xrInfoPanel.frustumCulled=false;
xrInfoPanel.visible=false;
scene.add(xrInfoPanel);
const xrHudOffset=new THREE.Vector3(-.25,-.19,-.82),xrHudPosition=new THREE.Vector3(),xrHudRotation=new THREE.Quaternion();
function positionXRDiagnosticHUD(){
 if(!renderer.xr.isPresenting||!xrInfoPanel.visible)return;
 rig.updateWorldMatrix(true,false);
 xrHudPosition.copy(xrTrackedLocal).applyMatrix4(rig.matrixWorld);
 rig.getWorldQuaternion(xrHudRotation).multiply(xrTrackedOrientation);
 xrInfoPanel.position.copy(xrHudOffset).applyQuaternion(xrHudRotation).add(xrHudPosition);
 xrInfoPanel.quaternion.copy(xrHudRotation);
}
let xrInfoTimer=0,xrLastGroundHit=null;
function updateXRDiagnostics(dt,x,z,feet){
 if(!renderer.xr.isPresenting)return;
 positionXRDiagnosticHUD();
 xrInfoTimer+=dt;if(xrInfoTimer<.35)return;xrInfoTimer=0;
 let hitCount=0,hitY=null;
 if(collisionReady){
  downRay.set(new THREE.Vector3(x,feet+1.3,z),DOWN);
  downRay.near=0;downRay.far=3.2;downRay.firstHitOnly=false;
  const hits=downRay.intersectObjects(collisionMeshes,false);
  hitCount=hits.length;
  for(const hit of hits){
   if(!hit.face)continue;
   NORMAL.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
   if(Math.abs(NORMAL.y)>=SLOPE){hitY=hit.point.y;break}
  }
 }
 xrLastGroundHit=hitY;
 vrReport={state:collisionReady?'PHYSICS READY':'PHYSICS NOT READY',indexedMeshes:collisionMeshes.length,floorRayHits:hitCount,groundY:hitY,playerY:feet,position:[x,z],rigPosition:[rig.position.x,rig.position.z],leftStick:vrReport.leftStick,frames:vrReport.frames+1,error:collisionFailure||vrReport.error,updatedAt:new Date().toISOString()};
 publishVRReport();
 xrInfoCtx.fillStyle='#14251b';xrInfoCtx.fillRect(0,0,512,256);
 xrInfoCtx.fillStyle=collisionReady?'#9ee0af':'#f8bd8e';
 xrInfoCtx.font='bold 29px Arial';xrInfoCtx.fillText(collisionReady?'PHYSICS READY':'PHYSICS NOT READY',20,42);
 xrInfoCtx.fillStyle='#ffffff';xrInfoCtx.font='24px Arial';
 xrInfoCtx.fillText('Indexed meshes: '+collisionMeshes.length,20,84);
 xrInfoCtx.fillText('Floor ray hits: '+hitCount,20,123);
 xrInfoCtx.fillText('Ground Y: '+(hitY===null?'NONE':hitY.toFixed(2)),20,162);
 xrInfoCtx.fillText('Player Y: '+feet.toFixed(2),20,201);
 if(collisionFailure){xrInfoCtx.fillStyle='#f9ba8b';xrInfoCtx.font='17px Arial';xrInfoCtx.fillText(collisionFailure.slice(0,57),20,234)}
 else{xrInfoCtx.fillStyle='#d0c29d';xrInfoCtx.font='17px Arial';xrInfoCtx.fillText('HEADSET HUD / COLLISION DIAGNOSTIC',20,234)}
 xrInfoTexture.needsUpdate=true;
}
const xrFw=new THREE.Vector3(),xrRt=new THREE.Vector3(),xrQ=new THREE.Quaternion();
const xrHeadA=new THREE.Vector3(),xrHeadB=new THREE.Vector3(),xrUp=new THREE.Vector3(0,1,0);
const xrWallNormal=new THREE.Vector3();
let xrTurnVelocity=0;
const XR_TURN_RATE=THREE.MathUtils.degToRad(75),XR_TURN_RESPONSE=11;
// WebXR pose is measured in the session's local-floor reference space.
// Apply the rig transform explicitly. XR stereo subcameras can report
// reference-space coordinates if their world matrices have not updated yet.
const xrTrackedLocal=new THREE.Vector3(),xrTrackedWorld=new THREE.Vector3();
const xrTrackedOrientation=new THREE.Quaternion(),xrRigOrientation=new THREE.Quaternion();
let xrPoseMissing=0,xrSpawnPending=false;
function getTrackedHeadPose(frame){
 const space=renderer.xr.getReferenceSpace();
 const pose=frame&&space?frame.getViewerPose(space):null;
 if(!pose)return null;
 const t=pose.transform,p=t.position,o=t.orientation;
 xrTrackedLocal.set(p.x,p.y,p.z);
 xrTrackedOrientation.set(o.x,o.y,o.z,o.w);
 rig.updateWorldMatrix(true,false);
 xrTrackedWorld.copy(xrTrackedLocal).applyMatrix4(rig.matrixWorld);
 rig.getWorldQuaternion(xrRigOrientation);
 xrQ.copy(xrRigOrientation).multiply(xrTrackedOrientation);
 return xrTrackedWorld;
}
function getXRStick(source){
 const a=source?.gamepad?.axes||[];
 const x=a.length>=4?(a[2]||0):(a[0]||0),y=a.length>=4?(a[3]||0):(a[1]||0);
 return {x:Math.abs(x)>.16?x:0,y:Math.abs(y)>.16?y:0};
}
function xrGroundFollow(head,dx,dz,dt){
 if(!collisionReady)return;
 // Quest local-floor reference space tracks the real physical head position,
 // while rig.position.y is the virtual floor. Do NOT use camera.position.y,
 // which is desktop-only while XR is presenting.
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.095));
 let x=head.x,z=head.z,feet=rig.position.y;
 for(let i=0;i<steps;i++){
  const result=groundedStep(x,z,feet,dx/steps,dz/steps,dt/steps,vrWalkState);
  rig.position.x+=result.x-x;
  rig.position.z+=result.z-z;
  rig.position.y+=result.feet-feet;
  x=result.x;z=result.z;feet=result.feet;
 }
}
function xrSmoothTurn(head,angle,xrFrame){
 if(Math.abs(angle)<.000001)return;
 const before=getTrackedHeadPose(xrFrame);
 if(!before)return;
 xrHeadA.copy(before);
 rig.rotation.y+=angle;
 const after=getTrackedHeadPose(xrFrame);
 if(!after)return;
 rig.position.x+=xrHeadA.x-after.x;
 rig.position.z+=xrHeadA.z-after.z;
}
function updateXRLocomotion(dt,xrFrame){
 if(!renderer.xr.isPresenting)return;
 const sources=renderer.xr.getSession()?.inputSources||[];
 let left=null,right=null;
 for(const src of sources){
  if(src.handedness==='left')left=src;
  else if(src.handedness==='right')right=src;
 }
 const walk=getXRStick(left),turn=getXRStick(right);
 vrReport.leftStick=[walk.x,walk.y];
 const trackedHead=getTrackedHeadPose(xrFrame);
 if(!trackedHead){
  xrPoseMissing++;
  if(xrPoseMissing===90)recordXRFailure('WebXR viewer pose unavailable for 90 frames');
  return;
 }
 xrPoseMissing=0;
 // Place the *tracked headset* at the common entrance position and rotate
 // its initial facing direction toward the long façade. Run once after
 // WebXR has delivered a valid local-floor pose.
 if(xrSpawnPending){
  xrSpawnPending=false;
  const spawn=entranceSpawn();
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(xrQ);
  const currentYaw=Math.atan2(-forward.x,-forward.z);
  rig.rotation.y+=entranceYaw()-currentYaw;
  const adjusted=getTrackedHeadPose(xrFrame);
  if(adjusted){
   rig.position.x+=spawn.position.x-adjusted.x;
   rig.position.z+=spawn.position.z-adjusted.z;
   const groundHeight=collisionReady?floorAt(spawn.position.x,spawn.position.z,spawn.position.y,Math.max(STEP,1.1),2.0):null;
   rig.position.y=groundHeight??spawn.position.y;
   vrWalkState.velocity=0;
  }
  getTrackedHeadPose(xrFrame);
 }
 xrFw.set(0,0,-1).applyQuaternion(xrQ).setY(0).normalize();
 if(xrFw.lengthSq()<.00001)xrFw.set(0,0,-1);
 xrRt.crossVectors(xrFw,xrUp).normalize();
 const magnitude=Math.min(1,Math.hypot(walk.x,walk.y));
 const previousX=trackedHead.x,previousZ=trackedHead.z;
 let dx=0,dz=0;
 if(magnitude>.16){
  const adjusted=(magnitude-.16)/.84;
  const dist=2.6*dt*adjusted/magnitude;
  dx=(xrFw.x*(-walk.y)+xrRt.x*walk.x)*dist;
  dz=(xrFw.z*(-walk.y)+xrRt.z*walk.x)*dist;
 }
 if(collisionReady)xrGroundFollow(trackedHead,dx,dz,dt);
 // Diagnostics use the tracked world position *after* the rig moved.
 const newHead=getTrackedHeadPose(xrFrame);
 updateXRDiagnostics(dt,newHead?.x??previousX,newHead?.z??previousZ,rig.position.y);
 const analog=Math.abs(turn.x)<.16?0:Math.sign(turn.x)*(Math.abs(turn.x)-.16)/.84;
 xrTurnVelocity=THREE.MathUtils.damp(xrTurnVelocity,-analog*XR_TURN_RATE,XR_TURN_RESPONSE,dt);
 if(Math.abs(xrTurnVelocity)>.001)xrSmoothTurn(null,xrTurnVelocity*dt,xrFrame);
}
// Immersive-VR entry and controller teleportation; available only on supported secure origins.
const hiddenVR=VRButton.createButton(renderer,{optionalFeatures:['local-floor','bounded-floor','hand-tracking']});
hiddenVR.style.display='none';hiddenVR.setAttribute('aria-hidden','true');document.body.appendChild(hiddenVR);
const raycaster=new THREE.Raycaster(),rot=new THREE.Matrix4();
const teleportSurface=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
teleportSurface.rotation.x=-Math.PI/2;teleportSurface.position.y=.03;scene.add(teleportSurface);
function moveToController(controller){
 if(!collisionReady){status('Preparing floor collisions for safe VR teleportation…');return}
 controller.updateMatrixWorld(true);
 rot.identity().extractRotation(controller.matrixWorld);
 raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
 raycaster.ray.direction.set(0,0,-1).applyMatrix4(rot);
 raycaster.near=0;raycaster.far=80;raycaster.firstHitOnly=false;
 // Prefer real walkable architecture (ramps, landings and elevated levels).
 // Do not teleport to a vertical wall or below a surface.
 const hits=raycaster.intersectObjects(collisionMeshes,false);
 let target=null;
 for(const hit of hits){
   if(!hit.face)continue;
   xrWallNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
   if(Math.abs(xrWallNormal.y)>=SLOPE){target=hit.point;break}
 }
 if(!target){
   const groundHits=raycaster.intersectObject(teleportSurface);
   if(groundHits.length)target=groundHits[0].point;
 }
 if(!target)return;
 // Teleport uses the same Quest tracking coordinate system as joystick walking.
 rig.updateWorldMatrix(true,false);
 xrHeadA.copy(xrTrackedLocal).applyMatrix4(rig.matrixWorld);
 rig.position.x+=target.x-xrHeadA.x;
 rig.position.z+=target.z-xrHeadA.z;
 const floor=floorAt(target.x,target.z,target.y,STEP,1.8);
 rig.position.y=floor??target.y;
 vrWalkState.velocity=0;
}
for(let i=0;i<2;i++){
 const controller=renderer.xr.getController(i);rig.add(controller);
 // Diagnostic HUD is attached to the scene and follows the headset.
 const ray=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:0xdac28e}));ray.scale.z=8;controller.add(ray);
 controller.addEventListener('selectstart',()=>{if(renderer.xr.isPresenting)moveToController(controller)})
}
renderer.xr.addEventListener('sessionstart',()=>{vrReport={state:'Starting VR',indexedMeshes:collisionMeshes.length,floorRayHits:0,groundY:null,playerY:null,position:null,frames:0,error:'',updatedAt:new Date().toISOString()};publishVRReport();xrInfoPanel.visible=true;xrTurnVelocity=0;vrWalkState.velocity=0;xrPoseMissing=0;xrSpawnPending=true;rig.rotation.y=0;buildWalkPhysics().then(ok=>{if(ok&&renderer.xr.isPresenting)status('Quest 3 capsule collision ready: walk on ramps & floors; hold right stick to turn');});window.poornaNavigation?.vrStart();window.poornaExhibition?.stop();rig.position.copy(entranceSpawn().position);status('Quest 3: left joystick walks · right joystick smooth turning · trigger teleports.');tag.textContent='IMMERSIVE VR ACTIVE'});
renderer.xr.addEventListener('sessionend',()=>{vrReport.state=vrReport.frames?'VR ended — last readings':'VR ended — no diagnostic samples';publishVRReport();xrInfoPanel.visible=false;window.poornaNavigation?.vrEnd();rig.position.set(0,0,0);tag.textContent=modelLoaded?'ACTUAL MARKET MODEL LOADED':'MODEL READY TO LOAD';setMode('orbit');status('Exited immersive VR mode')});
$('vrEnterBtn').addEventListener('click',async()=>{
 if(!modelLoaded){notice('Load the actual market model before entering VR.');return}
 if(!window.isSecureContext){notice('Immersive VR requires HTTPS. Deploy the site to a secure URL.');return}
 if(!navigator.xr){notice('WebXR is unavailable in this browser. Open the site in a compatible VR headset browser.');return}
 try{const supported=await navigator.xr.isSessionSupported('immersive-vr');if(!supported){notice('Immersive VR is not supported on this device or browser. Desktop walkthrough still works.');return}hiddenVR.click()}
 catch(error){console.error(error);notice('Could not start the VR session. Check headset browser permissions.')}
});
window.addEventListener('beforeunload',()=>{renderer.setAnimationLoop(null);renderer.dispose();ro.disconnect();io.disconnect()});
