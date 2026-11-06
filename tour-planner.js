import * as THREE from 'three';
// Local-first interactive tour authoring. No account or database is needed.
// Export the JSON to back up the jury tour and import it on another device.
const $=id=>document.getElementById(id),viewer=window.poornaViewer,ex=window.poornaExhibition;
if(!viewer||!ex)throw new Error('Tour planner requires the 3D viewer and exhibition module');
const UI={panel:$('tourEditor'),toggle:$('tourEditorToggle'),add:$('tourAdd'),
 capture:$('tourCapture'),up:$('tourMoveUp'),down:$('tourMoveDown'),remove:$('tourDelete'),
 select:$('tourStopSelect'),title:$('tourStopTitle'),desc:$('tourStopDesc'),
 save:$('tourSave'),export:$('tourExport'),import:$('tourImport'),status:$('tourEditorStatus')};
const KEY='poorna-market-jury-tour-v2';
let chosen=-1,placing=false;
const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),direction=new THREE.Vector3();
const canvas=$('canvasMount');
const say=message=>{UI.status.textContent=message};
function all(){return ex.getStops()}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({version:2,stops:all()}));say('Saved on this device. Export JSON to back up your tour.')}catch(error){say('Browser storage unavailable. Export JSON to save this tour.')} }
function refresh(prefer=chosen){
 const stops=all();
 UI.select.replaceChildren();
 stops.forEach((item,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=(i+1)+'. '+item.title;UI.select.appendChild(opt)});
 chosen=stops.length?Math.min(Math.max(prefer,0),stops.length-1):-1;
 if(chosen>=0){UI.select.value=String(chosen);UI.title.value=stops[chosen].title;UI.desc.value=stops[chosen].desc}
 else{UI.title.value='';UI.desc.value=''}
 [UI.capture,UI.up,UI.down,UI.remove,UI.save].forEach(b=>b.disabled=chosen<0);
 UI.up.disabled=chosen<=0;UI.down.disabled=chosen<0||chosen>=stops.length-1;
}
function commit(stops,selection=chosen){if(!ex.setTourStops(stops)){say('Tour could not be saved: invalid stop information.');return}refresh(selection);persist()}
function snapshotPose(){
 const position=viewer.camera.getWorldPosition(new THREE.Vector3());
 let target;
 if(viewer.getMode()==='orbit'||viewer.getMode()==='plan')target=viewer.orbit.target.clone();
 else target=position.clone().add(viewer.camera.getWorldDirection(direction).multiplyScalar(12));
 return {position:position.toArray(),target:target.toArray()};
}
function activatePlacement(){
 if(!viewer.isLoaded()){viewer.notice('Load your 3D market model first.');return}
 if(viewer.renderer.xr.isPresenting){viewer.notice('Use the desktop browser to author your tour markers.');return}
 if(placing){placing=false;UI.add.textContent='＋ Place new marker';say('Marker placement canceled.');return}
 viewer.setMode('orbit');ex.pause();placing=true;UI.add.textContent='✕ Cancel placement';
 say('Click the exact spot on the 3D market to place your new marker. You can rotate and zoom first.');
}
UI.add.addEventListener('click',activatePlacement);
canvas.addEventListener('click',event=>{
 if(!placing)return;
 if(!viewer.isLoaded())return;
 const rect=viewer.renderer.domElement.getBoundingClientRect();
 mouse.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height*2-1));
 raycaster.setFromCamera(mouse,viewer.camera);
 const root=viewer.getModel();
 if(!root){say('Model not loaded.');return}
 // Raycast against the actual market meshes rather than the decorative ground.
 const hits=raycaster.intersectObject(root,true);
 if(!hits.length){say('No model surface under the pointer. Click on a visible ramp, floor, wall, or roof.');return}
 const location=hits[0].point;
 const stops=all(),idx=stops.length;
 if(idx>=50){say('Maximum 50 tour stops. Delete an existing stop first.');return}
 const title='Stop '+String(idx+1).padStart(2,'0');
 stops.push({id:'custom-'+Date.now()+'-'+idx,title,desc:'Describe what you want to show the jury here.',label:title,
 note:'This marker was placed by the project author.',anchor:location.toArray(),worldAnchor:true,pose:snapshotPose()});
 placing=false;UI.add.textContent='＋ Place new marker';
 commit(stops,idx);
 say('Marker placed on real model geometry. Edit the stop name and description, then click Save changes.');
});
UI.select.addEventListener('change',()=>{
 chosen=Number(UI.select.value);refresh(chosen);
 if(viewer.isLoaded())ex.goToStop(chosen);
});
UI.save.addEventListener('click',()=>{
 if(chosen<0)return;
 const stops=all(),item=stops[chosen];
 item.title=UI.title.value.trim().slice(0,75)||'Untitled stop';
 item.desc=UI.desc.value.trim().slice(0,500)||'Architectural observation';
 item.label=item.title;item.note=item.desc;
 commit(stops);
 say('Stop title and description saved.');
});
UI.capture.addEventListener('click',()=>{
 if(chosen<0||!viewer.isLoaded()){say('Load the model and select a stop first.');return}
 const stops=all();stops[chosen].pose=snapshotPose();commit(stops);
 say('Current camera view saved for this stop.');
});
function move(offset){
 if(chosen<0)return;
 const stops=all(),to=chosen+offset;if(to<0||to>=stops.length)return;
 [stops[chosen],stops[to]]=[stops[to],stops[chosen]];
 commit(stops,to);say('Tour stop reordered.');
}
UI.up.addEventListener('click',()=>move(-1));
UI.down.addEventListener('click',()=>move(1));
UI.remove.addEventListener('click',()=>{
 if(chosen<0)return;
 const stops=all();stops.splice(chosen,1);commit(stops,chosen);
 say('Tour stop deleted. You can export this updated tour.');
});
UI.toggle.addEventListener('click',()=>{
 UI.panel.hidden=!UI.panel.hidden;
 UI.toggle.setAttribute('aria-expanded',String(!UI.panel.hidden));
 if(UI.panel.hidden&&placing){placing=false;UI.add.textContent='＋ Place new marker'}
 if(!UI.panel.hidden){refresh();say('Use Place new marker, then click your chosen point on the market.')}
});
UI.export.addEventListener('click',()=>{
 const payload=JSON.stringify({format:'poorna-market-tour',version:2,exportedAt:new Date().toISOString(),stops:all()},null,2);
 const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='poorna-market-jury-tour.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 say('Tour exported. Keep the JSON file as a backup and import it on your jury laptop.');
});
UI.import.addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file)return;
 try{
  if(file.size>300000)throw Error('Tour file is too large');
  const data=JSON.parse(await file.text());
  if(!data||!Array.isArray(data.stops)||data.stops.length>50)throw Error('Invalid tour file');
  if(!ex.setTourStops(data.stops))throw Error('Invalid marker data');
  refresh(0);persist();say('Imported '+data.stops.length+' jury tour stops successfully.');
 }catch(error){say('Import failed: '+error.message)}
 finally{UI.import.value=''}
});
try{
 const stored=JSON.parse(localStorage.getItem(KEY)||'null');
 if(stored?.version===2&&Array.isArray(stored.stops)){ex.setTourStops(stored.stops);say('Your saved jury tour has been restored on this device.')}
}catch(error){console.warn('Could not restore tour',error)}
refresh(0);
