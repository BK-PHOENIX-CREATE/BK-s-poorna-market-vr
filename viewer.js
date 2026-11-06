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
let collisionMeshes=[],collisionReady=false,collisionPromise=null,fallSpeed=0;
const downRay=new THREE.Raycaster(),wallRay=new THREE.Raycaster(),DOWN=new THREE.Vector3(0,-1,0),NORMAL=new THREE.Vector3();
const keys=new Set();let yaw=0,pitch=0;
const text=$('viewerStatus'),tag=$('modelState'),modeLabel=$('viewModeName');
function status(s){text.textContent=s}
function notice(s){(window.marketToast||console.warn)(s)}
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
   camera.position.set(mode==='sky'?center.x+r*.8:center.x,mode==='sky'?Math.max(h+12,r*.7):EYE,mode==='sky'?center.z+r*.85:box.max.z+4);
   const target=new THREE.Vector3(center.x,mode==='sky'?Math.max(3,h*.4):EYE,center.z);
   const dir=target.sub(camera.position).normalize();
   yaw=Math.atan2(-dir.x,-dir.z);pitch=mode==='sky'?Math.asin(THREE.MathUtils.clamp(dir.y,-1,1)):0;
   camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);orbit.enabled=false;
   modeLabel.textContent=mode==='sky'?'AERIAL / FREE FLIGHT':'HUMAN SCALE / GROUNDED WALK';
   if(mode==='walk'){
     fallSpeed=0;
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
   collisionReady=true;status('Real floor collisions ready.');return true;
  }catch(e){console.error('Collision geometry failed',e);collisionMeshes=[];status('Walk collisions failed to initialize. Sky Mode is available.');return false}
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
function wallAhead(dx,dz){
 const distance=Math.hypot(dx,dz);if(distance<.00001)return false;
 const direction=new THREE.Vector3(dx/distance,0,dz/distance);
 for(const offset of [-.5,-1.15]){
   wallRay.set(new THREE.Vector3(camera.position.x,camera.position.y+offset,camera.position.z),direction);
   wallRay.near=0;wallRay.far=distance+RADIUS;wallRay.firstHitOnly=false;
   for(const hit of wallRay.intersectObjects(collisionMeshes,false)){
     if(!hit.face)continue;
     NORMAL.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
     if(Math.abs(NORMAL.y)<.5)return true;
   }
 }
 return false;
}
function moveWalk(dx,dz,dt){
 const feet=camera.position.y-EYE;
 let x=camera.position.x+dx,z=camera.position.z+dz;
 if(wallAhead(dx,dz)){x=camera.position.x;z=camera.position.z}
 let floor=floorAt(x,z,feet,STEP,2.2);
 if(floor!==null&&floor>feet+STEP+.02){
   x=camera.position.x;z=camera.position.z;floor=floorAt(x,z,feet,STEP,2.2);
 }
 camera.position.x=x;camera.position.z=z;
 if(floor!==null&&floor>=feet-.75){camera.position.y=floor+EYE;fallSpeed=0}
 else{
   fallSpeed=Math.min(23,fallSpeed+17*dt);
   const nextFeet=feet-fallSpeed*dt;
   const landing=floorAt(x,z,nextFeet,STEP,1.5);
   if(landing!==null&&nextFeet<=landing){camera.position.y=landing+EYE;fallSpeed=0}
   else camera.position.y=nextFeet+EYE;
 }
 const box=modelBounds.clone().expandByScalar(12);
 camera.position.x=THREE.MathUtils.clamp(camera.position.x,box.min.x,box.max.x);
 camera.position.z=THREE.MathUtils.clamp(camera.position.z,box.min.z,box.max.z);
 if(camera.position.y<modelBounds.min.y+EYE-2){camera.position.y=modelBounds.min.y+EYE;fallSpeed=0}
}

