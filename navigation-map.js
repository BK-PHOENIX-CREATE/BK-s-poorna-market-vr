import * as THREE from 'three';

// The actual market mesh is projected into a simple top-down navigation atlas.
// VR browsers do not display regular HTML overlays inside an immersive XR session,
// so Meta Quest gets a wrist-mounted texture using the same real-time position.
const $=id=>document.getElementById(id),v=window.poornaViewer;
if(!v)throw new Error('Poorna viewer not initialized');
const {scene,camera,renderer}=v;
const panel=$('poornaMinimap'),canvas=$('minimapCanvas'),ctx=canvas.getContext('2d',{alpha:false});
const mapTypography=getComputedStyle(panel);
const mapFont=mapTypography.fontFamily;
const mapAccent=mapTypography.getPropertyValue('--accent').trim();
const mapInk=mapTypography.getPropertyValue('--ink').trim();
const mapLabelSize=10;
const mapTitleSize=mapLabelSize*Number(mapTypography.getPropertyValue('--golden-ratio'));
const base=document.createElement('canvas');base.width=256;base.height=256;
const baseCtx=base.getContext('2d',{alpha:false});
const m={size:256,pad:17,minX:-50,maxX:50,minZ:-50,maxZ:50};
let ready=false,time=0,vrPanel=null,vrTexture=null,stereo=false,motion=false,orientation=null;
const marker=new THREE.Vector3(),q=new THREE.Quaternion(),euler=new THREE.Euler(),qfix=new THREE.Quaternion(-Math.sqrt(.5),0,0,Math.sqrt(.5)),qscreen=new THREE.Quaternion(),axis=new THREE.Vector3(0,0,1);
const clear=()=>{baseCtx.fillStyle='#e6e9df';baseCtx.fillRect(0,0,256,256);baseCtx.strokeStyle='#afbaa9';baseCtx.lineWidth=.75;for(let i=0;i<=10;i++){let p=17+i*22.2;baseCtx.beginPath();baseCtx.moveTo(p,17);baseCtx.lineTo(p,239);baseCtx.moveTo(17,p);baseCtx.lineTo(239,p);baseCtx.stroke()}};
function scaleX(x){return m.pad+(x-m.minX)/(m.maxX-m.minX)*(m.size-2*m.pad)}
function scaleZ(z){return m.pad+(m.maxZ-z)/(m.maxZ-m.minZ)*(m.size-2*m.pad)}
function buildBase(){
 const box=v.getBounds(),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const span=Math.max(12,size.x,size.z)*1.15;
 m.minX=center.x-span/2;m.maxX=center.x+span/2;m.minZ=center.z-span/2;m.maxZ=center.z+span/2;
 clear();
 const meshList=[];const root=v.getModel();root.updateMatrixWorld(true);
 root.traverse(o=>{if(o.isMesh&&o.geometry?.getAttribute('position'))meshList.push(o)});
 const triangles=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(const mesh of meshList){
   const pos=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
   const triCount=Math.floor((index?index.count:pos.count)/3);
   const step=Math.max(1,Math.ceil(triCount/Math.max(50,Math.floor(13500/Math.max(1,meshList.length)))));
   for(let t=0;t<triCount;t+=step){
     const n=t*3,ix=k=>index?index.getX(n+k):n+k;
     a.fromBufferAttribute(pos,ix(0)).applyMatrix4(mesh.matrixWorld);
     b.fromBufferAttribute(pos,ix(1)).applyMatrix4(mesh.matrixWorld);
     c.fromBufferAttribute(pos,ix(2)).applyMatrix4(mesh.matrixWorld);
     const area=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
     if(area<.0002)continue;
     const crossY=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
     triangles.push({x:[scaleX(a.x),scaleX(b.x),scaleX(c.x)],z:[scaleZ(a.z),scaleZ(b.z),scaleZ(c.z)],y:(a.y+b.y+c.y)/3,flat:Math.abs(crossY)>area*.65});
   }
 }
 // Paint floor and roof surfaces in approximate elevation order.
 triangles.sort((x,y)=>x.y-y.y);
 for(const t of triangles){
   baseCtx.beginPath();baseCtx.moveTo(t.x[0],t.z[0]);baseCtx.lineTo(t.x[1],t.z[1]);baseCtx.lineTo(t.x[2],t.z[2]);baseCtx.closePath();
   baseCtx.fillStyle=t.flat?'rgba(70,110,88,.29)':'rgba(54,70,62,.42)';
   baseCtx.strokeStyle=t.flat?'rgba(34,65,45,.12)':'rgba(32,55,46,.31)';
   baseCtx.lineWidth=.65;baseCtx.fill();baseCtx.stroke();
 }
 baseCtx.strokeStyle='#263a2f';baseCtx.lineWidth=1;baseCtx.strokeRect(m.pad,m.pad,256-2*m.pad,256-2*m.pad);
 ready=true;panel.hidden=false;
}
function drawPosition(){
 if(!ready)return;
 ctx.drawImage(base,0,0);
 ctx.fillStyle='#263a2f';ctx.font=`700 ${mapTitleSize}px ${mapFont}`;ctx.fillText('POORNA / PLAN',17,14);
 if(renderer.xr.isPresenting)renderer.xr.getCamera(camera).getWorldPosition(marker);
 else camera.getWorldPosition(marker);
 const x=Math.min(247,Math.max(9,scaleX(marker.x))),y=Math.min(247,Math.max(9,scaleZ(marker.z)));
 camera.getWorldDirection(direction);
 if(renderer.xr.isPresenting)renderer.xr.getCamera(camera).getWorldDirection(direction);
 const angle=Math.atan2(direction.x,-direction.z);
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);
 ctx.fillStyle=mapAccent;ctx.strokeStyle=mapInk;ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(7,8);ctx.lineTo(0,4);ctx.lineTo(-7,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
 ctx.fillStyle='#243d31';ctx.font=`700 ${mapLabelSize}px ${mapFont}`;ctx.fillText('YOU',Math.min(222,x+10),Math.max(20,y-12));
 $('minimapLevel').textContent='● ELEV. '+Math.max(0,marker.y-1.7).toFixed(1)+' m';
 if(vrTexture)vrTexture.needsUpdate=true;
}
const direction=new THREE.Vector3();
function modelReady(){try{buildBase();drawPosition()}catch(error){console.error('Minimap geometry:',error);panel.hidden=true}}
$('minimapToggle').addEventListener('click',()=>{
 canvas.classList.toggle('mini-collapsed');
 $('minimapToggle').textContent=canvas.classList.contains('mini-collapsed')?'+':'−';
});
function vrStart(){
 if(!ready)return;
 if(stereo){stereo=false;$('mobileStereoBtn').setAttribute('aria-pressed','false')}
 if(vrPanel){vrPanel.visible=true;return}
 // The wrist card follows the left controller. It is not an HTML element.
 vrTexture=new THREE.CanvasTexture(canvas);vrTexture.colorSpace=THREE.SRGBColorSpace;
 const group=new THREE.Group();group.position.set(0,.11,-.15);group.rotation.x=-.35;
 const backing=new THREE.Mesh(new THREE.PlaneGeometry(.23,.23),new THREE.MeshBasicMaterial({color:0x192821,side:THREE.DoubleSide}));
 backing.position.z=-.002;group.add(backing);
 const card=new THREE.Mesh(new THREE.PlaneGeometry(.215,.215),new THREE.MeshBasicMaterial({map:vrTexture,side:THREE.DoubleSide,depthTest:false}));
 group.add(card);
 renderer.xr.getController(0).add(group);vrPanel=group;
}
function vrEnd(){if(vrPanel)vrPanel.visible=false}
async function enableMotion(){
 if(!v.isLoaded()){v.notice('Load the market model first.');return}
 if(!window.DeviceOrientationEvent){v.notice('Device motion is not available in this browser. Use touch or desktop controls.');return}
 try{
   if(typeof DeviceOrientationEvent.requestPermission==='function'){
     const result=await DeviceOrientationEvent.requestPermission();
     if(result!=='granted'){v.notice('Allow motion permission for the mobile experience.');return}
   }
   motion=!motion;
   if(motion){v.setMode('sky');v.notice('Mobile Motion active. Turn your phone or iPad to look around. Use Sky mode to explore.')}
   $('mobileMotionBtn').setAttribute('aria-pressed',String(motion));
   $('mobileMotionBtn').textContent=motion?'◉ Motion on':'◉ Mobile Motion';
 }catch(error){console.warn(error);v.notice('Motion access was denied. Check browser motion permissions.')}
}
window.addEventListener('deviceorientation',evt=>{
 if(evt.alpha===null||evt.beta===null||evt.gamma===null)return;
 orientation={alpha:evt.alpha,beta:evt.beta,gamma:evt.gamma};
},{passive:true});
$('mobileMotionBtn').addEventListener('click',enableMotion);
$('mobileStereoBtn').addEventListener('click',()=>{
 if(!v.isLoaded()){v.notice('Load the market model first.');return}
 if(renderer.xr.isPresenting){v.notice('Quest 3 already uses true immersive VR.');return}
 stereo=!stereo;
 if(stereo){v.setMode('sky');v.notice('Phone stereo preview active. Best on a landscape phone with a simple stereo viewer. This is not immersive WebXR.')}
 $('mobileStereoBtn').textContent=stereo?'◫ Stereo on':'◫ Phone Stereo';
 $('mobileStereoBtn').setAttribute('aria-pressed',String(stereo));
});
const screenAngle=()=>{const angle=screen.orientation?.angle??window.orientation??0;return (Number(angle)||0)*Math.PI/180};
function updateMotion(){
 if(!motion||!orientation||renderer.xr.isPresenting)return;
 const deg=Math.PI/180;
 euler.set(orientation.beta*deg,orientation.alpha*deg,-orientation.gamma*deg,'YXZ');
 q.setFromEuler(euler).multiply(qfix).multiply(qscreen.setFromAxisAngle(axis,-screenAngle()));
 camera.quaternion.copy(q);
}
// Mobile touch drag moves through the free-fly mode; useful when no keyboard is connected.
let touch=null;
const mount=$('canvasMount');
mount.addEventListener('touchstart',event=>{
 if(!motion&&!stereo)return;
 const t=event.touches[0];if(t)touch={x:t.clientX,y:t.clientY};
},{passive:true});
mount.addEventListener('touchmove',event=>{
 if(!touch||(!motion&&!stereo)||renderer.xr.isPresenting)return;
 const t=event.touches[0];if(!t)return;
 const dx=t.clientX-touch.x,dy=t.clientY-touch.y;touch.x=t.clientX;touch.y=t.clientY;
 const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();
 const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
 camera.position.addScaledVector(right,-dx*.025).addScaledVector(forward,-dy*.025);
 event.preventDefault();
},{passive:false});
mount.addEventListener('touchend',()=>touch=null,{passive:true});
const eyeL=new THREE.PerspectiveCamera(),eyeR=new THREE.PerspectiveCamera(),worldRight=new THREE.Vector3();
function renderStereo(){
 if(!stereo||renderer.xr.isPresenting||!ready)return false;
 const size=renderer.getDrawingBufferSize(new THREE.Vector2()),w=Math.floor(size.x/2),h=size.y;
 const origAspect=camera.aspect;
 camera.updateMatrixWorld(true);
 worldRight.set(1,0,0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
 for(const [eye,sign] of [[eyeL,-1],[eyeR,1]]){
   eye.fov=camera.fov;eye.aspect=w/h;eye.near=camera.near;eye.far=camera.far;
   eye.position.copy(camera.getWorldPosition(new THREE.Vector3())).addScaledVector(worldRight,sign*.032);
   eye.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));eye.updateProjectionMatrix();
 }
 renderer.setScissorTest(true);
 renderer.setViewport(0,0,w,h);renderer.setScissor(0,0,w,h);renderer.render(scene,eyeL);
 renderer.setViewport(w,0,w,h);renderer.setScissor(w,0,w,h);renderer.render(scene,eyeR);
 renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y);
 return true;
}
function tick(dt){
 if(!ready)return;
 updateMotion();
 time+=dt;
 if(time>=.15){time=0;drawPosition()}
 panel.classList.toggle('minimap-vr',renderer.xr.isPresenting);
}
window.poornaNavigation={modelReady,tick,vrStart,vrEnd,renderStereo};
