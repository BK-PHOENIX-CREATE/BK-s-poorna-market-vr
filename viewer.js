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
   camera.position.set(center.x,1.72,box.max.z+4);
   const direction=new THREE.Vector3(center.x,1.65,center.z).sub(camera.position).normalize();yaw=Math.atan2(-direction.x,-direction.z);pitch=0;
   camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);orbit.enabled=false;modeLabel.textContent='HUMAN SCALE / WALK';
   status('Click inside the viewer to look around. W A S D to move. Esc to release the mouse.');
 }
}
function setMode(next){currentMode=next;document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('selected',b.dataset.mode===next));
 if(document.pointerLockElement===renderer.domElement)document.exitPointerLock?.();makeCamera(next);
 if(!modelLoaded&&next==='walk')notice('Load the market model first for an architectural walkthrough.');
}
document.querySelectorAll('.mode-tab').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.mode)));
function resize(){const w=Math.max(1,mount.clientWidth),h=Math.max(1,mount.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
const ro=new ResizeObserver(resize);ro.observe(mount);resize();makeCamera('orbit');
const io=new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??true},{threshold:.005});io.observe(mount);
const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{
 const delta=Math.min(clock.getDelta(),.05);
 if(!visible&&!renderer.xr.isPresenting)return;
 if(!renderer.xr.isPresenting){
   if(currentMode==='walk'){
     const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));const right=new THREE.Vector3(-f.z,0,f.x);
     const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?9:3.4)*delta;
     if(keys.has('KeyW')||keys.has('ArrowUp'))camera.position.addScaledVector(f,speed);
     if(keys.has('KeyS')||keys.has('ArrowDown'))camera.position.addScaledVector(f,-speed);
     if(keys.has('KeyD')||keys.has('ArrowRight'))camera.position.addScaledVector(right,speed);
     if(keys.has('KeyA')||keys.has('ArrowLeft'))camera.position.addScaledVector(right,-speed);
     camera.position.y=1.72;
     const ext=modelBounds.clone().expandByScalar(15);
     camera.position.x=THREE.MathUtils.clamp(camera.position.x,ext.min.x,ext.max.x);
     camera.position.z=THREE.MathUtils.clamp(camera.position.z,ext.min.z,ext.max.z);
   }else orbit.update();
 }
 renderer.render(scene,camera);
});
mount.addEventListener('click',()=>{if(currentMode==='walk'&&!renderer.xr.isPresenting&&document.pointerLockElement!==renderer.domElement){renderer.domElement.requestPointerLock?.().catch(()=>{})}});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement||currentMode!=='walk')return;yaw-=e.movementX*.0021;pitch=Math.max(-1.42,Math.min(1.42,pitch-e.movementY*.0021));camera.rotation.set(pitch,yaw,0)});
window.addEventListener('keydown',e=>{if(e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;keys.add(e.code);if(currentMode==='walk'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)&&document.activeElement===mount)e.preventDefault()});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
const loader=new GLTFLoader();
function load(file){
 if(isLoading)return;
 isLoading=true;tag.textContent='LOADING GEOMETRY';status('Downloading and preparing market model…');
 const splash=$('viewerSplash'),progress=$('loadProgress'),bar=$('loadProgressBar'),progText=$('loadProgressText');
 splash.hidden=false;progress.hidden=false;$('loadModelBtn').disabled=true;$('loadModelBtn').textContent='Preparing 3D experience…';
 const isBlob=file instanceof File;const url=isBlob?URL.createObjectURL(file):file;
 loader.load(url,gltf=>{
  if(model){scene.remove(model);model.traverse(obj=>{if(obj.isMesh)obj.geometry?.dispose?.()})}
  model=gltf.scene;
  let meshCount=0;model.traverse(obj=>{if(obj.isMesh){meshCount++;obj.castShadow=false;obj.receiveShadow=false;obj.frustumCulled=true}});
  // Source model is pre-batched, positioned at ground level, and measured in meters.
  modelBounds=new THREE.Box3().setFromObject(model);
  if(modelBounds.isEmpty()||!Number.isFinite(modelBounds.min.x))throw new Error('Invalid model bounds');
  const modelSize=modelBounds.getSize(new THREE.Vector3());
  if(modelSize.x>2000||modelSize.z>2000){const scale=95/Math.max(modelSize.x,modelSize.z);model.scale.setScalar(scale);modelBounds.setFromObject(model)}
  scene.add(model);
  modelLoaded=true;isLoading=false;tag.textContent='ACTUAL MARKET MODEL LOADED';splash.hidden=true;progress.hidden=true;grid.visible=false;ground.visible=true;
  setMode('orbit');status(`Loaded successfully · ${meshCount} draw groups · Orbit / Walkthrough / Plan / VR available`);
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

// Immersive-VR entry and controller teleportation; available only on supported secure origins.
const hiddenVR=VRButton.createButton(renderer,{optionalFeatures:['local-floor','bounded-floor','hand-tracking']});
hiddenVR.style.display='none';hiddenVR.setAttribute('aria-hidden','true');document.body.appendChild(hiddenVR);
const raycaster=new THREE.Raycaster(),rot=new THREE.Matrix4();
const teleportSurface=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
teleportSurface.rotation.x=-Math.PI/2;teleportSurface.position.y=.03;scene.add(teleportSurface);
function moveToController(controller){
 rot.identity().extractRotation(controller.matrixWorld);raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);raycaster.ray.direction.set(0,0,-1).applyMatrix4(rot);
 const hits=raycaster.intersectObject(teleportSurface);if(!hits.length)return;
 const point=hits[0].point;const head=renderer.xr.getCamera(camera);const local=head.getWorldPosition(new THREE.Vector3());rig.position.x+=point.x-local.x;rig.position.z+=point.z-local.z;
}
for(let i=0;i<2;i++){
 const controller=renderer.xr.getController(i);rig.add(controller);
 const ray=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:0xdac28e}));ray.scale.z=8;controller.add(ray);
 controller.addEventListener('selectstart',()=>{if(renderer.xr.isPresenting)moveToController(controller)})
}
renderer.xr.addEventListener('sessionstart',()=>{rig.position.set(0,0,modelBounds.max.z+4);status('Immersive VR active. Point at the floor and press controller trigger to teleport.');tag.textContent='IMMERSIVE VR ACTIVE'});
renderer.xr.addEventListener('sessionend',()=>{rig.position.set(0,0,0);tag.textContent=modelLoaded?'ACTUAL MARKET MODEL LOADED':'MODEL READY TO LOAD';setMode('orbit');status('Exited immersive VR mode')});
$('vrEnterBtn').addEventListener('click',async()=>{
 if(!modelLoaded){notice('Load the actual market model before entering VR.');return}
 if(!window.isSecureContext){notice('Immersive VR requires HTTPS. Deploy the site to a secure URL.');return}
 if(!navigator.xr){notice('WebXR is unavailable in this browser. Open the site in a compatible VR headset browser.');return}
 try{const supported=await navigator.xr.isSessionSupported('immersive-vr');if(!supported){notice('Immersive VR is not supported on this device or browser. Desktop walkthrough still works.');return}hiddenVR.click()}
 catch(error){console.error(error);notice('Could not start the VR session. Check headset browser permissions.')}
});
window.addEventListener('beforeunload',()=>{renderer.setAnimationLoop(null);renderer.dispose();ro.disconnect();io.disconnect()});