const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{
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
 if(renderer.xr.isPresenting)updateXRLocomotion(delta);
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
   collisionMeshes.forEach(mesh=>mesh.material?.dispose?.());collisionMeshes=[];collisionReady=false;collisionPromise=null;fallSpeed=0;
  model=gltf.scene;
  let meshCount=0;model.traverse(obj=>{if(obj.isMesh){meshCount++;obj.castShadow=false;obj.receiveShadow=false;obj.frustumCulled=true}});
  // Source model is pre-batched, positioned at ground level, and measured in meters.
  modelBounds=new THREE.Box3().setFromObject(model);
  if(modelBounds.isEmpty()||!Number.isFinite(modelBounds.min.x))throw new Error('Invalid model bounds');
  const modelSize=modelBounds.getSize(new THREE.Vector3());
  if(modelSize.x>2000||modelSize.z>2000){const scale=95/Math.max(modelSize.x,modelSize.z);model.scale.setScalar(scale);modelBounds.setFromObject(model)}
  scene.add(model);
  modelLoaded=true;isLoading=false;tag.textContent='ACTUAL MARKET MODEL LOADED';splash.hidden=true;progress.hidden=true;grid.visible=false;ground.visible=true;
  setMode('orbit');buildWalkPhysics().catch(error=>console.error('Preparing VR walking surfaces',error));window.poornaExhibition?.modelReady();window.poornaNavigation?.modelReady();status(`Loaded successfully · ${meshCount} draw groups · Orbit / Sky / Walk / Plan / VR available`);
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

// Meta Quest 3 joystick locomotion: Touch left stick walks, right stick snap-turns.
// Meta Quest 3: headset-relative directional walking on the GLB's REAL geometry.
// Left stick: forward/back/strafe relative to the headset yaw, regardless of
// where the physical controller points. Right stick: smooth 12-degree steps.
const xrFw=new THREE.Vector3(),xrRt=new THREE.Vector3(),xrQ=new THREE.Quaternion();
const xrHeadA=new THREE.Vector3(),xrHeadB=new THREE.Vector3(),xrUp=new THREE.Vector3(0,1,0);
const xrCast=new THREE.Raycaster(),xrWallNormal=new THREE.Vector3(),xrTravel=new THREE.Vector3();
let xrTurnVelocity=0,xrFallVelocity=0;
const XR_TURN_RATE=THREE.MathUtils.degToRad(75),XR_TURN_RESPONSE=11;
function getXRStick(source){
 const a=source?.gamepad?.axes||[];
 // Quest Touch Plus commonly maps sticks to axes 2,3; compatible fallbacks use 0,1.
 const x=a.length>=4?(a[2]||0):(a[0]||0),y=a.length>=4?(a[3]||0):(a[1]||0);
 return {x:Math.abs(x)>.16?x:0,y:Math.abs(y)>.16?y:0};
}
// Capsule collisions (three-mesh-bvh shapecast) keep the *whole body*
// outside actual triangles, not just a ray beneath the player's eye.
const XR_RADIUS=.30,XR_SKIN=.012;
const xrLocalInverse=new THREE.Matrix4(),xrLocalSegment=new THREE.Line3();
const xrLocalBox=new THREE.Box3(),xrPointOnTriangle=new THREE.Vector3(),xrPointOnCapsule=new THREE.Vector3();
const xrPush=new THREE.Vector3(),xrLocalNormal=new THREE.Vector3(),xrBefore=new THREE.Vector3();
const xrCandidate=new THREE.Vector3(),xrFootWorld=new THREE.Vector3(),xrBodyScale=new THREE.Vector3();
const xrBodyQuat=new THREE.Quaternion(),xrTmpDelta=new THREE.Vector3();
let xrGrounded=false,xrHeightAdjust=0;
function resolveXRCapsule(x,z,footY,eyeY){
 if(!collisionReady)return {x,z,y:footY,grounded:false};
 let px=x,pz=z,py=footY,grounded=false;
 const bodyHeight=THREE.MathUtils.clamp(eyeY-footY,.95,2.05);
 const capsuleTop=Math.max(.75,bodyHeight-.18);
 // Two iterations resolve intersecting ramps + nearby wall corners.
 for(let pass=0;pass<2;pass++){
  for(const mesh of collisionMeshes){
   const geometry=mesh.geometry,bvh=geometry.boundsTree;
   if(!bvh)continue;
   const worldBox=mesh.userData.collisionWorldBox;
   if(worldBox&&
      (px<worldBox.min.x-XR_RADIUS||px>worldBox.max.x+XR_RADIUS||
       pz<worldBox.min.z-XR_RADIUS||pz>worldBox.max.z+XR_RADIUS||
       py+capsuleTop+XR_RADIUS<worldBox.min.y||
       py>worldBox.max.y+XR_RADIUS))continue;
   xrLocalInverse.copy(mesh.matrixWorld).invert();
   xrBefore.set(px,py+XR_RADIUS,pz);
   xrLocalSegment.start.copy(xrBefore).applyMatrix4(xrLocalInverse);
   xrLocalSegment.end.set(px,py+capsuleTop,pz).applyMatrix4(xrLocalInverse);
   // Mesh scales are usually 1, but account for GLB transforms.
   mesh.matrixWorld.decompose(xrCandidate,xrBodyQuat,xrBodyScale);
   const minScale=Math.max(.0001,Math.min(Math.abs(xrBodyScale.x),Math.abs(xrBodyScale.y),Math.abs(xrBodyScale.z)));
   const localRadius=XR_RADIUS/minScale;
   xrLocalBox.makeEmpty().expandByPoint(xrLocalSegment.start).expandByPoint(xrLocalSegment.end).expandByScalar(localRadius+.04);
   bvh.shapecast({
    intersectsBounds:bounds=>bounds.intersectsBox(xrLocalBox),
    intersectsTriangle:triangle=>{
     const distance=triangle.closestPointToSegment(xrLocalSegment,xrPointOnTriangle,xrPointOnCapsule);
     if(distance>=localRadius) return;
     const depth=localRadius-distance+XR_SKIN/minScale;
     xrPush.subVectors(xrPointOnCapsule,xrPointOnTriangle);
     if(xrPush.lengthSq()<1e-10){
       triangle.getNormal(xrLocalNormal);
       xrPush.copy(xrLocalNormal);
       // A two-sided ramp should push the player upward when ambiguous.
       if(Math.abs(xrPush.y)>.52&&xrPush.y<0)xrPush.negate();
     }
     xrPush.normalize().multiplyScalar(depth);
     xrLocalSegment.start.add(xrPush);
     xrLocalSegment.end.add(xrPush);
     xrLocalBox.translate(xrPush);
    }
   });
   const newStart=xrLocalSegment.start.clone().applyMatrix4(mesh.matrixWorld);
   xrTmpDelta.subVectors(newStart,xrBefore);
   if(xrTmpDelta.y>.005)grounded=true;
   px+=xrTmpDelta.x;pz+=xrTmpDelta.z;py+=xrTmpDelta.y;
  }
 }
 return {x:px,z:pz,y:py,grounded};
}

const xrProbe=new THREE.Raycaster(),xrSampleNormal=new THREE.Vector3();
const xrProbeDir=new THREE.Vector3(),xrFloorSamples=[[0,0],[.22,0],[-.22,0],[0,.22],[0,-.22]];
let xrLastSupport=null;
function xrFindSupport(x,z,feet,maxRise=1.05,maxDrop=1.1){
 if(!collisionReady)return null;
 // A real floor or ramp can start 0.6m above the exterior zero plane.
 // Query 5 samples across the user's body so one missing triangle
 // or narrow face cannot make the headset fall through the surface.
 const candidates=[];
 for(const [ox,oz] of xrFloorSamples){
  xrProbe.set(new THREE.Vector3(x+ox,feet+maxRise+.07,z+oz),DOWN);
  xrProbe.near=0;xrProbe.far=maxRise+maxDrop+.07;xrProbe.firstHitOnly=false;
  for(const hit of xrProbe.intersectObjects(collisionMeshes,false)){
   if(!hit.face)continue;
   xrSampleNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
   if(Math.abs(xrSampleNormal.y)<.47)continue;
   if(hit.point.y>feet+maxRise+.01||hit.point.y<feet-maxDrop-.01)continue;
   candidates.push(hit.point.y);break;
  }
 }
 if(!candidates.length)return null;
 // Prefer the upper walkable surface when a thin ramp/floor overlaps
 // another surface in projection; cap sudden elevation changes below.
 return Math.max(...candidates);
}
function xrBodyBlocked(headX,headZ,feet,eyeHeight,dx,dz){
 if(!collisionReady)return false;
 const distance=Math.hypot(dx,dz);if(distance<.00001)return false;
 xrProbeDir.set(dx/distance,0,dz/distance);
 const offsets=[[-.21,0],[.21,0],[0,-.21],[0,.21],[0,0]];
 const bodyY=[.28,Math.min(.90,eyeHeight-.25),Math.min(1.35,eyeHeight-.12)];
 for(const [ox,oz] of offsets){
  for(const height of bodyY){
   xrProbe.set(new THREE.Vector3(headX+ox,feet+height,headZ+oz),xrProbeDir);
   xrProbe.near=0;xrProbe.far=distance+.055;xrProbe.firstHitOnly=false;
   const hits=xrProbe.intersectObjects(collisionMeshes,false);
   for(const hit of hits){
    if(!hit.face)continue;
    xrSampleNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    // A near-vertical surface is a wall. For inclined geometry, the
    // ground probe decides whether it is a walkable rise or obstruction.
    if(Math.abs(xrSampleNormal.y)<.44)return true;
   }
  }
 }
 return false;
}
function xrGroundFollow(head,dx,dz,dt){
 if(!collisionReady)return;
 const baseFoot=rig.position.y;
 const eyeHeight=THREE.MathUtils.clamp(head.y-baseFoot,1.0,2.1);
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.055));
 let positionX=head.x,positionZ=head.z,feet=baseFoot;
 let supported=false;
 for(let i=0;i<steps;i++){
  const stepX=dx/steps,stepZ=dz/steps;
  let tx=positionX+stepX,tz=positionZ+stepZ;
  if(xrBodyBlocked(positionX,positionZ,feet,eyeHeight,stepX,stepZ)){
   // Sliding independently along X/Z gives smooth navigation at corners
   // without passing through walls.
   tx=xrBodyBlocked(positionX,positionZ,feet,eyeHeight,stepX,0)?positionX:positionX+stepX;
   tz=xrBodyBlocked(tx,positionZ,feet,eyeHeight,0,stepZ)?positionZ:positionZ+stepZ;
  }
  let nextFloor=xrFindSupport(tx,tz,feet,1.05,1.0);
  if(nextFloor!==null&&nextFloor>feet+.82){
   // Reject vertical jumps (walls), but allow 0.6m ground-level floor.
   tx=positionX;tz=positionZ;
   nextFloor=xrFindSupport(tx,tz,feet,1.05,1.0);
  }
  let nextY=feet;
  if(nextFloor!==null&&nextFloor>=feet-.42){
   // Follow ramp heights immediately, without slowly sinking into slab.
   nextY=nextFloor+.012;
   supported=true;xrFallVelocity=0;
  }
  const resolved=resolveXRCapsule(tx,tz,nextY,nextY+eyeHeight);
  // Keep the capsule above the support surface after wall correction.
  if(nextFloor!==null)resolved.y=Math.max(resolved.y,nextFloor+.012);
  rig.position.x+=resolved.x-positionX;
  rig.position.z+=resolved.z-positionZ;
  rig.position.y+=resolved.y-feet;
  positionX=resolved.x;positionZ=resolved.z;feet=resolved.y;
 }
 const support=xrFindSupport(positionX,positionZ,feet,.7,.85);
 if(support!==null&&support>=feet-.40){
  rig.position.y=Math.max(support+.012,feet-.04);
  xrFallVelocity=0;supported=true;xrLastSupport=support;
 }else if(!supported){
  xrFallVelocity=Math.min(9,xrFallVelocity+12*dt);
  const falling=resolveXRCapsule(positionX,positionZ,feet-xrFallVelocity*dt,feet+eyeHeight-xrFallVelocity*dt);
  rig.position.x+=falling.x-positionX;rig.position.z+=falling.z-positionZ;
  rig.position.y=falling.y;
  if(falling.grounded)xrFallVelocity=0;
 }else xrFallVelocity=0;
 const limits=modelBounds.clone().expandByScalar(12);
 rig.position.x=THREE.MathUtils.clamp(rig.position.x,limits.min.x,limits.max.x);
 rig.position.z=THREE.MathUtils.clamp(rig.position.z,limits.min.z,limits.max.z);
 if(rig.position.y<modelBounds.min.y-.12){rig.position.y=modelBounds.min.y-.08;xrFallVelocity=0}
}

