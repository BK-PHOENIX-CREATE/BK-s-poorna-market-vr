import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {VRButton} from 'three/addons/webxr/VRButton.js';

// Interactive viewer for the user's consolidated SVP Market model.
// Geometry is pre-optimized; unlike the raw SketchUp export, it contains only 39 material batches.
const $=(id)=>document.getElementById(id);
const mount=$('canvasMount');
if (!mount) throw new Error('Missing model canvas');
const viewerTypography=getComputedStyle(mount);
const viewerFont=viewerTypography.fontFamily;
const viewerAccent=viewerTypography.getPropertyValue('--accent').trim();
const viewerInk=viewerTypography.getPropertyValue('--ink').trim();
const typeRatio=Number(viewerTypography.getPropertyValue('--golden-ratio'));
const vrBodySize=28;
const vrHeadingSize=vrBodySize*typeRatio;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xd6e4ed);
scene.fog=new THREE.Fog(0xd6e4ed,120,260);
const camera=new THREE.PerspectiveCamera(56,1,.08,800);
const rig=new THREE.Group();rig.name='VR Player';scene.add(rig);rig.add(camera);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
// Resolution profiles: immersive XR uses the headset's recommended eye buffer.
const devicePixelRatio=window.devicePixelRatio||1;
const isPortableDevice=window.matchMedia?.('(pointer: coarse)')?.matches||false;
renderer.setPixelRatio(Math.min(devicePixelRatio,isPortableDevice?1.25:1.65));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
renderer.xr.enabled=true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
// The market and sun are static: render the shadow atlas only when needed.
renderer.shadowMap.autoUpdate=false;
mount.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);
orbit.enableDamping=true;orbit.dampingFactor=.07;orbit.maxPolarAngle=Math.PI*.49;orbit.minDistance=3;orbit.maxDistance=220;
orbit.target.set(0,6,0);
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let openingElapsed=0,openingActive=false,viewerTouched=false;
function stopOpening(){
 viewerTouched=true;
 openingActive=false;
 orbit.autoRotate=false;
 orbit.autoRotateSpeed=0;
}
$('viewerShell').addEventListener('pointerdown',stopOpening,{capture:true});
$('viewerShell').addEventListener('wheel',stopOpening,{passive:true,capture:true});
$('viewerShell').addEventListener('keydown',stopOpening,{capture:true});
reducedMotion.addEventListener('change',stopOpening);
function updateOpening(delta){
 if(!openingActive)return;
 if(renderer.xr.isPresenting||currentMode!=='orbit'||reducedMotion.matches){stopOpening();return}
 openingElapsed=Math.min(8,openingElapsed+delta);
 orbit.autoRotateSpeed=.65*Math.sin(Math.PI*openingElapsed/8);
 orbit.autoRotate=openingElapsed<8;
 if(openingElapsed===8)openingActive=false;
}
const skylight=new THREE.HemisphereLight(0xe7eff3,0x8b7050,1.35);
scene.add(skylight);
const ambient=new THREE.AmbientLight(0xffffff,.12);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffdfb2,2.8);
const sunDirection=new THREE.Vector3(-12,22,33).normalize();
sun.position.copy(sunDirection).multiplyScalar(120);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near=.5;sun.shadow.camera.far=450;
sun.shadow.normalBias=.025;
scene.add(sun);scene.add(sun.target);
const opposite=new THREE.DirectionalLight(0xd6e6ff,.16);opposite.position.set(35,30,-35);scene.add(opposite);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(520,520),new THREE.MeshStandardMaterial({color:0xd7d6c7,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;scene.add(ground);
/* Architectural sun/shadows across desktop Walk and Quest 3.
   Model geometry and the tested VR locomotion physics remain untouched.
   Static sun shadows are cached instead of re-rendered at headset frame rate. */
const lightingPresets={
 day:{zenith:0x779fc7,horizon:0xe2e5df,ground:0xcac1ac,skyFill:0xe3efff,bounce:0x927e68,fill:1.15,sun:0xffe2bd,power:2.9,direction:[-12,22,33],shadow:1,exposure:1.1,environment:.42,glow:.4},
 golden:{zenith:0x8796b6,horizon:0xf1d2ad,ground:0xc7b69e,skyFill:0xe1e8ff,bounce:0xa78665,fill:1.02,sun:0xffbe82,power:2.7,direction:[-75,32,20],shadow:1,exposure:1.12,environment:.38,glow:.65},
 overcast:{zenith:0xabb8c7,horizon:0xe6e9e8,ground:0xc7cbc5,skyFill:0xeaf2ff,bounce:0x9a9690,fill:1.55,sun:0xf1f5ff,power:1.05,direction:[-25,92,25],shadow:.6,exposure:1.14,environment:.5,glow:0}
};
const skyMaps=new Map();
let activeLighting;
// Shadow maps must be rebuilt when the light or quality profile changes.
// Lower resolution and a one-time shadow render keep Quest 3 performant.
function requestSunShadowUpdate(){
 if(renderer.shadowMap.enabled)renderer.shadowMap.needsUpdate=true;
}
function setRenderingProfile(next){
 const immersive=next==='vr';
 const portable=next==='mobile';
 // WebXR manages its own framebuffer dimensions: never resize during VR.
 if(!immersive)renderer.setPixelRatio(Math.min(devicePixelRatio,portable?1.25:1.65));
 const resolution=Math.min(renderer.capabilities.maxTextureSize,immersive?1536:(portable?1024:3072));
 sun.shadow.radius=immersive||portable?1.15:1.6;
 if(sun.shadow.mapSize.x!==resolution||sun.shadow.mapSize.y!==resolution){
  sun.shadow.mapSize.set(resolution,resolution);
  if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
 }
 // Sun, mesh and ground are static: cache the light-depth pass after it
 // renders once, rather than generating it on every headset frame.
 requestSunShadowUpdate();
}
// Subtle relief estimated from the existing surface photographs.
// These maps are cached per texture and retain the model's UV transforms.
const surfaceDetailMaps=new Map();
function surfaceDetail(source){
 if(surfaceDetailMaps.has(source))return surfaceDetailMaps.get(source);
 const image=source.image;
 if(!image?.width||!image?.height)return null;
 const canvas=document.createElement('canvas');
 const scale=Math.min(1,512/Math.max(image.width,image.height));
 canvas.width=Math.max(1,Math.round(image.width*scale));
 canvas.height=Math.max(1,Math.round(image.height*scale));
 const context=canvas.getContext('2d',{willReadFrequently:true});
 try{
  context.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){
   const luminance=.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2];
   const height=96+luminance*.25;
   pixels.data[i]=height;
   // Green stores roughness, red stores the estimated height.
   pixels.data[i+1]=235-luminance*.12;
   pixels.data[i+2]=height;
   pixels.data[i+3]=255;
  }
  context.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.NoColorSpace;
  texture.flipY=source.flipY;
  texture.wrapS=source.wrapS;texture.wrapT=source.wrapT;
  texture.channel=source.channel;
  texture.offset.copy(source.offset);texture.repeat.copy(source.repeat);
  texture.center.copy(source.center);texture.rotation=source.rotation;
  texture.matrixAutoUpdate=source.matrixAutoUpdate;
  texture.matrix.copy(source.matrix);
  surfaceDetailMaps.set(source,texture);
  return texture;
 }catch(error){
  console.warn('Surface detail unavailable for',source.name,error);
  surfaceDetailMaps.set(source,null);
  return null;
 }
}
function setupArchitecturalMaterials(root){
 const maxAnisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const visited=new Set();
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const mat of materials){
   if(!mat||visited.has(mat))continue;
   visited.add(mat);
   if(mat.isMeshStandardMaterial||mat.isMeshPhysicalMaterial){
    // Maintain authored albedo, normal, metalness and roughness maps.
    // Avoid plastic-looking over-gloss on generic masonry and concrete.
    const name=(mat.name||'').toLowerCase();
    if(/brick|concrete|cement|plaster|stone|terracotta|tile|masonry|pavement/.test(name)){
     mat.roughness=Math.max(.95,mat.roughness);
     mat.metalness=Math.min(.06,mat.metalness);
    }
    if(mat.map&&!mat.normalMap&&!mat.bumpMap&&/brick|concrete|cement|plaster|stone|terracotta|tile|masonry|pavement|wood/.test(name)){
     mat.bumpMap=surfaceDetail(mat.map);
     mat.bumpScale=/brick|pavement|tile/.test(name)?.035:.012;
     mat.needsUpdate=true;
    }
    if(mat.map&&!mat.roughnessMap&&/brick|concrete|cement|plaster|stone|terracotta|tile|masonry|pavement|wood/.test(name)){
     mat.roughnessMap=surfaceDetail(mat.map);mat.needsUpdate=true;
    }
    if(/aluminum|aluminium|metal_profil/.test(name)){
     mat.metalness=Math.max(.8,mat.metalness);mat.roughness=.38;
    }
    if(/glass|glazing|window/.test(name)){
     mat.roughness=Math.min(.32,Math.max(.08,mat.roughness));
    }
   }
   for(const key of ['map','normalMap','bumpMap','roughnessMap','metalnessMap','aoMap']){
    const tex=mat[key];
    if(tex){tex.anisotropy=maxAnisotropy;tex.needsUpdate=true}
   }
  }
  // Transparent panels should not cast solid-looking architectural shadows.
  mesh.castShadow=materials.some(mat=>mat&&mat.opacity>=.95&&!mat.transparent);
  mesh.receiveShadow=true;
 });
}
function configureArchitecturalSun(){
 const center=modelBounds.getCenter(new THREE.Vector3());
 const size=modelBounds.getSize(new THREE.Vector3());
 sun.target.position.copy(center);
 sun.position.copy(center).addScaledVector(sunDirection,size.length()/2+12);
 sun.updateMatrixWorld(true);
 sun.target.updateMatrixWorld(true);
 const shadowCamera=sun.shadow.camera;
 shadowCamera.position.copy(sun.position);
 shadowCamera.lookAt(center);
 shadowCamera.updateMatrixWorld(true);

 // Fit the orthographic map to the market in light space. The projection
 // of a caster and its shadow on the ground share the same light-space X/Y.
 const lightBounds=new THREE.Box3();
 const corner=new THREE.Vector3();
 for(const x of [modelBounds.min.x,modelBounds.max.x]){
  for(const y of [modelBounds.min.y,modelBounds.max.y]){
   for(const z of [modelBounds.min.z,modelBounds.max.z]){
    lightBounds.expandByPoint(corner.set(x,y,z).applyMatrix4(shadowCamera.matrixWorldInverse));
   }
  }
 }
 const padding=3;
 shadowCamera.left=lightBounds.min.x-padding;
 shadowCamera.right=lightBounds.max.x+padding;
 shadowCamera.bottom=lightBounds.min.y-padding;
 shadowCamera.top=lightBounds.max.y+padding;
 shadowCamera.near=Math.max(.1,-lightBounds.max.z-padding);
 const groundShadowLength=Math.max(0,modelBounds.max.y-ground.position.y)/sunDirection.y;
 shadowCamera.far=-lightBounds.min.z+groundShadowLength+padding;
 shadowCamera.updateProjectionMatrix();
 // Keep the depth offset in world units as the fitted depth range changes.
 sun.shadow.bias=-.009/(shadowCamera.far-shadowCamera.near);
 requestSunShadowUpdate();
}
function buildSkyMap(preset){
 const width=512,height=256;
 const pixels=new Uint8Array(width*height*4);
 const zenith=new THREE.Color(preset.zenith);
 const horizon=new THREE.Color(preset.horizon);
 const groundBounce=new THREE.Color(preset.ground).multiplyScalar(.56);
 const sunGlow=new THREE.Color(preset.sun);
 const color=new THREE.Color();
 for(let y=0;y<height;y++){
  const elevation=((y+.5)/height-.5)*Math.PI;
  const up=Math.sin(elevation),ring=Math.cos(elevation);
  for(let x=0;x<width;x++){
   const azimuth=((x+.5)/width-.5)*2*Math.PI;
   const alignment=ring*(Math.cos(azimuth)*sunDirection.x+Math.sin(azimuth)*sunDirection.z)+up*sunDirection.y;
   const glow=preset.glow*Math.pow(Math.max(0,alignment),30)*THREE.MathUtils.smoothstep(up,0,.12);
   color.copy(horizon);
   if(up>=0)color.lerp(zenith,Math.pow(up,.45)).lerp(sunGlow,glow);
   else color.lerp(groundBounce,THREE.MathUtils.smoothstep(-up,0,.22));
   color.convertLinearToSRGB();
   const i=(y*width+x)*4;
   pixels[i]=Math.round(color.r*255);
   pixels[i+1]=Math.round(color.g*255);
   pixels[i+2]=Math.round(color.b*255);
   pixels[i+3]=255;
  }
 }
 const texture=new THREE.DataTexture(pixels,width,height);
 texture.name='Poorna Market outdoor sky';
 texture.mapping=THREE.EquirectangularReflectionMapping;
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;
 texture.wrapS=THREE.RepeatWrapping;
 texture.needsUpdate=true;
 return texture;
}
function setLighting(mode){
 if(activeLighting===mode)return;
 const preset=lightingPresets[mode];
 activeLighting=mode;
 sunDirection.set(...preset.direction).normalize();
 sun.color.set(preset.sun);
 sun.intensity=preset.power;
 sun.shadow.intensity=preset.shadow;
 skylight.color.set(preset.skyFill);
 skylight.groundColor.set(preset.bounce);
 skylight.intensity=preset.fill;
 ground.material.color.set(preset.ground);
 renderer.toneMappingExposure=preset.exposure;
 scene.fog.color.set(preset.horizon);
 scene.environmentIntensity=preset.environment;
 if(!skyMaps.has(mode))skyMaps.set(mode,buildSkyMap(preset));
 // The same sky lights the materials and fills the background in both eyes.
 scene.background=scene.environment=skyMaps.get(mode);
 configureArchitecturalSun();
}
const grid=new THREE.GridHelper(260,52,0xa4aea3,0xc7d1c6);grid.position.y=-.07;grid.material.opacity=.22;grid.material.transparent=true;scene.add(grid);
let model=null,modelBounds=new THREE.Box3(new THREE.Vector3(-46,0,-38),new THREE.Vector3(46,20,38));
let modelLoaded=false,isLoading=false,currentMode='orbit',visible=true,lockRequested=false;
setRenderingProfile(isPortableDevice?'mobile':'desktop');