function xrSmoothTurn(head,angle){
 if(Math.abs(angle)<.000001)return;
 // Rotate the rig around the actual headset position, so a physically
 // offset / room-scale user doesn't orbit around an invisible world origin.
 head.getWorldPosition(xrHeadA);
 rig.rotation.y+=angle;
 rig.updateMatrixWorld(true);
 head.getWorldPosition(xrHeadB);
 rig.position.x+=xrHeadA.x-xrHeadB.x;
 rig.position.z+=xrHeadA.z-xrHeadB.z;
}
function updateXRLocomotion(dt){
 if(!renderer.xr.isPresenting)return;
 const sources=renderer.xr.getSession()?.inputSources||[];
 let left=null,right=null;
 for(const src of sources){
   if(src.handedness==='left')left=src;
   else if(src.handedness==='right')right=src;
 }
 const walk=getXRStick(left),turn=getXRStick(right);
 const xrCamera=renderer.xr.getCamera(camera);
 const head=xrCamera.cameras?.[0]||xrCamera;
 if(!head)return;
 head.getWorldQuaternion(xrQ);
 xrFw.set(0,0,-1).applyQuaternion(xrQ).setY(0).normalize();
 if(xrFw.lengthSq()<.00001)xrFw.set(0,0,-1);
 xrRt.crossVectors(xrFw,xrUp).normalize();
 const magnitude=Math.min(1,Math.hypot(walk.x,walk.y));
 head.getWorldPosition(xrHeadA);
 let dx=0,dz=0;
 if(magnitude>.16){
   const adjusted=(magnitude-.16)/.84;
   const dist=2.6*dt*adjusted/magnitude;
   dx=(xrFw.x*(-walk.y)+xrRt.x*walk.x)*dist;
   dz=(xrFw.z*(-walk.y)+xrRt.z*walk.x)*dist;
 }
 if(collisionReady)xrGroundFollow(xrHeadA,dx,dz,dt);
 // Continuous analog turn: rotate for as long as the stick is held.
 const analog=Math.abs(turn.x)<.16?0:Math.sign(turn.x)*(Math.abs(turn.x)-.16)/.84;
 xrTurnVelocity=THREE.MathUtils.damp(xrTurnVelocity,-analog*XR_TURN_RATE,XR_TURN_RESPONSE,dt);
 if(Math.abs(xrTurnVelocity)>.001)xrSmoothTurn(head,xrTurnVelocity*dt);
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
 const head=renderer.xr.getCamera(camera);
 head.getWorldPosition(xrHeadA);
 rig.position.x+=target.x-xrHeadA.x;
 rig.position.z+=target.z-xrHeadA.z;
 const floor=xrFindSupport(target.x,target.z,target.y,.65,1.8);
 rig.position.y=(floor??target.y)+.012;
 xrFallVelocity=0;
}
for(let i=0;i<2;i++){
 const controller=renderer.xr.getController(i);rig.add(controller);
 const ray=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:0xdac28e}));ray.scale.z=8;controller.add(ray);
 controller.addEventListener('selectstart',()=>{if(renderer.xr.isPresenting)moveToController(controller)})
}
renderer.xr.addEventListener('sessionstart',()=>{xrTurnVelocity=0;xrFallVelocity=0;rig.rotation.y=0;buildWalkPhysics().then(ok=>{if(ok&&renderer.xr.isPresenting)status('Quest 3 capsule collision ready: walk on ramps & floors; hold right stick to turn');});window.poornaNavigation?.vrStart();window.poornaExhibition?.stop();rig.position.set(0,modelBounds.min.y,modelBounds.max.z+4);status('Quest 3: left joystick walks · right joystick smooth turning · trigger teleports.');tag.textContent='IMMERSIVE VR ACTIVE'});
renderer.xr.addEventListener('sessionend',()=>{window.poornaNavigation?.vrEnd();rig.position.set(0,0,0);tag.textContent=modelLoaded?'ACTUAL MARKET MODEL LOADED':'MODEL READY TO LOAD';setMode('orbit');status('Exited immersive VR mode')});
$('vrEnterBtn').addEventListener('click',async()=>{
 if(!modelLoaded){notice('Load the actual market model before entering VR.');return}
 if(!window.isSecureContext){notice('Immersive VR requires HTTPS. Deploy the site to a secure URL.');return}
 if(!navigator.xr){notice('WebXR is unavailable in this browser. Open the site in a compatible VR headset browser.');return}
 try{const supported=await navigator.xr.isSessionSupported('immersive-vr');if(!supported){notice('Immersive VR is not supported on this device or browser. Desktop walkthrough still works.');return}hiddenVR.click()}
 catch(error){console.error(error);notice('Could not start the VR session. Check headset browser permissions.')}
});
window.addEventListener('beforeunload',()=>{renderer.setAnimationLoop(null);renderer.dispose();ro.disconnect();io.disconnect()});