const experienceSettings={speed:2,movement:'walk',seated:false};
let seatedCalibrated=false;
renderer.localClippingEnabled=true;
const sectionPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),0);
const floorTop=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
const floorBottom=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function updateSection(){
 if(!model)return;
 const selected=$('floorIsolation').value;
 const height=Number($('storeyHeight').value);
 const cut=Number($('sectionCut').value);
 const planes=[];
 if(currentMode==='walk'&&(selected!=='all'||cut<100))setMode('orbit');
 if(contactShade)contactShade.visible=selected==='all'&&cut===100;
 if(selected!=='all'){
  const base=modelBounds.min.y+Number(selected)*height;
  floorBottom.constant=-base+.05;floorTop.constant=base+height;
  planes.push(floorBottom,floorTop);
 }
 if(cut<100){
  sectionPlane.constant=THREE.MathUtils.lerp(modelBounds.min.x,modelBounds.max.x,cut/100);
  planes.push(sectionPlane);
 }
 model.traverse(mesh=>{
  if(!mesh.isMesh)return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   material.clippingPlanes=planes;material.clipShadows=true;material.needsUpdate=true;
  }
 });
 $('sectionValue').textContent=cut===100?'Full building':cut+'%';
 requestSunShadowUpdate();
}
function populateFloors(){
 if(!model)return;
 const select=$('floorIsolation');
 select.replaceChildren(new Option('Full building','all'));
 const height=Number($('storeyHeight').value);
 const count=Math.ceil((modelBounds.max.y-modelBounds.min.y)/height);
 for(let i=0;i<count;i++)select.add(new Option('Level band '+(i+1),String(i)));
 updateSection();
}
function restoreBuilding(){
 $('floorIsolation').value='all';$('sectionCut').value='100';updateSection();
}
$('floorIsolation').addEventListener('change',updateSection);
$('sectionCut').addEventListener('input',updateSection);
$('storeyHeight').addEventListener('change',()=>{
 $('storeyHeight').value=THREE.MathUtils.clamp(Number($('storeyHeight').value)||4.2,2,8);
 populateFloors();
});
$('restoreBuilding').addEventListener('click',restoreBuilding);
$('walkingSpeed').addEventListener('input',()=>{
 experienceSettings.speed=Number($('walkingSpeed').value);
 $('speedValue').textContent=experienceSettings.speed.toFixed(1)+' m/s';
});
$('movementStyle').addEventListener('change',()=>experienceSettings.movement=$('movementStyle').value);
$('seatedMode').addEventListener('change',()=>{
 experienceSettings.seated=$('seatedMode').checked;
 $('comfortStatus').textContent='Seated height takes effect on your next VR session.';
});
let contactShade=null,contactBakeVersion=0;
async function bakeContactShade(){
 const version=++contactBakeVersion;
 if(contactShade){scene.remove(contactShade);contactShade.geometry.dispose();contactShade.material.map.dispose();contactShade.material.dispose();contactShade=null}
 const bounds=modelBounds.clone().expandByScalar(5);
 const width=bounds.max.x-bounds.min.x,depth=bounds.max.z-bounds.min.z;
 const size=64,data=new Uint8Array(size*size*4);
 const ray=new THREE.Raycaster();ray.firstHitOnly=true;ray.near=.03;ray.far=4;
 const casters=collisionMeshes.filter(mesh=>mesh.userData.shadowCaster);
 const directions=[new THREE.Vector3(0,1,0),new THREE.Vector3(.7,1,0).normalize(),new THREE.Vector3(-.7,1,0).normalize(),new THREE.Vector3(0,1,.7).normalize(),new THREE.Vector3(0,1,-.7).normalize()];
 for(let z=0;z<size;z++){
  if(version!==contactBakeVersion)return;
  for(let x=0;x<size;x++){
   const origin=new THREE.Vector3(bounds.min.x+(x+.5)*width/size,ground.position.y+.04,bounds.max.z-(z+.5)*depth/size);
   let shade=0;
   for(const direction of directions){
    ray.set(origin,direction);
    const hit=ray.intersectObjects(casters,false)[0];
    if(hit)shade+=1-hit.distance/4;
   }
   const i=(z*size+x)*4;data[i]=data[i+1]=data[i+2]=0;data[i+3]=Math.round(100*shade/directions.length);
  }
  if(z%4===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(version!==contactBakeVersion)return;
 const texture=new THREE.DataTexture(data,size,size);
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
 contactShade=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1}));
 contactShade.rotation.x=-Math.PI/2;
 contactShade.position.set((bounds.min.x+bounds.max.x)/2,ground.position.y+.005,(bounds.min.z+bounds.max.z)/2);
 contactShade.visible=$('floorIsolation').value==='all'&&Number($('sectionCut').value)===100;
 scene.add(contactShade);
}

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
   const distanceScale=Math.max(.8,.83/camera.aspect);
   camera.position.set(center.x+r*.86*distanceScale,center.y+Math.max(h,r*.55)*distanceScale,center.z+r*.99*distanceScale);
   orbit.target.copy(center);orbit.enableRotate=true;orbit.enableZoom=true;orbit.enabled=true;orbit.update();
   modeLabel.textContent='Orbit view';
 }else if(mode==='plan'){
   camera.position.set(center.x,Math.max(90,r*1.65),center.z+.01);camera.up.set(0,0,-1);camera.lookAt(center.x,0,center.z);orbit.target.set(center.x,0,center.z);orbit.enableRotate=false;orbit.enabled=true;orbit.update();modeLabel.textContent='Plan view';
 }else{
   const start=entranceSpawn();
   camera.position.set(mode==='sky'?center.x+r*.8:start.position.x,mode==='sky'?Math.max(h+12,r*.7):start.position.y+EYE,mode==='sky'?center.z+r*.85:start.position.z);
   const target=mode==='sky'?new THREE.Vector3(center.x,Math.max(3,h*.4),center.z):start.target;
   const dir=target.sub(camera.position).normalize();
   yaw=Math.atan2(-dir.x,-dir.z);pitch=mode==='sky'?Math.asin(THREE.MathUtils.clamp(dir.y,-1,1)):0;
   camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);orbit.enabled=false;
   modeLabel.textContent=mode==='sky'?'Fly mode':'Walk mode';
   if(mode==='walk'){
     fallSpeed=0;desktopWalkState.velocity=0;
     const floor=collisionReady?floorAt(camera.position.x,camera.position.z,camera.position.y-EYE,STEP,8):null;
     if(floor!==null)camera.position.y=floor+EYE;
     status('Walk: WASD across real floors/ramps · Shift faster · click to look · Esc release');
   }else status('Sky: WASD fly · Space/E up · C/Q down · Shift faster · click to look');
 }
}
function setMode(next){
 openingActive=false;orbit.autoRotate=false;
 keys.clear();currentMode=next;
 if(next==='walk')restoreBuilding();
 document.querySelectorAll('.mode-tab').forEach(button=>{
  const selected=button.dataset.mode===next;
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',String(selected));
 });
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
window.poornaViewer={THREE,scene,camera,renderer,orbit,rig,setLighting,getBounds:()=>modelBounds.clone(),getModel:()=>model,isLoaded:()=>modelLoaded,getMode:()=>currentMode,setMode,status,notice};
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
     collider.userData.shadowCaster=meshes[i].castShadow;
     collider.userData.collisionWorldBox=geometry.boundingBox.clone().applyMatrix4(collider.matrixWorld);
     collisionMeshes.push(collider);
     if(i%3===0){status('Indexing building surfaces '+(i+1)+' / '+meshes.length);await new Promise(resolve=>setTimeout(resolve,0))}
   }
   collisionReady=true;collisionFailure='';status('Real floor collisions ready.');void bakeContactShade().catch(console.warn);return true;
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
 updateOpening(delta);
 if(!renderer.xr.isPresenting){
   if(currentMode==='sky'||currentMode==='walk'){
     const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(-forward.z,0,forward.x);
     let dx=0,dz=0;
     if(keys.has('KeyW')||keys.has('ArrowUp')){dx+=forward.x;dz+=forward.z}
     if(keys.has('KeyS')||keys.has('ArrowDown')){dx-=forward.x;dz-=forward.z}
     if(keys.has('KeyD')||keys.has('ArrowRight')){dx+=right.x;dz+=right.z}
     if(keys.has('KeyA')||keys.has('ArrowLeft')){dx-=right.x;dz-=right.z}
     const len=Math.hypot(dx,dz);if(len){dx/=len;dz/=len}
     const speed=(currentMode==='walk'?experienceSettings.speed:(keys.has('ShiftLeft')||keys.has('ShiftRight')?9:3.4))*delta;
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
   }else orbit.update(delta);
 }
 if(renderer.xr.isPresenting){try{updateXRLocomotion(delta,xrFrame);updateXRBackShortcut()}catch(error){console.error('Quest VR controller error',error)}}
 window.poornaExhibition?.tick(delta);
 window.poornaNavigation?.tick(delta);
 if(!window.poornaNavigation?.renderStereo?.())renderer.render(scene,camera);
});
mount.addEventListener('click',()=>{if((currentMode==='walk'||currentMode==='sky')&&!renderer.xr.isPresenting&&document.pointerLockElement!==renderer.domElement){renderer.domElement.requestPointerLock?.().catch(()=>{})}});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement||!['walk','sky'].includes(currentMode))return;yaw-=e.movementX*.0021;pitch=Math.max(-1.42,Math.min(1.42,pitch-e.movementY*.0021));camera.rotation.set(pitch,yaw,0)});
window.addEventListener('keydown',e=>{if(e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;keys.add(e.code);if((currentMode==='walk'||currentMode==='sky')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault()});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
const loader=new GLTFLoader();
const defaultModelUrl='/models/svp-market-optimized.glb';
function load(file){
 if(isLoading)return;
 isLoading=true;tag.textContent='LOADING GEOMETRY';status('Downloading and preparing market model…');
 const splash=$('viewerSplash'),progress=$('loadProgress'),bar=$('loadProgressBar'),progText=$('loadProgressText');
 splash.hidden=false;progress.hidden=false;$('loadModelBtn').hidden=true;
 progText.textContent='Downloading market model…';bar.style.width='0%';
 const isBlob=file instanceof File;const url=isBlob?URL.createObjectURL(file):file;
 loader.load(url,gltf=>{
  if(model){contactBakeVersion++;scene.remove(model);surfaceDetailMaps.forEach(texture=>texture?.dispose());surfaceDetailMaps.clear();model.traverse(obj=>{if(obj.isMesh){obj.geometry?.disposeBoundsTree?.();obj.geometry?.dispose?.()}})}
   collisionMeshes.forEach(mesh=>mesh.material?.dispose?.());collisionMeshes=[];collisionReady=false;collisionPromise=null;collisionFailure='';fallSpeed=0;
  model=gltf.scene;
  let meshCount=0;model.traverse(obj=>{if(obj.isMesh){meshCount++;obj.frustumCulled=true}});
  setupArchitecturalMaterials(model);
  // Source model is pre-batched, positioned at ground level, and measured in meters.
  modelBounds=new THREE.Box3().setFromObject(model);
  if(modelBounds.isEmpty()||!Number.isFinite(modelBounds.min.x))throw new Error('Invalid model bounds');
  const modelSize=modelBounds.getSize(new THREE.Vector3());
  if(modelSize.x>2000||modelSize.z>2000){const scale=95/Math.max(modelSize.x,modelSize.z);model.scale.setScalar(scale);modelBounds.setFromObject(model)}
  scene.add(model);populateFloors();
  if(activeLighting)configureArchitecturalSun();
  else setLighting('golden');
  setRenderingProfile(renderer.xr.isPresenting?'vr':(isPortableDevice?'mobile':'desktop'));
  requestSunShadowUpdate();
  modelLoaded=true;isLoading=false;tag.textContent='ACTUAL MARKET MODEL LOADED';splash.hidden=true;progress.hidden=true;grid.visible=false;ground.visible=true;
  setMode('orbit');openingElapsed=0;openingActive=!viewerTouched&&!reducedMotion.matches&&!renderer.xr.isPresenting;writeStartToUI();buildWalkPhysics().catch(error=>console.error('Preparing VR walking surfaces',error));window.poornaExhibition?.modelReady();window.poornaNavigation?.modelReady();status(`Loaded successfully · ${meshCount} draw groups · Orbit / Sky / Walk / Plan / VR available`);
  if(isBlob)URL.revokeObjectURL(url);
 },evt=>{if(evt.lengthComputable){const pct=Math.min(98,Math.round(evt.loaded/evt.total*100));bar.style.width=pct+'%';progText.textContent=`Downloading 3D architecture · ${pct}%`;
 }else{progText.textContent=`Downloading model · ${(evt.loaded/1024/1024).toFixed(0)} MB received`}
 },err=>{console.error('Model loading failed',err);tag.textContent='MODEL UNAVAILABLE';isLoading=false;progress.hidden=true;$('loadModelBtn').hidden=false;status('Could not load the 3D model. Retry the download or upload a GLB from your computer.');notice('Model loading failed. Check your connection or try a local GLB.');if(isBlob)URL.revokeObjectURL(url)});
}
function loadDefaultModel(){load(defaultModelUrl)}
$('loadModelBtn').addEventListener('click',loadDefaultModel);
$('fileButton').addEventListener('click',()=>$('modelFile').click());
$('modelFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!file.name.toLowerCase().endsWith('.glb')){notice('Please choose a .glb file.');return}
 if(file.size>180*1024*1024&&!window.confirm('This model exceeds 180 MB. Large unoptimized GLBs may freeze your browser. Try loading anyway?'))return;
 load(file);e.target.value=''});
$('resetViewBtn').addEventListener('click',()=>setMode(currentMode));
$('helpBtn').addEventListener('click',()=>$('viewerHelp').hidden=!$('viewerHelp').hidden);
$('closeHelpBtn').addEventListener('click',()=>$('viewerHelp').hidden=true);
const fullscreenShell=$('viewerShell'),fullscreenButton=$('fullscreenBtn');
function syncFullscreen(){
 const expanded=document.fullscreenElement===fullscreenShell||fullscreenShell.classList.contains('is-fullscreen');
 const label=expanded?'Exit expanded viewer':'Expand model viewer';
 fullscreenButton.setAttribute('aria-label',label);
 fullscreenButton.title=label;
 resize();
}
fullscreenButton.addEventListener('click',async()=>{
 if(fullscreenShell.classList.contains('is-fullscreen'))fullscreenShell.classList.remove('is-fullscreen');
 else if(document.fullscreenElement===fullscreenShell)await document.exitFullscreen();
 else if(fullscreenShell.requestFullscreen){
  try{await fullscreenShell.requestFullscreen()}catch{fullscreenShell.classList.add('is-fullscreen')}
 }else fullscreenShell.classList.add('is-fullscreen');
 syncFullscreen();
});
document.addEventListener('fullscreenchange',syncFullscreen);

// Quest 3: left thumbstick is relative to headset yaw; right thumbstick
// turns continuously while held. Ground movement is shared with desktop Walk.
// Quest diagnostics on the controller: shows whether physics is actually active,
// the ground ray's reading, and the tracked player floor elevation.

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
 if(experienceSettings.seated&&!seatedCalibrated){
  const reference=renderer.xr.getReferenceSpace();
  const pose=xrFrame?.getViewerPose(reference);
  if(pose){
   const lift=Math.max(0,Math.min(.8,EYE-pose.transform.position.y));
   renderer.xr.setReferenceSpace(reference.getOffsetReferenceSpace(new XRRigidTransform({y:-lift})));
   seatedCalibrated=true;
  }
 }
 const sources=renderer.xr.getSession()?.inputSources||[];
 let left=null,right=null;
 for(const src of sources){
  if(src.handedness==='left')left=src;
  else if(src.handedness==='right')right=src;
 }
 const walk=getXRStick(left),turn=getXRStick(right);
 const trackedHead=getTrackedHeadPose(xrFrame);
 if(!trackedHead){
  xrPoseMissing++;
  if(xrPoseMissing===90)console.warn('Quest viewer pose unavailable for 90 frames');
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
 let dx=0,dz=0;
 if(magnitude>.16){
  const adjusted=(magnitude-.16)/.84;
  const dist=(experienceSettings.movement==='teleport'?0:experienceSettings.speed)*dt*adjusted/magnitude;
  dx=(xrFw.x*(-walk.y)+xrRt.x*walk.x)*dist;
  dz=(xrFw.z*(-walk.y)+xrRt.z*walk.x)*dist;
 }
 if(collisionReady)xrGroundFollow(trackedHead,dx,dz,dt);
 // Diagnostics use the tracked world position *after* the rig moved.
 const analog=Math.abs(turn.x)<.16?0:Math.sign(turn.x)*(Math.abs(turn.x)-.16)/.84;
 xrTurnVelocity=THREE.MathUtils.damp(xrTurnVelocity,-analog*XR_TURN_RATE,XR_TURN_RESPONSE,dt);
 if(Math.abs(xrTurnVelocity)>.001)xrSmoothTurn(null,xrTurnVelocity*dt,xrFrame);
}
// Immersive-VR entry and controller teleportation; available only on supported secure origins.
// Back to website: visible in the headset, selectable with either trigger.
// Quest right-hand B button is also a one-press exit shortcut.
const xrBackCanvas=document.createElement('canvas');
xrBackCanvas.width=512;xrBackCanvas.height=160;
const xrBackCtx=xrBackCanvas.getContext('2d');
xrBackCtx.fillStyle='#1d202d';xrBackCtx.fillRect(0,0,512,160);
xrBackCtx.strokeStyle=viewerAccent;xrBackCtx.lineWidth=8;xrBackCtx.strokeRect(5,5,502,150);
xrBackCtx.fillStyle='#f5f0df';xrBackCtx.font=`700 ${vrHeadingSize}px ${viewerFont}`;
xrBackCtx.textAlign='center';xrBackCtx.textBaseline='middle';
xrBackCtx.fillText('← BACK / EXIT VR',256,80,466);
const xrBackTexture=new THREE.CanvasTexture(xrBackCanvas);
xrBackTexture.colorSpace=THREE.SRGBColorSpace;
const xrBackButton=new THREE.Mesh(new THREE.PlaneGeometry(.308,.09625),
 new THREE.MeshBasicMaterial({map:xrBackTexture,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
xrBackButton.name='Exit VR to website';
xrBackButton.renderOrder=11000;xrBackButton.frustumCulled=false;xrBackButton.visible=false;
// The minimap is on controller index 0 at (0,.11,-.15), tilted -0.35.
 // Keep Back below the minimap so it stays out of the headset's central view.
xrBackButton.position.set(0,-.11,-.15);
xrBackButton.rotation.x=-.35;
renderer.xr.getController(0).add(xrBackButton);
const xrBackRay=new THREE.Raycaster();
const xrBackRotation=new THREE.Matrix4(),xrBackForward=new THREE.Vector3(0,0,-1);
let xrBackButtonHeld=false;
async function exitQuestVR(){
 const session=renderer.xr.getSession();
 if(!session)return;
 xrBackButton.visible=false;
 try{await session.end()}
 catch(error){xrBackButton.visible=true;console.warn('Exit VR failed',error);status('Use Quest system menu if Back cannot end this session.')}
}
function selectVRBack(controller){
 if(!renderer.xr.isPresenting||!xrBackButton.visible)return false;
 controller.updateMatrixWorld(true);
 xrBackRotation.identity().extractRotation(controller.matrixWorld);
 xrBackRay.ray.origin.setFromMatrixPosition(controller.matrixWorld);
 xrBackRay.ray.direction.copy(xrBackForward).applyMatrix4(xrBackRotation).normalize();
 xrBackRay.near=0;xrBackRay.far=5;
 if(xrBackRay.intersectObject(xrBackButton,false).length===0)return false;
 void exitQuestVR();return true;
}
function updateXRBackShortcut(){
 if(!renderer.xr.isPresenting)return;
 const right=Array.from(renderer.xr.getSession()?.inputSources||[]).find(source=>source.handedness==='right');
 const down=!!right?.gamepad?.buttons?.[5]?.pressed;
 if(down&&!xrBackButtonHeld)void exitQuestVR();
 xrBackButtonHeld=down;
}
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
// Wrist-mounted exhibition tour and one-time-per-entry Quest control guide.
// Uses the SAME saved stops as the desktop exhibition and jury tour planner.
// Tour movement is floor-snapped teleportation, not an unsafe camera tween.
const vrTourCanvas=document.createElement('canvas');
vrTourCanvas.width=900;vrTourCanvas.height=700;
const vrTourCtx=vrTourCanvas.getContext('2d');
const vrTourTexture=new THREE.CanvasTexture(vrTourCanvas);
vrTourTexture.colorSpace=THREE.SRGBColorSpace;
const vrTourMaterial=new THREE.MeshBasicMaterial({
 map:vrTourTexture,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false
});
const vrTourPanel=new THREE.Mesh(new THREE.PlaneGeometry(.45,.35),vrTourMaterial);
vrTourPanel.name='VR controls and guided tour';
vrTourPanel.position.set(.365,.09,-.15);
vrTourPanel.rotation.x=-.35;
vrTourPanel.renderOrder=11020;vrTourPanel.frustumCulled=false;vrTourPanel.visible=false;
renderer.xr.getController(0).add(vrTourPanel);
const vrTourTabCanvas=document.createElement('canvas');
vrTourTabCanvas.width=512;vrTourTabCanvas.height=160;
const vrTourTabCtx=vrTourTabCanvas.getContext('2d');
vrTourTabCtx.fillStyle='#222531';vrTourTabCtx.fillRect(0,0,512,160);
vrTourTabCtx.strokeStyle=viewerAccent;vrTourTabCtx.lineWidth=8;vrTourTabCtx.strokeRect(4,4,504,152);
vrTourTabCtx.textAlign='center';vrTourTabCtx.textBaseline='middle';
vrTourTabCtx.fillStyle='#fff4dd';vrTourTabCtx.font=`700 ${vrHeadingSize}px ${viewerFont}`;
vrTourTabCtx.fillText('OPEN VR TOUR',256,82,466);
const vrTourTabTexture=new THREE.CanvasTexture(vrTourTabCanvas);
vrTourTabTexture.colorSpace=THREE.SRGBColorSpace;
const vrTourTab=new THREE.Mesh(new THREE.PlaneGeometry(.20,.0625),
 new THREE.MeshBasicMaterial({map:vrTourTabTexture,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
vrTourTab.position.set(.27,.13,-.15);
vrTourTab.rotation.x=-.35;
vrTourTab.name='Reopen VR Tour';
vrTourTab.renderOrder=11020;vrTourTab.frustumCulled=false;vrTourTab.visible=false;
renderer.xr.getController(0).add(vrTourTab);
let vrTourPage='intro',vrTourIndex=-1,vrTourMessage='';
let vrTourButtons=[];
const vrTourRaycaster=new THREE.Raycaster();
// Canvas text needs to be repainted after the webfonts finish loading.
Promise.all([500,700].map(weight=>document.fonts.load(`${weight} ${vrBodySize}px ${viewerFont}`))).then(()=>{
 xrBackCtx.fillStyle='#1d202d';xrBackCtx.fillRect(14,14,484,132);
 xrBackCtx.fillStyle='#f5f0df';xrBackCtx.fillText('← BACK / EXIT VR',256,80,466);
 xrBackTexture.needsUpdate=true;
 vrTourTabCtx.fillStyle='#222531';vrTourTabCtx.fillRect(14,14,484,132);
 vrTourTabCtx.fillStyle='#fff4dd';vrTourTabCtx.fillText('OPEN VR TOUR',256,82,466);
 vrTourTabTexture.needsUpdate=true;
 vrTourRedraw();
}).catch(error=>console.warn('VR labels are using the fallback font',error));
function vrTourRoundRect(x,y,w,h,r,color){
 vrTourCtx.fillStyle=color;
 vrTourCtx.beginPath();vrTourCtx.roundRect(x,y,w,h,r);vrTourCtx.fill();
}
function vrTourLine(str,x,y,maxWidth=810,size=vrBodySize,color='#eae9e4'){
 vrTourCtx.font=`500 ${size}px ${viewerFont}`;
 vrTourCtx.fillStyle=color;vrTourCtx.textAlign='left';vrTourCtx.textBaseline='top';
 const words=String(str||'').split(/\s+/);
 let line='',yy=y;
 for(const word of words){
  const next=line?line+' '+word:word;
  if(vrTourCtx.measureText(next).width>maxWidth&&line){
   vrTourCtx.fillText(line,x,yy);yy+=size*1.30;line=word;
   if(yy>530)break;
  }else line=next;
 }
 if(line&&yy<=535)vrTourCtx.fillText(line,x,yy);
 return yy+size*1.35;
}
function vrTourButton(text,x,y,w,h,action,enabled=true){
 vrTourRoundRect(x,y,w,h,15,enabled?viewerAccent:'#4a4c58');
 vrTourCtx.textAlign='center';vrTourCtx.textBaseline='middle';
 vrTourCtx.font=`700 ${vrBodySize}px ${viewerFont}`;vrTourCtx.fillStyle=enabled?viewerInk:'#b8b8c2';
 vrTourCtx.fillText(text,x+w/2,y+h/2);
 if(enabled)vrTourButtons.push({x,y,w,h,action});
}
function vrTourRedraw(){
 vrTourButtons=[];
 vrTourCtx.fillStyle='#1b1e2b';vrTourCtx.fillRect(0,0,900,700);
 vrTourCtx.fillStyle='#353844';vrTourCtx.fillRect(0,0,900,104);
 vrTourCtx.fillStyle=viewerAccent;vrTourCtx.textAlign='left';vrTourCtx.textBaseline='middle';
 vrTourCtx.font=`700 ${vrHeadingSize}px ${viewerFont}`;
 vrTourCtx.fillText(vrTourPage==='intro'?'WELCOME TO POORNA MARKET VR':'POORNA MARKET / GUIDED TOUR',34,52,832);
 if(vrTourPage==='intro'){
  const lines=[
   experienceSettings.movement==='teleport'?'CONTROLLER TRIGGER   Point to teleport':'LEFT JOYSTICK     Walk forward / back / sideways',
   'RIGHT JOYSTICK   Hold to turn smoothly',
   'CONTROLLER TRIGGER   Teleport or select buttons',
   'LEFT CONTROLLER   Map, tour and Exit VR',
   'RIGHT B BUTTON   Return to website'
  ];
  let y=142;
  for(const line of lines){y=vrTourLine(line,40,y,835);y+=15}
  vrTourLine('Select START TOUR to visit the exhibition stops, or EXPLORE to walk freely.',40,495,825,vrBodySize,'#cdcdd7');
  vrTourButton('START TOUR',26,588,408,82,'start');
  vrTourButton('EXPLORE',466,588,408,82,'minimize');
 }else{
  const stops=window.poornaExhibition?.getStops?.()||[];
  const stop=stops[vrTourIndex];
  vrTourCtx.font=`700 ${vrBodySize}px ${viewerFont}`;vrTourCtx.fillStyle=viewerAccent;
  vrTourCtx.fillText(stops.length?'STOP '+(Math.max(0,vrTourIndex)+1)+' / '+stops.length:'NO TOUR STOPS',40,153);
  if(stop){
   vrTourLine(stop.title||'Market stop',40,192,820,vrHeadingSize,'#fff6e5');
   vrTourLine(stop.note||stop.desc||'Explore this part of the market.',40,315,820);
  }else{
   vrTourLine('Choose NEXT to move to the first architectural tour stop.',40,228,820);
  }
  if(vrTourMessage)vrTourLine(vrTourMessage,40,515,820,vrBodySize,'#e8c697');
  vrTourButton('PREVIOUS',24,590,260,80,'previous',vrTourIndex>0);
  vrTourButton(vrTourIndex>=stops.length-1?'RESTART':'NEXT STOP',302,590,300,80,'next',stops.length>0);
  vrTourButton('HIDE',622,590,254,80,'minimize');
 }
 vrTourTexture.needsUpdate=true;
}
function vrTourStart(){
 vrTourPage='intro';vrTourIndex=-1;vrTourMessage='';
 vrTourPanel.visible=true;vrTourTab.visible=false;
 vrTourRedraw();
}
function vrTourEnd(){
 vrTourPanel.visible=false;vrTourTab.visible=false;
 vrTourMessage='';
}
function vrTourVisit(index){
 const stops=window.poornaExhibition?.getStops?.()||[];
 if(!stops.length){vrTourMessage='No tour stops available on this device.';vrTourRedraw();return}
 if(!collisionReady){vrTourMessage='Walk surfaces are still loading. Try NEXT again.';vrTourRedraw();return}
 const next=(index+stops.length)%stops.length;
 const stop=stops[next],box=modelBounds;
 const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const position=stop.pose?.position;
 let x=position?.[0],z=position?.[2];
 if(!Number.isFinite(x)||!Number.isFinite(z)){
  x=center.x+(stop.anchor?.[0]||0)*size.x;
  z=center.z+(stop.anchor?.[2]||0)*size.z;
 }
 x=THREE.MathUtils.clamp(x,box.min.x-8,box.max.x+8);
 z=THREE.MathUtils.clamp(z,box.min.z-8,box.max.z+8);
 // Prefer a reachable lower-level floor close to the exhibition marker.
 const probeFeet=box.min.y+.9;
 let foot=floorAt(x,z,probeFeet,1.3,3.5);
 if(foot===null){
  // Move the candidate a little to find a nearby walkable triangle.
  for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]]){
   const yy=floorAt(x+ox,z+oz,probeFeet,1.3,3.5);
   if(yy!==null){x+=ox;z+=oz;foot=yy;break}
  }
 }
 if(foot===null){
  vrTourMessage='No walkable surface found here; previous position kept.';
  vrTourRedraw();return;
 }
 // Moving the VR rig, rather than the camera, preserves room-scale
 // headset tracking and the tested Quest locomotion/collision pipeline.
 rig.updateWorldMatrix(true,false);
 xrHeadA.copy(xrTrackedLocal).applyMatrix4(rig.matrixWorld);
 rig.position.x+=x-xrHeadA.x;rig.position.z+=z-xrHeadA.z;
 rig.position.y=foot;
 vrWalkState.velocity=0;
 vrTourIndex=next;
 vrTourMessage='Moved to this stop. Use the joystick to explore.';
 vrTourRedraw();
}
function vrTourAction(action){
 if(action==='minimize'){
  vrTourPanel.visible=false;vrTourTab.visible=true;return;
 }
 if(action==='start'){
  vrTourPage='tour';vrTourIndex=-1;vrTourVisit(0);return;
 }
 if(action==='next'){vrTourVisit(vrTourIndex+1);return}
 if(action==='previous'){vrTourVisit(vrTourIndex-1);return}
}
function selectVRTour(controller){
 if(!renderer.xr.isPresenting)return false;
 controller.updateMatrixWorld(true);
 xrBackRotation.identity().extractRotation(controller.matrixWorld);
 vrTourRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
 vrTourRaycaster.ray.direction.copy(xrBackForward).applyMatrix4(xrBackRotation).normalize();
 vrTourRaycaster.near=0;vrTourRaycaster.far=4;
 if(vrTourTab.visible&&vrTourRaycaster.intersectObject(vrTourTab,false).length){
  vrTourTab.visible=false;vrTourPanel.visible=true;
  vrTourRedraw();return true;
 }
 if(!vrTourPanel.visible)return false;
 const hit=vrTourRaycaster.intersectObject(vrTourPanel,false)[0];
 if(!hit?.uv)return false;
 const px=hit.uv.x*900,py=(1-hit.uv.y)*700;
 for(const button of vrTourButtons){
  if(px>=button.x&&px<=button.x+button.w&&py>=button.y&&py<=button.y+button.h){
   vrTourAction(button.action);return true;
  }
 }
 // Clicking the panel outside a button should not teleport behind it.
 return true;
}

for(let i=0;i<2;i++){
 const controller=renderer.xr.getController(i);rig.add(controller);
 // Diagnostic HUD is attached to the scene and follows the headset.
 const ray=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:0xdac28e}));ray.scale.z=8;controller.add(ray);
 controller.addEventListener('selectstart',()=>{if(renderer.xr.isPresenting&&!selectVRBack(controller)&&!selectVRTour(controller))moveToController(controller)})
}
renderer.xr.addEventListener('sessionstart',()=>{restoreBuilding();seatedCalibrated=false;stopOpening();setRenderingProfile('vr');vrTourStart();xrBackButton.visible=true;xrBackButtonHeld=false;xrTurnVelocity=0;vrWalkState.velocity=0;xrPoseMissing=0;xrSpawnPending=true;rig.rotation.y=0;buildWalkPhysics().then(ok=>{if(ok&&renderer.xr.isPresenting)status('Quest 3 capsule collision ready: walk on ramps & floors; hold right stick to turn');});window.poornaNavigation?.vrStart();window.poornaExhibition?.stop();rig.position.copy(entranceSpawn().position);status('Quest 3: left joystick walks · right joystick smooth turning · trigger teleports.');tag.textContent='IMMERSIVE VR ACTIVE'});
renderer.xr.addEventListener('sessionend',()=>{setRenderingProfile(isPortableDevice?'mobile':'desktop');vrTourEnd();xrBackButton.visible=false;xrBackButtonHeld=false;window.poornaNavigation?.vrEnd();rig.position.set(0,0,0);tag.textContent=modelLoaded?'ACTUAL MARKET MODEL LOADED':'MODEL READY TO LOAD';setMode('orbit');status('Exited immersive VR mode')});
$('vrEnterBtn').addEventListener('click',async()=>{
 if(!modelLoaded){notice(isLoading?'Wait for the market model to finish loading before entering VR.':'Retry loading the market model before entering VR.');return}
 if(!window.isSecureContext){notice('Immersive VR requires HTTPS. Deploy the site to a secure URL.');return}
 if(!navigator.xr){notice('WebXR is unavailable in this browser. Open the site in a compatible VR headset browser.');return}
 try{const supported=await navigator.xr.isSessionSupported('immersive-vr');if(!supported){notice('Immersive VR is not supported on this device or browser. Desktop walkthrough still works.');return}hiddenVR.click()}
 catch(error){console.error(error);notice('Could not start the VR session. Check headset browser permissions.')}
});
window.addEventListener('beforeunload',()=>{contactBakeVersion++;if(contactShade){contactShade.geometry.dispose();contactShade.material.map.dispose();contactShade.material.dispose();}renderer.setAnimationLoop(null);skyMaps.forEach(texture=>texture.dispose());surfaceDetailMaps.forEach(texture=>texture?.dispose());renderer.dispose();ro.disconnect();io.disconnect()});
window.market3dReady=true;
document.addEventListener('DOMContentLoaded',loadDefaultModel,{once:true});
