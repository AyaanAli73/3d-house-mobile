import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { createTimeOfDayController } from './features/time-of-day.js';
import { createWeatherSystem } from './features/weather.js';

// Device profile is decided before allocating renderer targets and environment geometry.
// Touch-sized viewports use a lean render path while keeping the same materials and scene detail.
const isMobileDevice = window.matchMedia('(max-width: 760px)').matches ||
  (navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 1024px)').matches) ||
  ((navigator.deviceMemory || 8) <= 4);
// Avoid downloading/initializing the desktop post-processing stack on phones.
let Water, EffectComposer, RenderPass, SSAOPass, UnrealBloomPass, OutputPass;
if (!isMobileDevice) {
  const [waterModule, ec, rp, ssao, bloom, output] = await Promise.all([
    import('three/addons/objects/Water.js'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/SSAOPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js')
  ]);
  Water=waterModule.Water; EffectComposer=ec.EffectComposer; RenderPass=rp.RenderPass; SSAOPass=ssao.SSAOPass;
  UnrealBloomPass=bloom.UnrealBloomPass; OutputPass=output.OutputPass;
}
const mount = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog('#b9cbc6', 118, 292);
const sky = new Sky();
sky.name = 'Atmospheric sky';
sky.scale.setScalar(450);
sky.material.uniforms['turbidity'].value = 8.5;
sky.material.uniforms['rayleigh'].value = 2.15;
sky.material.uniforms['mieCoefficient'].value = 0.006;
sky.material.uniforms['mieDirectionalG'].value = 0.82;
sky.material.uniforms['sunPosition'].value.set(-12, 5.5, -28);
scene.add(sky);
const camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 180);
camera.position.set(10.3, 7.25, 12.3);
const renderer = new THREE.WebGLRenderer({antialias:!isMobileDevice, alpha:false, powerPreference:'high-performance', stencil:false, depth:true, preserveDrawingBuffer:false});
let activeMobilePixelRatio = Math.min(devicePixelRatio, 1.28);
let targetMobilePixelRatio = activeMobilePixelRatio;
renderer.setPixelRatio(isMobileDevice ? activeMobilePixelRatio : Math.min(devicePixelRatio, 1.35));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// On phones, render the static shadow map once instead of re-rendering it every frame.
// Time-of-day changes explicitly invalidate it below.
renderer.shadowMap.autoUpdate = !isMobileDevice;
renderer.shadowMap.needsUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.physicallyCorrectLights = true;
renderer.setClearColor('#c8d7d3', 1);
mount.appendChild(renderer.domElement);
// Desktop uses cinematic screen-space passes. Mobile renders the scene directly in one pass.
// Placeholder objects expose the tiny UI surface (enabled/setSize) without allocating render targets.
const composer = isMobileDevice ? null : new EffectComposer(renderer);
let ssaoPass, bloomPass;
if (composer) {
  composer.setPixelRatio(Math.min(devicePixelRatio, 1.0));
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  ssaoPass = new SSAOPass(scene, camera, innerWidth, innerHeight);
  ssaoPass.kernelRadius = 14;
  ssaoPass.minDistance = 0.004;
  ssaoPass.maxDistance = 0.16;
  composer.addPass(ssaoPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.28, 0.94);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
} else {
  ssaoPass = { enabled:false, setSize(){} };
  bloomPass = { enabled:false };
}
// A neutral studio environment gives the physically based materials real soft reflections.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
pmremGenerator.dispose();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = isMobileDevice ? .085 : .065; controls.target.set(0,2.75,0);
controls.minDistance = 6.5; controls.maxDistance = 58; controls.maxPolarAngle = Math.PI*.49;

const hemi = new THREE.HemisphereLight(0xe1efff, 0x4b553b, 0.93); scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, .17); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffdfb0, 2.45); sun.position.set(-18,23,16); sun.castShadow=true; sun.shadow.mapSize.setScalar(isMobileDevice ? 1024 : 2048);
sun.shadow.camera.left=-19; sun.shadow.camera.right=19; sun.shadow.camera.top=19; sun.shadow.camera.bottom=-19; sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias=-0.00022; sun.shadow.normalBias=.018; sun.shadow.radius=4; scene.add(sun);
const fill = new THREE.DirectionalLight(0xc8e4ff, .48); fill.position.set(12,10,-14); scene.add(fill);
const rimLight = new THREE.DirectionalLight(0xfff0d8, .38); rimLight.position.set(0,8,-16); scene.add(rimLight);

const modelRoot = new THREE.Group(); modelRoot.name='Cozy Cottage 3D Model'; scene.add(modelRoot);

// Procedural tile/wood/grass/water textures: no external texture assets are required.
function makeCanvasTexture(paint, size=512, repeat=true){
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');paint(ctx,size);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  if(repeat){texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;}
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),isMobileDevice?4:8);texture.needsUpdate=true;return texture;
}
// A visible solar disc and atmospheric halo complement the physical directional light.
// Both are lightweight sprites, so the sun is visible without a heavy lens-flare pass.
const sunGlowTexture=makeCanvasTexture((ctx,n)=>{
  ctx.clearRect(0,0,n,n);
  const g=ctx.createRadialGradient(n/2,n/2,n*.025,n/2,n/2,n*.5);
  g.addColorStop(0,'rgba(255,251,221,1)');g.addColorStop(.18,'rgba(255,230,159,.92)');
  g.addColorStop(.42,'rgba(255,183,91,.42)');g.addColorStop(.72,'rgba(255,151,75,.12)');g.addColorStop(1,'rgba(255,151,75,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
},256,false);
const sunDiscTexture=makeCanvasTexture((ctx,n)=>{
  ctx.clearRect(0,0,n,n);
  const g=ctx.createRadialGradient(n*.43,n*.40,n*.02,n/2,n/2,n*.47);
  g.addColorStop(0,'#fffde9');g.addColorStop(.58,'#fff0bd');g.addColorStop(.86,'#ffd481');g.addColorStop(1,'rgba(255,193,105,.92)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(n/2,n/2,n*.47,0,Math.PI*2);ctx.fill();
},256,false);
const sunGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:sunGlowTexture,transparent:true,depthWrite:false,depthTest:true,fog:false,toneMapped:false,blending:THREE.AdditiveBlending}));
sunGlow.name='Soft solar halo';sunGlow.scale.set(11.5,11.5,1);scene.add(sunGlow);
const sunDisc=new THREE.Sprite(new THREE.SpriteMaterial({map:sunDiscTexture,transparent:true,depthWrite:false,depthTest:true,fog:false,toneMapped:false}));
sunDisc.name='Visible sun disc';sunDisc.scale.set(2.45,2.45,1);scene.add(sunDisc);
// Softly sculpted cloud sprites are procedural textures arranged beyond the mountain ring.
// The mountain geometry remains crisp; only cloud edges are soft, like real atmospheric clouds.
const cloudTexture=makeCanvasTexture((ctx,n)=>{
  ctx.clearRect(0,0,n,n);
  let seed=82731;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<115;i++){
    const x=n*(.12+rnd()*.76),y=n*(.25+rnd()*.52);
    const rx=n*(.025+rnd()*.085),ry=rx*(.38+rnd()*.62);
    const grad=ctx.createRadialGradient(x,y,rx*.04,x,y,rx);
    const warm=rnd()>.5;
    grad.addColorStop(0,warm?'rgba(255,247,229,.32)':'rgba(246,251,249,.30)');
    grad.addColorStop(.48,warm?'rgba(249,244,233,.20)':'rgba(234,243,243,.19)');
    grad.addColorStop(1,'rgba(230,240,240,0)');
    ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);ctx.translate(-x,-y);
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,rx,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  // Cool shaded lower cloud banks add subtle form without obscuring the ridgeline.
  for(let i=0;i<35;i++){
    const x=n*(.15+rnd()*.7),y=n*(.50+rnd()*.3),rx=n*(.02+rnd()*.06),ry=rx*.44;
    const g=ctx.createRadialGradient(x,y,0,x,y,rx);g.addColorStop(0,'rgba(126,151,154,.12)');g.addColorStop(1,'rgba(126,151,154,0)');
    ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);ctx.translate(-x,-y);ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,rx,0,Math.PI*2);ctx.fill();ctx.restore();
  }
},512,false);
cloudTexture.colorSpace=THREE.SRGBColorSpace;
const skyClouds=new THREE.Group();skyClouds.name='High thin cloud layers';scene.add(skyClouds);
const cloudSprites=[];
for(let i=0;i<15;i++){
  const angle=i/15*Math.PI*2+(i%3)*.11, radius=126+(i%4)*5;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTexture,transparent:true,opacity:.42+(i%4)*.045,depthWrite:false,depthTest:true,fog:false,toneMapped:false}));
  sprite.name='Soft high-altitude cloud';sprite.position.set(Math.sin(angle)*radius,16+(i%5)*3.2,Math.cos(angle)*radius);
  sprite.scale.set(28+(i%4)*8,8+(i%3)*2.2,1);skyClouds.add(sprite);cloudSprites.push({sprite,angle,radius,baseY:sprite.position.y,phase:i*1.37});
}
const clayTexture=makeCanvasTexture((ctx,n)=>{
  const g=ctx.createLinearGradient(0,0,n,n);g.addColorStop(0,'#dc6340');g.addColorStop(.5,'#c84c2d');g.addColorStop(1,'#ee8154');ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
  for(let i=0;i<2800;i++){const x=Math.random()*n,y=Math.random()*n,r=Math.random()*2.8+.25;ctx.fillStyle=Math.random()>.5?'rgba(255,206,162,.12)':'rgba(76,27,18,.09)';ctx.beginPath();ctx.ellipse(x,y,r,r*.45,Math.random(),0,Math.PI*2);ctx.fill();}
  for(let y=22;y<n;y+=48){ctx.strokeStyle='rgba(105,37,24,.18)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(n,y+3);ctx.stroke();}
},256);
const woodTexture=makeCanvasTexture((ctx,n)=>{
  const g=ctx.createLinearGradient(0,0,n,0);g.addColorStop(0,'#75421f');g.addColorStop(.25,'#b7793e');g.addColorStop(.52,'#92572b');g.addColorStop(.8,'#c68a4b');g.addColorStop(1,'#7c4827');ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
  for(let i=0;i<420;i++){const y=Math.random()*n;ctx.strokeStyle=Math.random()>.5?'rgba(54,26,13,.17)':'rgba(255,218,155,.13)';ctx.lineWidth=Math.random()*1.8+.25;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(n*.28,y+(Math.random()-.5)*8,n*.7,y+(Math.random()-.5)*7,n,y+(Math.random()-.5)*3);ctx.stroke();}
},512);
const grassTexture=makeCanvasTexture((ctx,n)=>{
  const base=ctx.createLinearGradient(0,0,n,n);base.addColorStop(0,'#577d3d');base.addColorStop(.48,'#648847');base.addColorStop(1,'#3f6c34');ctx.fillStyle=base;ctx.fillRect(0,0,n,n);
  for(let i=0;i<(isMobileDevice?9000:23000);i++){const x=Math.random()*n,y=Math.random()*n;const palette=['#315b2b','#477237','#719650','#84a85e','#3b652f','#9ab76e','#567f3e'];ctx.strokeStyle=palette[Math.floor(Math.random()*palette.length)];ctx.globalAlpha=.26+Math.random()*.52;ctx.lineWidth=Math.random()*1.25+.35;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(Math.random()-.5)*3.5,y-1-Math.random()*7);ctx.stroke();}ctx.globalAlpha=1;
  for(let i=0;i<260;i++){ctx.fillStyle=i%2?'rgba(28,62,23,.075)':'rgba(180,201,121,.065)';ctx.beginPath();ctx.ellipse(Math.random()*n,Math.random()*n,3+Math.random()*12,2+Math.random()*9,Math.random(),0,Math.PI*2);ctx.fill();}
},512);
const groundSoilTexture=makeCanvasTexture((ctx,n)=>{
  ctx.fillStyle='#6f563a';ctx.fillRect(0,0,n,n);
  for(let i=0;i<5000;i++){ctx.fillStyle=Math.random()>.5?'rgba(210,177,123,.15)':'rgba(31,34,22,.14)';const x=Math.random()*n,y=Math.random()*n;ctx.fillRect(x,y,Math.random()*3+1,Math.random()*2+1);}
},256);
// Periodic, hand-built normal map for the reflective river; its UVs scroll continuously.
function makeWaterNormal(size=256){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    const dx=.45*Math.cos(u*5+Math.sin(v*2)*.6)+.24*Math.cos(u*11-v*2.1)+.17*Math.sin(u*2+v*6);
    const dy=.42*Math.sin(v*4+Math.sin(u*2)*.4)+.22*Math.sin(v*9+u*1.8)+.16*Math.cos(u*6-v*3);
    const k=(y*size+x)*4;data[k]=Math.max(0,Math.min(255,Math.round(128-dx*70)));data[k+1]=Math.max(0,Math.min(255,Math.round(128-dy*70)));data[k+2]=250;data[k+3]=255;
  }
  const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.NoColorSpace;t.needsUpdate=true;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),isMobileDevice?4:8);return t;
}
const waterNormalTexture=makeWaterNormal();waterNormalTexture.repeat.set(1.4,5.5);
const mat = (color, roughness=.78, metalness=0, extra={}) => new THREE.MeshPhysicalMaterial({color, roughness, metalness, clearcoat:.08, clearcoatRoughness:.65, ...extra});
const M = {
  cream:mat('#e7d9c2',.84,0,{bumpMap:groundSoilTexture,bumpScale:.012}), creamLight:mat('#f7e9d2',.82), wood:mat('#965221',.62), woodMid:mat('#b87335',.56,0,{map:woodTexture,bumpMap:woodTexture,bumpScale:.018}), woodDark:mat('#633719',.67,0,{map:woodTexture,bumpMap:woodTexture,bumpScale:.012}), woodLight:mat('#d69a58',.5,0,{map:woodTexture,bumpMap:woodTexture,bumpScale:.012}),
  roof: [mat('#e65330',.75,0,{map:clayTexture,bumpMap:clayTexture,bumpScale:.018}),mat('#ec5d34',.73,0,{map:clayTexture,bumpMap:clayTexture,bumpScale:.018}),mat('#d94a2c',.78,0,{map:clayTexture,bumpMap:clayTexture,bumpScale:.018}),mat('#e85a32',.74,0,{map:clayTexture,bumpMap:clayTexture,bumpScale:.018}),mat('#d34929',.78,0,{map:clayTexture,bumpMap:clayTexture,bumpScale:.018})], roofDark:mat('#88321e',.82), roofEdge:mat('#8b351e',.78),
  stone:mat('#aaa9a1',.92), stoneLight:mat('#cbc8bd',.84), stoneDark:mat('#777b73',.9), mortar:mat('#d9d4c8',.9),
  dirt:mat('#8f5b37'), dirtSide:mat('#74462c'), grass:mat('#75ad32',.95), grass2:mat('#8dbb45',.95), grassDark:mat('#487f32',.95), leaf:[mat('#2f7d3a',.85),mat('#438f3d',.82),mat('#67a942',.8),mat('#86bd4f',.82)], leafDark:mat('#286534',.88),
  soil:mat('#aa764c'), path:mat('#d7ccb3',.95), pathEdge:mat('#a99b81',.9), iron:mat('#4d514d',.32,.55), glass:new THREE.MeshPhysicalMaterial({color:'#ffcf7d',emissive:'#ff9d29',emissiveIntensity:.55,roughness:.16,metalness:.12,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.9}), lamp:new THREE.MeshPhysicalMaterial({color:'#ffc35c',emissive:'#ff981f',emissiveIntensity:2.0,roughness:.2,metalness:.08,clearcoat:.5}),
  white:mat('#fff9eb'), flowerWhite:mat('#fff8dd'), flowerYellow:mat('#f6bf3e',.42), flowerPink:mat('#f3a9a0',.48),
};
const boxGeo = new THREE.BoxGeometry(1,1,1);
const sphereGeo = new THREE.SphereGeometry(1,32,24);
const cylGeo = new THREE.CylinderGeometry(1,1,1,32);
// Optional low, drifting storm clouds appear only while rain is enabled.
const stormClouds=new THREE.Group();stormClouds.name='Rainstorm cloud bank';stormClouds.visible=false;scene.add(stormClouds);
const stormCloudMaterial=new THREE.MeshStandardMaterial({color:'#71858b',roughness:1,transparent:true,opacity:.54,depthWrite:false,flatShading:false});
const stormCloudMotion=[];
for(let i=0;i<8;i++){
  const cloud=new THREE.Group();const baseX=-30+i*8.5,baseZ=-31-(i%3)*6,baseY=14.5+(i%4)*1.55;cloud.position.set(baseX,baseY,baseZ);stormClouds.add(cloud);
  const puffCount=4+(i%3);
  for(let j=0;j<puffCount;j++){
    const puff=new THREE.Mesh(sphereGeo,stormCloudMaterial);puff.position.set((j-(puffCount-1)/2)*1.75,(Math.sin(j*1.7+i)*.28),Math.cos(j*2.1+i)*.42);
    const size=2.1+((i+j*3)%4)*.50;puff.scale.set(size*1.32,size*.64,size*.88);puff.castShadow=false;puff.receiveShadow=false;cloud.add(puff);
  }
  stormCloudMotion.push({group:cloud,x:baseX,z:baseZ,phase:i*1.41});
}
function addMesh(geo, material, parent=modelRoot, name=''){
  const mesh=new THREE.Mesh(geo,material);
  // On mobile the cottage remains the main shadow caster; vegetation and small props do not
  // each enter the shadow pass. The meadow still receives the cottage's static shadow.
  mesh.castShadow = !isMobileDevice || parent === modelRoot;
  mesh.receiveShadow = !isMobileDevice || parent === modelRoot;
  if(name)mesh.name=name;parent.add(mesh);return mesh;
}
function box(name,x,y,z,w,h,d,material,parent=modelRoot){const mesh=addMesh(boxGeo,material,parent,name);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);return mesh;}
function sphere(name,x,y,z,sx,sy,sz,material,parent=modelRoot){const mesh=addMesh(sphereGeo,material,parent,name);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);return mesh;}
function cyl(name,x,y,z,rTop,rBot,h,material,parent=modelRoot,segments=24){const mesh=addMesh(new THREE.CylinderGeometry(rTop,rBot,h,segments),material,parent,name);mesh.position.set(x,y,z);return mesh;}
function roundedShape(w,d,r){const s=new THREE.Shape();const x=w/2,z=d/2;s.moveTo(-x+r,-z);s.lineTo(x-r,-z);s.quadraticCurveTo(x,-z,x,-z+r);s.lineTo(x,z-r);s.quadraticCurveTo(x,z,x-r,z);s.lineTo(-x+r,z);s.quadraticCurveTo(-x,z,-x,z-r);s.lineTo(-x,-z+r);s.quadraticCurveTo(-x,-z,-x+r,-z);return s;}
function archShape(w,h){const r=w/2, spring=h-r;const s=new THREE.Shape();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,spring);s.absarc(0,spring,r,0,Math.PI,false);s.closePath();return s;}
function extrudedShape(name,shape,depth,material,x,y,z,parent=modelRoot,bevel=0){const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSegments:2,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:12});const mesh=addMesh(geo,material,parent,name);mesh.position.set(x,y,z);return mesh;}

// Seamless rolling grassland with a sculpted river channel replacing the old toy-like square island.
const landscapeRoot=new THREE.Group();landscapeRoot.name='Surrounding Meadow and River';scene.add(landscapeRoot);
const smooth01=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
function riverCenterX(z){return 8.25+1.65*Math.sin(z*.105)+.55*Math.sin(z*.265+.6);}
function terrainHeight(x,z){
  // Keep the cottage footprint calm, then sculpt broad rolling hills and small natural rises.
  const extent=Math.max(Math.abs(x),Math.abs(z));
  const blend=smooth01(3.9,13.0,extent);
  const broad=1.15+.42*Math.sin(x*.105+z*.085)+.28*Math.cos(z*.205-x*.155)+.17*Math.sin(x*.37+z*.29)+.10*Math.sin(x*.53-z*.31);
  const hillA=2.10*Math.exp(-(((x+17.0)/7.2)**2+((z+12.5)/9.0)**2));
  const hillB=2.55*Math.exp(-(((x-18.5)/8.8)**2+((z+16.0)/8.4)**2));
  const hillC=1.75*Math.exp(-(((x-23.0)/7.8)**2+((z-13.0)/10.0)**2));
  const hillD=1.20*Math.exp(-(((x+25.0)/7.0)**2+((z-20.0)/8.8)**2));
  const farHills=broad+hillA+hillB+hillC+hillD;
  let h=THREE.MathUtils.lerp(.555,farHills,blend);
  // Lowered, gently sloping channel; the banks rise naturally into the meadow.
  const bankDist=Math.abs(x-riverCenterX(z));
  const channelH=.075+.025*Math.pow(Math.min(1,bankDist/2.0),2);
  const bankBlend=smooth01(1.95,3.35,bankDist);
  h=THREE.MathUtils.lerp(channelH,h,bankBlend);
  return Math.max(.10,h);
}
// Dark subsoil is visible only at the far perimeter; the top is textured and gently rolling.
const subsoil=addMesh(new THREE.PlaneGeometry(160,160),mat('#5c6f3d',1),landscapeRoot,'Meadow underlayer');subsoil.rotation.x=-Math.PI/2;subsoil.position.y=-.28;subsoil.receiveShadow=true;subsoil.castShadow=false;
const terrainGeo=new THREE.BufferGeometry();
const terrainSegments=isMobileDevice?156:220, terrainSize=72, terrainHalf=terrainSize/2;
const terrainPositions=[],terrainUvs=[],terrainIndices=[];
for(let iz=0;iz<=terrainSegments;iz++){
  const z=-terrainHalf+terrainSize*iz/terrainSegments;
  for(let ix=0;ix<=terrainSegments;ix++){
    const x=-terrainHalf+terrainSize*ix/terrainSegments;
    terrainPositions.push(x,terrainHeight(x,z),z);terrainUvs.push(x/4.5,z/4.5);
    if(ix<terrainSegments&&iz<terrainSegments){const a=iz*(terrainSegments+1)+ix,b=a+terrainSegments+1;terrainIndices.push(a,b,a+1,b,b+1,a+1);}
  }
}
terrainGeo.setAttribute('position',new THREE.Float32BufferAttribute(terrainPositions,3));terrainGeo.setAttribute('uv',new THREE.Float32BufferAttribute(terrainUvs,2));terrainGeo.setIndex(terrainIndices);terrainGeo.computeVertexNormals();
const terrainMaterial=new THREE.MeshStandardMaterial({map:grassTexture,color:'#98ad70',roughness:.99,metalness:0,bumpMap:grassTexture,bumpScale:.055});
const terrain=addMesh(terrainGeo,terrainMaterial,landscapeRoot,'Continuous rolling grass meadow');terrain.receiveShadow=true;terrain.castShadow=false;

// Distant layered mountain ridges. Faceted silhouettes are softened by aerial fog,
// and vertex colors fade toward cool blue-gray in the distance.
function addMountainRange(name, radii, maxHeight, palette, phase, segments=288){
  const positions=[], colors=[], indices=[];
  const weights = radii.map((_,i)=>{
    const t=i/(radii.length-1);
    return Math.exp(-Math.pow((t-.48)/.34,2));
  });
  for(let a=0;a<=segments;a++){
    const ang=a/segments*Math.PI*2;
    const n1=.5+.5*Math.sin(ang*3.0+phase), n2=.5+.5*Math.sin(ang*7.0+phase*1.8), n3=.5+.5*Math.cos(ang*13.0-phase);
    const peak=maxHeight*(.08+Math.pow(n1,3.2)*.48+Math.pow(n2,7.5)*.29+Math.pow(n3,10.0)*.20);
    for(let r=0;r<radii.length;r++){
      const radius=radii[r]+Math.sin(ang*5+phase)*.7*(r/(radii.length-1));
      const weight=weights[r];
      const alpineRidge=(r>1&&r<radii.length-2)?(.48*Math.sin(ang*11+phase+r*.8)+.31*Math.sin(ang*17-phase+r*.4)+.14*Math.sin(ang*29+phase*.8)):0;
      const y=.06+peak*weight+alpineRidge*weight;
      positions.push(Math.cos(ang)*radius,y,Math.sin(ang)*radius);
      const altitude=THREE.MathUtils.clamp((y/maxHeight)*.72+n2*.14,0,1);
      const col=new THREE.Color(palette[0]).lerp(new THREE.Color(palette[1]),altitude);
      col.multiplyScalar(.91+n3*.10);colors.push(col.r,col.g,col.b);
      if(a<segments&&r<radii.length-1){const idx=a*radii.length+r, next=(a+1)*radii.length+r;indices.push(idx,next,idx+1,next,next+1,idx+1);}
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:false,roughness:1,metalness:0,side:THREE.DoubleSide,fog:true}));
  mesh.name=name;mesh.frustumCulled=true;mesh.castShadow=false;mesh.receiveShadow=false;landscapeRoot.add(mesh);return mesh;
}
addMountainRange('Layered pine-green foothills',[38,42,46,50,54,58,62,67,72],12.0,['#345b3d','#647e52'],1.3,isMobileDevice?192:288);
addMountainRange('Distant mountain range', [55,61,67,73,79,85,91,98,106,114],24.0,['#435b70','#81989b'],2.7,isMobileDevice?224:336);

// Dense 3-blade grass clumps are instanced as one draw call. A tiny vertex-shader
// bend gives the meadow a soft breeze without updating tens of thousands of matrices.
let meadowSeed=20261010;function meadowRand(){meadowSeed=(meadowSeed*1664525+1013904223)>>>0;return meadowSeed/4294967296;}
function makeGrassClumpGeometry(){
  // Same curved, tapered grass silhouette with fewer vertices on touch devices.
  // Density and ground texture retain the lush look without a giant per-frame vertex workload.
  const positions=[],indices=[];
  const sectionT=isMobileDevice?[0,.38,.74,1]:[0,.22,.48,.76,1];
  const widths=isMobileDevice?[.12,1,.50,.012]:[.16,.72,1,.60,.012],heights=[.86,1,.92,.78];
  const bladeCount=isMobileDevice?3:4;
  for(let blade=0;blade<bladeCount;blade++){
    const angle=blade*(Math.PI*2/bladeCount)+(blade%2)*.31;
    const dirX=Math.cos(angle),dirZ=Math.sin(angle),sideX=-dirZ,sideZ=dirX;
    const base=positions.length/3;
    for(let row=0;row<sectionT.length;row++){
      const t=sectionT[row],bend=.082*t*t;
      const lateral=Math.sin(t*3.2+blade*1.7)*.012*t;
      const cx=dirX*(.02+bend)+sideX*lateral;
      const cz=dirZ*(.02+bend)+sideZ*lateral;
      const cy=t*heights[blade],w=widths[row]*.024;
      positions.push(cx-sideX*w,cy,cz-sideZ*w, cx+sideX*w,cy,cz+sideZ*w);
      if(row<sectionT.length-1){const i=base+row*2,j=i+2;indices.push(i,j,i+1,i+1,j,j+1);}
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
const bladeGeometry=makeGrassClumpGeometry();
const bladeMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.98,flatShading:true,side:THREE.DoubleSide});
bladeMaterial.onBeforeCompile=(shader)=>{
  shader.uniforms.uGrassWindTime={value:0};bladeMaterial.userData.windShader=shader;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uGrassWindTime;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat grassWindWave=sin(uGrassWindTime*1.25+instanceMatrix[3].x*.22+instanceMatrix[3].z*.19+position.y*1.7);\ntransformed.x+=grassWindWave*max(position.y,0.0)*.19;\ntransformed.z+=cos(uGrassWindTime*1.05+instanceMatrix[3].z*.18)*max(position.y,0.0)*.055;');
};
bladeMaterial.customProgramCacheKey=()=> 'cottage-grass-wind-v2';
const grassCount=isMobileDevice?96000:132000;const grassInstances=new THREE.InstancedMesh(bladeGeometry,bladeMaterial,grassCount);grassInstances.name='Dense wind-swaying meadow grass';grassInstances.castShadow=false;grassInstances.receiveShadow=false;grassInstances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
const grassDummy=new THREE.Object3D();let grassPlaced=0,attempts=0;
while(grassPlaced<grassCount&&attempts<grassCount*9){attempts++;const x=-34+meadowRand()*68,z=-34+meadowRand()*68;
  // Preserve a clear building apron and a visible, walkable river channel.
  if(Math.abs(x)<3.95 && z>-3.55 && z<5.10)continue;
  if(Math.abs(x-riverCenterX(z))<2.02)continue;
  if(Math.abs(x)>35||Math.abs(z)>35)continue;
  const y=terrainHeight(x,z),h=.14+meadowRand()*.22;grassDummy.position.set(x,y+.004,z);grassDummy.scale.set(.72+meadowRand()*.48,h,.72+meadowRand()*.48);grassDummy.rotation.set((meadowRand()-.5)*.08,meadowRand()*Math.PI*2,(meadowRand()-.5)*.08);grassDummy.updateMatrix();grassInstances.setMatrixAt(grassPlaced,grassDummy.matrix);grassInstances.setColorAt(grassPlaced,new THREE.Color().setHSL(.245+meadowRand()*.085,.52+meadowRand()*.26,.18+meadowRand()*.19));grassPlaced++;}
grassInstances.count=grassPlaced;landscapeRoot.add(grassInstances);
// Small irregular leafy plants break up the grass field and create denser growth around the river.
const meadowPlantGeo=new THREE.DodecahedronGeometry(1,0);
const meadowPlantMat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.96,flatShading:true});
const meadowPlants=new THREE.InstancedMesh(meadowPlantGeo,meadowPlantMat,620);meadowPlants.name='Scattered low meadow plants';meadowPlants.castShadow=false;meadowPlants.receiveShadow=true;
const plantDummy=new THREE.Object3D();let plantPlaced=0,plantAttempts=0;
while(plantPlaced<620&&plantAttempts<7000){plantAttempts++;const x=-34+meadowRand()*68,z=-34+meadowRand()*68;
  if(Math.abs(x)<4.4&&z>-4.0&&z<5.7)continue;
  if(Math.abs(x-riverCenterX(z))<2.02)continue;
  const y=terrainHeight(x,z),size=.075+meadowRand()*.19;
  plantDummy.position.set(x,y+size*.43,z);plantDummy.scale.set(size*(1.15+meadowRand()*.75),size*(.52+meadowRand()*.32),size*(.9+meadowRand()*.65));plantDummy.rotation.set((meadowRand()-.5)*.45,meadowRand()*Math.PI*2,(meadowRand()-.5)*.45);plantDummy.updateMatrix();meadowPlants.setMatrixAt(plantPlaced,plantDummy.matrix);
  meadowPlants.setColorAt(plantPlaced,new THREE.Color().setHSL(.255+meadowRand()*.075,.40+meadowRand()*.22,.25+meadowRand()*.19));plantPlaced++;}
meadowPlants.count=plantPlaced;landscapeRoot.add(meadowPlants);
// The winding ribbon lies inside its lowered channel. Water.js provides real-time planar reflections and rolling normal-map waves.
const riverGeo=new THREE.BufferGeometry();const riverRows=isMobileDevice?188:360,riverAcross=isMobileDevice?12:22,riverStart=-34,riverEnd=34,riverWidth=3.55;
const riverPositions=[],riverUvs=[],riverIndices=[];
for(let row=0;row<=riverRows;row++){
  const z=riverStart+(riverEnd-riverStart)*row/riverRows,cx=riverCenterX(z);
  for(let col=0;col<=riverAcross;col++){
    const u=col/riverAcross-.5;riverPositions.push(cx+u*riverWidth,-z,0);riverUvs.push(col/riverAcross,row/riverRows*8);
    if(row<riverRows&&col<riverAcross){const a=row*(riverAcross+1)+col,b=a+riverAcross+1;riverIndices.push(a,b,a+1,b,b+1,a+1);}
  }
}
riverGeo.setAttribute('position',new THREE.Float32BufferAttribute(riverPositions,3));riverGeo.setAttribute('uv',new THREE.Float32BufferAttribute(riverUvs,2));riverGeo.setIndex(riverIndices);riverGeo.computeVertexNormals();
const riverBasePositions=riverPositions.slice();
// A dark, submerged riverbed guarantees a visible watercourse even if a browser/GPU
// cannot compile the reflection shader. Under normal rendering it sits beneath the water.
const riverBedGeometry=riverGeo.clone();
const riverBedMaterial=new THREE.MeshPhysicalMaterial({color:'#164c50',roughness:.68,metalness:.025,clearcoat:.16,clearcoatRoughness:.46});
const riverBed=addMesh(riverBedGeometry,riverBedMaterial,landscapeRoot,'Dark riverbed beneath reflective water');
riverBed.rotation.x=-Math.PI/2;riverBed.position.y=.142;riverBed.castShadow=false;riverBed.receiveShadow=false;riverBed.renderOrder=1;
// Water.js renders a second reflected copy of the entire scene every frame. On mobile, use
// a glossy PBR surface with the same scrolling wave-normal map instead: waves/highlights remain,
// but the duplicated 100k-grass render pass is removed. Desktop keeps full planar reflections.
const mobileWaterMaterial = new THREE.MeshPhysicalMaterial({
  color:'#4d9ba5', roughness:.19, metalness:.035, clearcoat:.92, clearcoatRoughness:.12,
  normalMap:waterNormalTexture, normalScale:new THREE.Vector2(.28,.28), envMapIntensity:1.35,
  side:THREE.DoubleSide
});
const river = isMobileDevice
  ? new THREE.Mesh(riverGeo,mobileWaterMaterial)
  : new Water(riverGeo,{textureWidth:1024,textureHeight:1024,waterNormals:waterNormalTexture,sunDirection:sun.position.clone().normalize(),sunColor:0xfff0ce,waterColor:0x105765,distortionScale:3.65,alpha:1,fog:true});
river.name='Reflective flowing river';river.rotation.x=-Math.PI/2;river.position.y=.285;
if(river.material.uniforms?.size)river.material.uniforms.size.value=.74;
river.renderOrder=2;river.castShadow=false;river.receiveShadow=!isMobileDevice;landscapeRoot.add(river);
const timeOfDay = createTimeOfDayController({THREE, scene, sky, sun, sunDisc, sunGlow, hemi, ambient, fill, rimLight, renderer, river});
timeOfDay.set('sunrise');
document.getElementById('timeSelect').addEventListener('change', e=>{timeOfDay.set(e.target.value);sun.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;if(rainEnabled)applyRainAtmosphere(true);toast('Atmosphere: '+e.target.options[e.target.selectedIndex].text);});
// Rounded stones, sedges and little riverbank plants make the shoreline blend into the meadow.
for(let i=0;i<54;i++){
  const z=-31+i*1.22+(meadowRand()-.5)*.45;const side=meadowRand()<.5?-1:1;const x=riverCenterX(z)+side*(2.00+meadowRand()*.55);const y=terrainHeight(x,z);const r=.055+meadowRand()*.105;
  const rock=sphere('Smooth riverbank stone',x,y+r*.33,z,r*1.45,r*.72,r,meadowRand()>.45?M.stoneLight:M.stone,landscapeRoot);rock.rotation.y=meadowRand()*Math.PI;
  if(i%2===0){const gx=x+side*.18;for(let j=0;j<3;j++){const blade=sphere('Riverbank sedge',gx+(meadowRand()-.5)*.11,y+.12+meadowRand()*.06,z+(meadowRand()-.5)*.15,.025,.16,.028,M.grassDark,landscapeRoot);blade.rotation.z=(meadowRand()-.5)*.75;}}
}

// Scattered stones use three irregular faceted silhouettes and per-instance color/scale.
// Instancing keeps hundreds of visible rocks inexpensive to draw.
function makeRockGeometry(seed, detail=1){
  const geo=new THREE.IcosahedronGeometry(1,detail),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const wobble=.78+.16*Math.sin((x*13+seed)*2.7)*Math.cos((z*11-seed)*2.1)+.08*Math.sin(y*17+seed*3.1);
    p.setXYZ(i,x*wobble,y*wobble,z*wobble);
  }
  geo.computeVertexNormals();return geo;
}
const rockGeometries=[makeRockGeometry(1,1),makeRockGeometry(2,1),makeRockGeometry(3,0)];
const rockMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.96,flatShading:true});
for(let variant=0;variant<rockGeometries.length;variant++){
  const count=[210,170,115][variant];
  const fieldRocks=new THREE.InstancedMesh(rockGeometries[variant],rockMaterial,count);fieldRocks.name=['Varied field stones','Angular hillside stones','Small pebbles'][variant];fieldRocks.castShadow=variant!==2;fieldRocks.receiveShadow=true;
  const dummy=new THREE.Object3D();let placed=0,tries=0;
  while(placed<count&&tries<count*10){tries++;const x=-33+meadowRand()*66,z=-33+meadowRand()*66;
    if(Math.hypot(x,z)<4.6)continue;
    if(Math.abs(x-riverCenterX(z))<2.05)continue;
    if(Math.hypot(x+7.4,z+.9)<2.3)continue;
    const y=terrainHeight(x,z),base=[.20,.30,.10][variant],s=base+Math.pow(meadowRand(),1.6)*([.38,.62,.20][variant]);
    dummy.position.set(x,y+s*.34,z);dummy.rotation.set((meadowRand()-.5)*.6,meadowRand()*Math.PI*2,(meadowRand()-.5)*.55);
    dummy.scale.set(s*(.8+meadowRand()*.9),s*(.55+meadowRand()*.68),s*(.65+meadowRand()*.9));dummy.updateMatrix();fieldRocks.setMatrixAt(placed,dummy.matrix);
    const moss=meadowRand();const color=new THREE.Color().setHSL(.085+meadowRand()*.10,.055+meadowRand()*.12,.31+moss*.24);fieldRocks.setColorAt(placed,color);placed++;
  }
  fieldRocks.count=placed;landscapeRoot.add(fieldRocks);
}

// Small moving leaves ride the water current; their position and bobbing stay synchronized with the flow.
const floaters=[];
for(let i=0;i<11;i++){
  const g=new THREE.Group();g.name='Floating leaf';
  const leaf=sphere('River leaf',0,0,0,.105,.018,.052,M.leaf[i%M.leaf.length],g);leaf.rotation.y=(i%3)*.34;
  const stem=box('Leaf stem',0,.006,0,.006,.006,.085,M.leafDark,g);stem.rotation.x=.12;
  const z=-28+i*5.15,x=riverCenterX(z)+(meadowRand()-.5)*.75;g.position.set(x,.24,z);landscapeRoot.add(g);floaters.push({group:g,seed:meadowRand()*6.28,start:z,offset:x-riverCenterX(z)});
}
// Low-poly trees inspired by the supplied reference: curved terracotta-brown trunks,
// branching limbs and individually shaded angular foliage clusters. Instanced leaves keep it performant.
const treeTrunk=new THREE.MeshStandardMaterial({color:'#a95738',roughness:.9,flatShading:true});
const treeBranchDark=new THREE.MeshStandardMaterial({color:'#7c432e',roughness:.92,flatShading:true});
const treeFoliageGeos=[new THREE.IcosahedronGeometry(1,0),new THREE.DodecahedronGeometry(1,0),new THREE.IcosahedronGeometry(1,1)];
const treeFoliageGeo=treeFoliageGeos[0];
function makePointedLeafGeometry(){
  const pos=[],idx=[];const rows=[0,.16,.38,.63,.84,1],widths=[.012,.095,.17,.145,.072,.002];
  for(let r=0;r<rows.length;r++){
    const t=rows[r],w=widths[r],z=.022*Math.sin(Math.PI*t);
    pos.push(-w,t,z*.25,0,t,z, w,t,z*.25);
    if(r<rows.length-1){const a=r*3,b=a+3;idx.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
const treeLeafGeo=makePointedLeafGeometry();
const treeLeafMat=new THREE.MeshStandardMaterial({color:'#729e4e',emissive:'#061003',emissiveIntensity:.018,roughness:.91,metalness:0,side:THREE.DoubleSide});
let treeVariantCounter=0;
const treeFoliageMat=new THREE.MeshStandardMaterial({color:'#4f7e38',emissive:'#030901',emissiveIntensity:.012,roughness:.94,flatShading:false,vertexColors:false,side:THREE.DoubleSide});
const windTrees=[];
function taperedBranch(points,radii,parent,material,name,sides=7){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],p[2])),false,'catmullrom',.35);
  const steps=Math.max(14,points.length*5),frames=curve.computeFrenetFrames(steps,false),verts=[],indices=[];
  for(let i=0;i<=steps;i++){
    const t=i/steps,rv=t*(radii.length-1),ri=Math.min(radii.length-2,Math.floor(rv)),f=rv-ri;
    const radius=THREE.MathUtils.lerp(radii[ri],radii[Math.min(ri+1,radii.length-1)],f);
    const center=curve.getPointAt(t),normal=frames.normals[i],binormal=frames.binormals[i];
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI*2;
      const p=center.clone().addScaledVector(normal,Math.cos(a)*radius).addScaledVector(binormal,Math.sin(a)*radius);
      verts.push(p.x,p.y,p.z);
      if(i<steps&&j<sides){const a0=i*(sides+1)+j,b0=a0+sides+1;indices.push(a0,b0,a0+1,b0,b0+1,a0+1);}
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();
  const mesh=addMesh(geo,material,parent,name);return mesh;
}
function makeTree(x,z,scale=1){
  const form=treeVariantCounter++%5;
  const widthFactor=[.84,1.12,.96,1.23,.90][form],heightFactor=[1.10,.96,1.18,.90,1.05][form];
  const y=terrainHeight(x,z),g=new THREE.Group();g.name='Varied wind-swaying low-poly tree';g.position.set(x,y,z);g.scale.set(scale*widthFactor,scale*heightFactor,scale*widthFactor);landscapeRoot.add(g);
  taperedBranch([[0,0,0],[-.12,.72,.02],[-.37,1.5,.12],[-.43,2.25,.1],[-.24,2.96,.04],[.08,3.62,-.02],[-.08,4.35,-.06],[-.39,5.08,-.12],[-.64,5.75,-.16]],[.27,.235,.20,.16,.13,.105,.08,.048,.008],g,treeTrunk,'Curved main trunk',8);
  const branches=[
    [[[-.40,2.13,.10],[-.79,2.52,.15],[-1.12,2.98,.18],[-1.52,3.19,.19]],[.145,.115,.065,.009]],
    [[[-.28,2.72,.08],[.27,3.01,.08],[.68,3.44,.12],[1.02,3.63,.10]],[.13,.095,.05,.008]],
    [[[-.13,3.39,.00],[-.52,3.84,-.03],[-.78,4.32,-.08],[-1.14,4.60,-.12]],[.115,.09,.052,.008]],
    [[[.00,3.86,-.03],[.43,4.22,-.06],[.82,4.64,-.11],[1.20,4.83,-.15]],[.105,.078,.045,.007]],
    [[[-.24,4.55,-.09],[-.54,4.92,-.10],[-.88,5.28,-.15],[-.95,5.66,-.18]],[.085,.06,.035,.006]],
    [[[-.30,4.93,-.12],[.08,5.28,-.14],[.36,5.72,-.17],[.60,6.13,-.19]],[.08,.06,.034,.005]],
    [[[-.05,3.65,.00],[-.15,4.10,.42],[-.33,4.43,.74],[-.46,4.62,.93]],[.085,.06,.032,.005]],
    [[[-.08,4.24,-.04],[.20,4.61,-.43],[.48,4.92,-.76],[.62,5.18,-.91]],[.075,.052,.03,.005]]
  ];
  branches.forEach((b,i)=>taperedBranch(b[0],b[1],g,i%3===0?treeTrunk:treeBranchDark,'Angular tree branch '+(i+1),6));
  const treeVariant=form%treeFoliageGeos.length;
  const count=13+(form%3)*3,foliage=new THREE.InstancedMesh(treeFoliageGeos[treeVariant],treeFoliageMat,count);foliage.name='Faceted low-poly leaf crown';foliage.castShadow=false;foliage.receiveShadow=false;
  const dummy=new THREE.Object3D();
  for(let i=0;i<count;i++){
    const a=meadowRand()*Math.PI*2,ty=meadowRand(),yLeaf=3.20+ty*(form%2===0?2.55:3.12);
    const profile=[.74,.96,.86,1.08,.82][form]+Math.sin(ty*Math.PI)*.27;
    const radius=Math.sqrt(meadowRand())*profile;
    const px=Math.cos(a)*radius, pz=Math.sin(a)*radius*.78;
    const size=.22+meadowRand()*.17;
    dummy.position.set(px,yLeaf,pz);dummy.rotation.set(meadowRand()*1.2,meadowRand()*Math.PI*2,meadowRand()*1.2);
    dummy.scale.set(size*(.82+meadowRand()*.32),size*(.83+meadowRand()*.40),size*(.80+meadowRand()*.38));dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);
    const green=new THREE.Color().setHSL(.255+meadowRand()*.065,.43+meadowRand()*.24,.26+meadowRand()*.18);foliage.setColorAt(i,green);
  }
  foliage.receiveShadow=false;
  g.add(foliage);
  // Individual lance-shaped leaves layered over the crown make the tree read as leafy,
  // while one instanced draw call per tree keeps the foliage inexpensive.
  const leafCount=290+(form%3)*70,leafMesh=new THREE.InstancedMesh(treeLeafGeo,treeLeafMat,leafCount);
  leafMesh.name='Individual green leaves';leafMesh.castShadow=false;leafMesh.receiveShadow=false;
  for(let i=0;i<leafCount;i++){
    const a=meadowRand()*Math.PI*2,ty=meadowRand();
    const canopyY=3.10+ty*(form%2===0?2.82:3.12);
    const canopyR=([.74,.96,.86,1.08,.82][form]+Math.sin(ty*Math.PI)*.27)*Math.sqrt(meadowRand());
    const px=Math.cos(a)*canopyR,pz=Math.sin(a)*canopyR*.80;
    const size=.24+meadowRand()*.22;
    dummy.position.set(px,canopyY+(meadowRand()-.5)*.30,pz);
    dummy.rotation.set((meadowRand()-.5)*1.8, a+(meadowRand()-.5)*1.5, (meadowRand()-.5)*2.4);
    dummy.scale.set(size*.92,size,size*.32);dummy.updateMatrix();leafMesh.setMatrixAt(i,dummy.matrix);
    const leafColor=new THREE.Color().setHSL(.255+meadowRand()*.07,.46+meadowRand()*.26,.24+meadowRand()*.20);leafMesh.setColorAt(i,leafColor);
  }
  g.add(leafMesh);
  windTrees.push({group:g,phase:meadowRand()*Math.PI*2,amount:.004+scale*.003});
}
// A larger signature tree sits left of the cottage; other trees frame the meadow and river.
for(const [x,z,sc] of [[-7.4,-.9,1.10],[-13,-15,1.12],[-17,-4,1.30],[-14,10,.98],[-8,19,1.03],[15,-18,1.05],[17,-8,1.28],[15,8,1.05],[17,19,.96],[2,-21,.90],[-20,19,1.10],[23,1,1.08],[-25,-12,1.15],[27,-16,1.32],[-28,5,.90],[29,12,1.08],[0,27,1.18],[-8.5,-10.5,.80],[-10,-18,.86],[-17,-20,.92],[-19,-14,.78],[19,-24,1.03],[25,-25,.90],[-25,24,.84],[24,22,.88],[28,21,.75]])makeTree(x,z,sc);
// A richer flower field is instanced to keep draw calls down, with varied flower colors and heights.
const meadowFlowerGeo=new THREE.IcosahedronGeometry(1,0);
const meadowFlowerMat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.72,flatShading:true});
const meadowFlowerCount=isMobileDevice?760:1050;const meadowFlowers=new THREE.InstancedMesh(meadowFlowerGeo,meadowFlowerMat,meadowFlowerCount);meadowFlowers.name='Instanced meadow wildflowers';meadowFlowers.castShadow=false;meadowFlowers.receiveShadow=true;
const flowerDummy=new THREE.Object3D();let flowerPlaced=0,flowerAttempts=0;
while(flowerPlaced<meadowFlowerCount&&flowerAttempts<9500){flowerAttempts++;const x=-34+meadowRand()*68,z=-34+meadowRand()*68;
  if(Math.max(Math.abs(x),Math.abs(z))<5.3||Math.abs(x-riverCenterX(z))<2.2)continue;
  if(Math.abs(x)<4.1&&z>-3.8&&z<5.5)continue;
  const y=terrainHeight(x,z),size=.022+meadowRand()*.035;
  flowerDummy.position.set(x,y+.055,z);flowerDummy.scale.set(size,size*(.55+meadowRand()*.3),size);flowerDummy.rotation.set(meadowRand()*.5,meadowRand()*Math.PI*2,meadowRand()*.5);flowerDummy.updateMatrix();meadowFlowers.setMatrixAt(flowerPlaced,flowerDummy.matrix);
  const palettes=['#fff0cc','#f4bf56','#e5a9a3','#f1e8dc','#d8c5ed'];meadowFlowers.setColorAt(flowerPlaced,new THREE.Color(palettes[Math.floor(meadowRand()*palettes.length)]));flowerPlaced++;}
meadowFlowers.count=flowerPlaced;landscapeRoot.add(meadowFlowers);
// Keep the original little lawn-colour mottling around the cottage itself.
for(let i=0;i<28;i++){
  const x=(Math.sin(i*12.31)*3.4), z=(Math.cos(i*7.17)*3.45);
  const patch=sphere('Grass colour variation',x,.566,z,.34+((i%3)*.1),.012,.24+(i%4)*.05,i%2?M.grass2:M.grassDark);
  patch.castShadow=false;
}

// Main body and its two visible gable ends.
const wallFront=1.91, wallBack=-1.91, wallBottom=.57, eaveY=3.32, peakY=5.48;
box('Main cream walls',0,(wallBottom+eaveY)/2,0,4.48,eaveY-wallBottom,3.82,M.cream);
const gableShape=new THREE.Shape();gableShape.moveTo(-2.24,0);gableShape.lineTo(2.24,0);gableShape.lineTo(0,2.16);gableShape.closePath();
extrudedShape('Front triangular gable',gableShape,.10,M.cream,-0,eaveY,wallFront-.025);
const backGable=extrudedShape('Rear triangular gable',gableShape,.10,M.cream,0,eaveY,wallBack-.075);backGable.rotation.y=Math.PI;
// Stone foundation on front and right/left elevations.
box('Front foundation backing',0,.79,1.96,4.5,.44,.18,M.stoneDark);
for(let row=0;row<2;row++)for(let col=0;col<12;col++){
  const w=.355+(col%3)*.015;const x=-2.12+col*.386+(row%2)*.15;
  box('Front stone block',x,.635+row*.22,2.065,w,.185,.09,(col+row)%4===0?M.stoneLight:M.stone);
}
for(const side of [-1,1]){
  box('Side foundation backing',side*2.255,.79,0,.18,.44,3.82,M.stoneDark);
  for(let row=0;row<2;row++)for(let col=0;col<10;col++){
    box('Side stone block',side*2.34,.635+row*.22,-1.72+col*.38+(row%2)*.16,.09,.185,.35,(row+col)%4===0?M.stoneLight:M.stone);
  }
}
// Horizontal cream trim and dark wood corner boards.
box('Front wall lower trim',0,1.02,1.975,4.55,.09,.10,M.creamLight);
for(const x of [-2.18,2.18]) box('Front corner timber',x,2.05,1.96,.11,2.48,.09,M.woodMid);
for(const z of [-1.82,1.82]) for(const x of [-2.19,2.19]) box('Corner timber returns',x,2.05,z,.09,2.45,.10,M.woodMid);

// Main gabled roof backing, with a slight eave overhang.
const halfRoof=2.72, roofPeak=5.57, roofEave=3.22;const slopeLen=Math.hypot(halfRoof,roofPeak-roofEave);const roofAngle=Math.atan2(roofPeak-roofEave,halfRoof);const roofDepth=4.48;
for(const side of [-1,1]){
  const panel=box('Main roof plane',side*halfRoof/2,(roofPeak+roofEave)/2,0,slopeLen,.15,roofDepth,M.roofDark);
  panel.rotation.z=side===1?-roofAngle:roofAngle;
  // Individual staggered clay tiles, all real meshes so the roof reads as modeled geometry.
  const tileGeo=new RoundedBoxGeometry(.345,.064,.278,3,.018);
  let row=0;
  for(let u=.15;u<slopeLen-.035;u+=.315,row++){
    const zShift=(row%2)*.135;
    for(let z=-2.12+zShift;z<=2.12;z+=.285){
      const tile=addMesh(tileGeo,M.roof[(row*3+Math.round((z+2.12)*10))%M.roof.length],modelRoot,'Terracotta roof tile');
      const x=side*u*Math.cos(roofAngle)+side*Math.sin(roofAngle)*.105;
      const y=roofPeak-u*Math.sin(roofAngle)+Math.cos(roofAngle)*.105;
      tile.position.set(x,y,z);tile.rotation.z=side===1?-roofAngle:-Math.PI+roofAngle;
    }
  }
  // Dark timber fascia and roof edge under the tile courses.
  const fascia=box('Roof eave fascia',side*2.70,3.19,0,.17,.19,4.62,M.woodDark);fascia.rotation.z=side===1?-.02:.02;
}
// Ridge cap and end trim.
const ridge=cyl('Roof ridge cap',0,5.60,0,.115,.115,4.65,M.roof[2],modelRoot,10);ridge.rotation.x=Math.PI/2;
for(const z of [-2.23,2.23]){
  // Verge boards run exactly from the ridge to each eave. Their long axis is Y,
  // so rotate by the complement of the roof angle (not by the roof angle itself).
  for(const side of [-1,1]){
    const trim=box('Sloped roof verge',side*halfRoof/2,(roofPeak+roofEave)/2,z,.105,slopeLen,.105,M.woodMid);
    trim.rotation.z=side*(Math.PI/2-roofAngle);
  }
}

// Porch floor and front canopy. Roof shingles run down the slope toward the front.
box('Porch timber deck',0,.78,2.55,4.26,.18,1.46,M.woodMid);
for(let i=0;i<17;i++)box('Deck board',-2.0+i*.25,.878,2.55,.018,.018,1.36,M.woodDark);
const porchAngle=.23, porchSlope=1.72;
const canopy=box('Porch roof slab',0,3.34,2.64,5.42,.14,porchSlope,M.roofDark);canopy.rotation.x=porchAngle;
const porchTileGeo=new RoundedBoxGeometry(.295,.052,.245,3,.015);
for(let row=0;row<7;row++){
  const z=1.86+row*.235;
  for(let col=0;col<18;col++){
    const x=-2.52+col*.295+(row%2)*.04;
    const y=3.43-(z-2.62)*Math.sin(porchAngle)+.075;
    const t=addMesh(porchTileGeo,M.roof[(row+col*2)%M.roof.length],modelRoot,'Porch canopy tile');t.position.set(x,y,z);t.rotation.x=porchAngle;
  }
}
box('Porch front fascia',0,3.08,3.47,5.48,.19,.13,M.woodDark);
box('Porch rear fascia',0,3.43,1.80,5.45,.15,.12,M.woodMid);
// Turned wooden support posts with blocky stone plinths and capitals.
for(const x of [-2.18,-1.0,1.0,2.18]){
  box('Porch post stone foot',x,.99,3.17,.27,.28,.27,M.stoneLight);
  box('Porch timber column',x,2.13,3.17,.16,2.05,.16,M.woodMid);
  box('Post base collar',x,1.12,3.17,.205,.09,.205,M.woodDark);
  box('Post capital',x,3.13,3.17,.24,.14,.24,M.woodLight);
}
// Railings deliberately leave a wide central opening for the front steps.
for(const side of [-1,1]){
  const xMid=side*1.62;
  box('Porch railing top',xMid,1.42,3.15,1.06,.105,.10,M.woodMid);
  box('Porch railing bottom',xMid,1.02,3.15,1.06,.09,.10,M.woodDark);
  for(let k=0;k<5;k++)box('Porch railing spindle',xMid-.43+k*.215,1.22,3.15,.055,.36,.06,M.woodLight);
  box('Porch side handrail',side*2.26,1.42,2.55,.1,.10,1.12,M.woodMid);
  for(let k=0;k<4;k++)box('Side railing spindle',side*2.26,1.22,2.1+k*.29,.06,.36,.06,M.woodLight);
}
// Stone steps rising to the covered porch.
for(let i=0;i<4;i++){
  const z=2.86+i*.20;const y=.78-i*.07;
  const step=box('Front stone step',0,y,z,1.7-i*.12,.20,.34,M.stoneLight);
  box('Step front nosing',0,y-.055,z+.155,1.72-i*.12,.055,.035,M.white);
}

// Window builders: wooden frame, glowing glazing, cross-bars, shutters, sill and optional flower box.
function frontWindow(name,x,bottom,z,w,h,{shutters=true,flowers=false,arched=false}={}){
  const frame=.085;const outerW=w+.17, outerH=h+.12;
  if(arched){
    const outer=archShape(outerW,outerH);extrudedShape(name+' arched outer frame',outer,.075,M.woodMid,x,bottom,z);
    const inner=archShape(w,h);extrudedShape(name+' glowing arched glass',inner,.025,M.glass,x,bottom+.055,z+.078);
    // Vertical and horizontal glazing muntins.
    box(name+' vertical muntin',x,bottom+.055+h*.45,z+.115,.045,h*.73,.025,M.woodDark);
    box(name+' horizontal muntin',x,bottom+.055+h*.48,z+.12,w,.045,.03,M.woodDark);
    box(name+' sill',x,bottom+.01,z+.10,w+.22,.10,.18,M.woodMid);
    if(shutters) for(const side of [-1,1]){
      box(name+' shutter',x+side*(w/2+.105),bottom+h*.48,z+.055,.16,h*.70,.09,M.woodMid);
      for(let k=0;k<5;k++)box(name+' shutter slat',x+side*(w/2+.105),bottom+.20+k*(h*.105),z+.108,.145,.027,.018,M.woodLight);
    }
  } else {
    box(name+' glazing',x,bottom+h/2,z+.065,w,h,.045,M.glass);
    // Outer jambs and lintel.
    box(name+' left jamb',x-w/2-frame/2,bottom+h/2,z+.105,frame,h+.13,.12,M.woodMid);
    box(name+' right jamb',x+w/2+frame/2,bottom+h/2,z+.105,frame,h+.13,.12,M.woodMid);
    box(name+' head trim',x,bottom+h+.06,z+.105,w+.22,frame,.12,M.woodMid);
    box(name+' sill',x,bottom-.05,z+.13,w+.28,.13,.2,M.woodLight);
    box(name+' center vertical muntin',x,bottom+h/2,z+.13,.045,h,.04,M.woodDark);
    box(name+' center horizontal muntin',x,bottom+h/2,z+.135,w,.045,.04,M.woodDark);
    if(shutters)for(const side of [-1,1]){
      box(name+' shutter',x+side*(w/2+.14),bottom+h/2,z+.06,.19,h+.02,.10,M.woodMid);
      for(let k=0;k<5;k++)box(name+' shutter slat',x+side*(w/2+.14),bottom+.12+k*((h-.24)/4),z+.118,.17,.035,.025,M.woodLight);
    }
  }
  if(flowers){
    box(name+' flower box',x,bottom-.18,z+.19,w+.22,.16,.23,M.woodDark);
    for(let k=0;k<7;k++){
      const fx=x-w*.43+k*(w*.143);sphere(name+' planter leaf',fx,bottom-.095,z+.22,.10,.09,.085,M.leaf[k%M.leaf.length]);
      flower(name+' planter bloom',fx,bottom-.035,z+.25,k%3===0?M.flowerYellow:M.flowerWhite,.055);
    }
  }
}
function flower(name,x,y,z,material,size=.06){
  sphere(name+' center',x,y,z,size*.35,size*.35,size*.35,M.flowerYellow);
  for(let p=0;p<5;p++){const a=p*Math.PI*2/5;sphere(name+' petal',x+Math.cos(a)*size*.68,y+Math.sin(a)*size*.55,z+.006,size*.48,size*.36,size*.27,material);}
}
// Arched timber front door and panel detailing.
const doorX=0, doorBottom=.79, doorZ=2.035;
extrudedShape('Door arch surround',archShape(.99,1.77),.10,M.woodDark,doorX,doorBottom-.03,doorZ);
extrudedShape('Warm arched front door',archShape(.82,1.62),.075,M.woodMid,doorX,doorBottom+.035,doorZ+.085);
// carved door planks / panels
for(let i=-2;i<=2;i++)box('Door vertical board',i*.125,doorBottom+.69,doorZ+.17,.018,1.27,.018,M.woodDark);
box('Door lower inset panel',0,doorBottom+.40,doorZ+.18,.48,.48,.025,M.woodDark);
box('Door inner raised panel',0,doorBottom+.40,doorZ+.195,.40,.39,.02,M.woodMid);
box('Door upper inset panel',0,doorBottom+1.13,doorZ+.18,.48,.42,.025,M.woodDark);
box('Door upper raised panel',0,doorBottom+1.13,doorZ+.195,.40,.33,.02,M.woodMid);
sphere('Brass door knob',.255,doorBottom+.82,doorZ+.225,.065,.065,.035,mat('#e5bd62',.3,.55));
// Threshold and porch lights.
box('Door threshold',0,.81,2.16,1.05,.09,.22,M.stoneLight);
function lantern(x,y,z,name){
  box(name+' wall bracket',x,y-.06,z,.08,.12,.12,M.iron);
  box(name+' lantern cap',x,y+.13,z,.22,.07,.19,M.woodDark);
  box(name+' glowing glass',x,y,z,.135,.21,.12,M.lamp);
  box(name+' base',x,y-.13,z,.19,.045,.16,M.iron);
  for(const dx of [-.08,.08])box(name+' lantern rails',x+dx,y,z+.066,.018,.20,.02,M.iron);
}
lantern(-.78,2.00,2.08,'Left front lantern');lantern(.78,2.00,2.08,'Right front lantern');
// The main front windows and upper gable window.
frontWindow('Front left window',-1.42,1.65,1.99,.65,.88,{shutters:true,flowers:false});
frontWindow('Gable arched window',0,4.10,2.005,.75,.92,{shutters:true,flowers:true,arched:true});

// Small gabled dormer mounted into the RIGHT roof pitch. Its gable faces +X,
// so it reads as a side-roof dormer in the hero view instead of colliding with
// the front gable and sending roof trim through the sky.
const dormer=new THREE.Group();dormer.name='Right-side roof dormer';dormer.position.set(1.18,0,.05);dormer.rotation.y=Math.PI/2;modelRoot.add(dormer);
const dormerPeak=5.27,dormerEave=4.78,dormerHalf=.66;
const dormerAngle=Math.atan2(dormerPeak-dormerEave,dormerHalf);
const dormerLen=Math.hypot(dormerHalf,dormerPeak-dormerEave);
box('Dormer cream body',0,4.41,0,1.06,.76,1.00,M.creamLight,dormer);
const dormerGableShape=new THREE.Shape();dormerGableShape.moveTo(-.55,0);dormerGableShape.lineTo(.55,0);dormerGableShape.lineTo(0,.50);dormerGableShape.closePath();
extrudedShape('Dormer front gable',dormerGableShape,.075,M.creamLight,0,4.77,.505,dormer);
for(const side of [-1,1]){
  const p=box('Dormer roof plane',side*dormerHalf/2,(dormerPeak+dormerEave)/2,0,dormerLen,.09,1.28,M.roofDark,dormer);
  p.rotation.z=side===1?-dormerAngle:dormerAngle;
  const tileG=new RoundedBoxGeometry(.285,.044,.205,3,.013);
  let row=0;
  for(let u=.10;u<dormerLen-.015;u+=.245,row++){
    for(let z=-.57+(row%2)*.08;z<=.57;z+=.215){
      const tile=addMesh(tileG,M.roof[(row+Math.round((z+.57)*10))%M.roof.length],dormer,'Dormer clay tile');
      tile.position.set(side*u*Math.cos(dormerAngle)+side*Math.sin(dormerAngle)*.06,dormerPeak-u*Math.sin(dormerAngle)+Math.cos(dormerAngle)*.06,z);
      tile.rotation.z=side===1?-dormerAngle:-Math.PI+dormerAngle;
    }
  }
}
const dormerRidge=cyl('Dormer ridge cap',0,5.285,0,.055,.055,1.34,M.roof[2],dormer,8);dormerRidge.rotation.x=Math.PI/2;
// Small warm window, timber surround and flower box on the dormer's outward-facing gable.
box('Dormer glowing window',0,4.57,.588,.40,.36,.045,M.glass,dormer);
box('Dormer left jamb',-.235,4.57,.625,.055,.43,.09,M.woodMid,dormer);
box('Dormer right jamb',.235,4.57,.625,.055,.43,.09,M.woodMid,dormer);
box('Dormer window header',0,4.79,.625,.53,.055,.09,M.woodMid,dormer);
box('Dormer window sill',0,4.36,.65,.58,.075,.14,M.woodLight,dormer);
box('Dormer vertical muntin',0,4.57,.635,.032,.35,.025,M.woodDark,dormer);
box('Dormer horizontal muntin',0,4.57,.637,.39,.032,.025,M.woodDark,dormer);
box('Dormer flower box',0,4.32,.67,.54,.11,.16,M.woodDark,dormer);
for(let i=0;i<5;i++){
  const fx=-.20+i*.10;
  sphere('Dormer planter leaves',fx,4.39,.69,.065,.055,.05,M.leaf[i%M.leaf.length],dormer);
  sphere('Dormer flower',fx,4.425,.70,.025,.023,.022,i%2?M.flowerWhite:M.flowerYellow,dormer);
}

// Side window facing the viewer's right (+X), with timber trim and warm glass.
function sideWindow(name,x,y,z,w,h){
  const side=Math.sign(x)||1;
  box(name+' glowing glass',x+side*.055,y,z,.045,h,w,M.glass);
  box(name+' left frame',x+side*.10,y,z-w/2-.045,.11,h+.12,.10,M.woodMid);
  box(name+' right frame',x+side*.10,y,z+w/2+.045,.11,h+.12,.10,M.woodMid);
  box(name+' top frame',x+side*.10,y+h/2+.045,z,.11,.09,w+.20,M.woodMid);
  box(name+' bottom sill',x+side*.13,y-h/2-.04,z,.17,.12,w+.25,M.woodLight);
  box(name+' vertical muntin',x+side*.12,y,z,.05,h,.045,M.woodDark);
  box(name+' horizontal muntin',x+side*.12,y,z,.05,.045,w,M.woodDark);
  box(name+' shutter A',x+side*.055,y,z-w/2-.14,.10,h,.14,M.woodMid);
  box(name+' shutter B',x+side*.055,y,z+w/2+.14,.10,h,.14,M.woodMid);
}
sideWindow('Right cottage window',2.255,2.12,.25,.80,.94);
// Secondary smaller window on the left side.
sideWindow('Left cottage window',-2.255,2.1,-.30,.62,.78);

// Chimney: individual warm bricks and projecting cap.
box('Chimney mortar core',1.58,5.02,-.55,.49,1.62,.52,M.stoneDark);
const brickColors=[mat('#a94f31'),mat('#ba6138'),mat('#8e492e'),mat('#c27446')];
for(let row=0;row<5;row++){
  const yy=4.38+row*.285;
  for(let col=0;col<2;col++){
    box('Chimney front brick',1.45+col*.23+(row%2)*.045,yy,-.273,.215,.19,.035,brickColors[(row+col)%brickColors.length]);
    box('Chimney side brick',1.835,yy,-.65+col*.22+(row%2)*.045,.035,.19,.20,brickColors[(row+col+1)%brickColors.length]);
  }
}
box('Chimney top cap',1.58,5.78,-.55,.65,.16,.67,M.woodDark);
box('Chimney cap upper lip',1.58,5.875,-.55,.70,.07,.72,M.woodMid);

// Gutters/downspouts on the eaves.
for(const side of [-1,1]){
  const gutter=cyl('Roof gutter',side*2.72,3.16,0,.055,.055,4.55,M.iron,modelRoot,8);gutter.rotation.x=Math.PI/2;
  box('Downspout upper vertical',side*2.28,2.55,-1.55,.065,1.12,.065,M.iron);
  cyl('Downspout elbow',side*2.29,1.97,-1.57,.07,.07,.20,M.iron,modelRoot,8).rotation.z=Math.PI/2;
  box('Downspout lower vertical',side*2.35,1.48,-1.70,.07,.82,.07,M.iron);
}

// Garden props: grouped low-poly bushes, potted flowers and leafy ground cover.
let seed=42073;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
function bush(x,z,scale=1,name='Garden shrub'){
  const count=5+Math.floor(rand()*4);
  for(let i=0;i<count;i++){
    const a=rand()*Math.PI*2,rad=rand()*.24*scale;
    const s=(.20+rand()*.17)*scale;
    sphere(name,x+Math.cos(a)*rad,.67+s*.28,z+Math.sin(a)*rad,s*1.15,s*.9,s,M.leaf[Math.floor(rand()*M.leaf.length)]);
  }
}
function pot(x,z,size=.22,name='Terracotta pot'){
  cyl(name+' body',x,.76,z,size*.68,size,size*.40,mat('#b85e32'),modelRoot,10);
  cyl(name+' rim',x,.965,z,size*.82,size*.82,size*.12,M.woodMid,modelRoot,10);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;const lx=x+Math.cos(a)*size*.34,lz=z+Math.sin(a)*size*.34;
    sphere(name+' leaf',lx,1.08+rand()*.10,lz,size*.28,size*.52,size*.25,M.leaf[Math.floor(rand()*M.leaf.length)]);
    if(i%2===0)flower(name+' flower',lx,1.20,lz,i%4===0?M.flowerYellow:M.flowerWhite,.045);
  }
}
// Side and rear bushes frame the house without hiding the architecture.
for(const [x,z,s] of [[-3.05,1.9,.95],[-3.3,1.1,.72],[-3.0,-1.2,.78],[3.05,1.7,.9],[3.35,.8,.65],[3.1,-1.55,.82],[-2.7,2.8,.55],[2.7,2.9,.55],[-3.35,-2.4,.62],[3.2,-2.5,.64]])bush(x,z,s);
// Pebbles around the planting beds.
for(let i=0;i<28;i++){
  const edge=rand()<.5?-1:1;let x=edge*(2.5+rand()*.95),z=-2.8+rand()*5.6;
  if(rand()<.5){x=-3.7+rand()*7.4;z=(rand()<.5?-1:1)*(2.45+rand()*.8);}
  const s=.09+rand()*.14;
  const rock=sphere('Garden pebble',x,.60+s*.3,z,s*1.2,s*.55,s,rand()<.5?M.stoneLight:M.stone);rock.rotation.y=rand()*Math.PI;
}
// Flower beds along the front edge.
for(let i=0;i<26;i++){
  const x=-3.0+rand()*6,z=2.35+rand()*.9;
  if(Math.abs(x)<.70&&z<2.85)continue;
  const stem=cyl('Flower stem',x,.68,z,.012,.015,.20,M.grassDark,modelRoot,5);stem.rotation.z=(rand()-.5)*.5;
  const bloomY=.80+rand()*.08;flower('Garden flower',x,bloomY,z,[M.flowerWhite,M.flowerYellow,M.flowerPink][Math.floor(rand()*3)],.045+rand()*.025);
}
for(const [x,z] of [[-1.95,2.15],[-2.45,2.15],[1.95,2.15],[2.42,2.2],[-2.35,3.3],[2.35,3.3]])pot(x,z,.20+(rand()*.04),'Porch planter');
// A few trailing leaves and small ornamental plants beside the steps.
for(const side of [-1,1])for(let i=0;i<6;i++){
  const x=side*(1.02+rand()*.40),z=2.65+rand()*.7;
  sphere('Low plant leaf',x,.72+rand()*.10,z,.11,.07,.22,M.leaf[Math.floor(rand()*M.leaf.length)]);
}

// Individual stepping stones and a subtle path to the island's front lip.
for(let i=0;i<3;i++){
  const z=3.48+i*.17;
  const w=.72+(i%2)*.17;
  const stone=box('Path stepping stone',((i%3)-1)*.12,.565,z,w,.075,.46,i%3===0?M.pathEdge:M.path);
  stone.rotation.y=(rand()-.5)*.15;
  box('Path stone inset',((i%3)-1)*.12,.607,z,w*.87,.025,.35,M.path);
}
for(const side of [-1,1]){
  for(let i=0;i<5;i++){
    const x=side*(.68+i*.12),z=3.4+i*.48;
    const s=sphere('Path edge tuft',x,.57,z,.13,.035,.10,M.grassDark);s.rotation.y=rand()*Math.PI;
  }
}

// A small welcome mat and brass details.
box('Doorstep welcome mat',0,.58,2.36,.92,.045,.40,mat('#875637'));
for(let i=0;i<7;i++)box('Mat weave',-.39+i*.13,.605,2.36,.012,.008,.32,mat('#b58a5e'));

// Enlarge the cottage relative to the meadow without changing the separately generated landscape.
// The tiny vertical offset compensates for scaling the model around its origin.
modelRoot.scale.set(1.18,1.10,1.18);modelRoot.position.y=-.07;

// Camera presets are interpolated for a smooth, intentional transition.
const views={
  hero:{pos:new THREE.Vector3(9.5,7.0,11.2),target:new THREE.Vector3(0,2.75,0)},
  front:{pos:new THREE.Vector3(0,5.0,13.0),target:new THREE.Vector3(0,2.85,.1)},
  right:{pos:new THREE.Vector3(13.1,5.35,0),target:new THREE.Vector3(0,2.85,0)},
  back:{pos:new THREE.Vector3(0,5.15,-13.1),target:new THREE.Vector3(0,2.85,0)},
  left:{pos:new THREE.Vector3(-13.1,5.35,0),target:new THREE.Vector3(0,2.85,0)},
  top:{pos:new THREE.Vector3(0,21,0.01),target:new THREE.Vector3(0,0,0)},
  landscape:{pos:new THREE.Vector3(24.0,15.5,25.0),target:new THREE.Vector3(4.0,2.2,-2.0)}
};
let anim=null;
function setView(key){const v=views[key];if(!v)return;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===key));anim={t:0,fromPos:camera.position.clone(),toPos:v.pos.clone(),fromTarget:controls.target.clone(),toTarget:v.target.clone()};}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.getElementById('resetBtn').addEventListener('click',()=>setView('hero'));
let wire=false;
document.getElementById('wireBtn').addEventListener('click',()=>{
  wire=!wire;modelRoot.traverse(o=>{if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{if(m.userData.originalWire===undefined)m.userData.originalWire=!!m.wireframe;m.wireframe=wire;});}});
  document.getElementById('wireBtn').classList.toggle('active',wire);toast(wire?'Wireframe view enabled':'Wireframe view disabled');
});
let softShadows=true;document.getElementById('sunBtn').addEventListener('click',()=>{softShadows=!softShadows;sun.castShadow=softShadows;sun.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;document.getElementById('sunBtn').textContent='Soft shadows: '+(softShadows?'on':'off');toast(softShadows?'Soft shadows enabled':'Shadows disabled for performance');});
let cinematicFx=!isMobileDevice;
document.getElementById('fxBtn').textContent='Cinematic FX: '+(cinematicFx?'on':'off');
document.getElementById('fxBtn').addEventListener('click',()=>{
  if(isMobileDevice){toast('Mobile uses the optimized native render path; post FX are desktop-only.');return;}
  cinematicFx=!cinematicFx;const mode=document.getElementById('qualitySelect').value;ssaoPass.enabled=cinematicFx&&mode!=='performance';bloomPass.enabled=cinematicFx&&mode==='cinematic';document.getElementById('fxBtn').textContent='Cinematic FX: '+(cinematicFx?'on':'off');toast(cinematicFx?'Contact shading and bloom enabled':'Cinematic post-processing disabled');
});

// Quality tiers adapt render resolution, screen-space effects, shadows and grass density.
const qualitySelect=document.getElementById('qualitySelect');
qualitySelect?.addEventListener('change',()=>{
  const mode=qualitySelect.value;
  if(weatherSystem)weatherSystem.setQuality(mode);
  const ratio=isMobileDevice
    ? Math.min(devicePixelRatio, mode==='performance'?.95:mode==='balanced'?1.28:1.45)
    : Math.min(devicePixelRatio, mode==='performance'?.85:mode==='balanced'?1.05:1.4);
  if(isMobileDevice){targetMobilePixelRatio=ratio;activeMobilePixelRatio=ratio;}
  renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
  if(composer){composer.setPixelRatio(mode==='cinematic'?Math.min(devicePixelRatio,1.0):mode==='balanced'?Math.min(devicePixelRatio,.82):Math.min(devicePixelRatio,.66));composer.setSize(innerWidth,innerHeight);}
  ssaoPass.setSize?.(innerWidth,innerHeight);ssaoPass.enabled=!isMobileDevice&&cinematicFx&&mode!=='performance';bloomPass.enabled=!isMobileDevice&&cinematicFx&&mode==='cinematic';
  sun.shadow.mapSize.setScalar(isMobileDevice?1024:(mode==='cinematic'?2048:mode==='balanced'?1536:1024));sun.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
  const countRatio=isMobileDevice?(mode==='performance'?.42:mode==='balanced'?.70:.88):(mode==='performance'?.30:mode==='balanced'?.62:1.0);
  grassInstances.count=Math.floor(grassPlaced*countRatio);
  grassInstances.instanceMatrix.needsUpdate=true;
  toast('Rendering quality: '+qualitySelect.options[qualitySelect.selectedIndex].text);
});

let weatherSystem=null, rainEnabled=false;
function setWetMaterials(enabled){
  const visited=new Set();
  for(const root of [modelRoot,landscapeRoot])root.traverse(obj=>{
    if(!obj.isMesh)return;const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    for(const material of materials){if(!material||visited.has(material))continue;visited.add(material);
      if(material.userData.dryRoughness===undefined)material.userData.dryRoughness=material.roughness??.8;
      if(material.userData.dryClearcoat===undefined)material.userData.dryClearcoat=material.clearcoat??0;
      if(material.userData.dryClearcoatRoughness===undefined)material.userData.dryClearcoatRoughness=material.clearcoatRoughness??.7;
      const dry=material.userData.dryRoughness;
      if(enabled){if(dry>.42)material.roughness=Math.max(.18,dry*.48);if('clearcoat' in material)material.clearcoat=Math.max(material.userData.dryClearcoat,.26);if('clearcoatRoughness' in material)material.clearcoatRoughness=.3;}
      else{material.roughness=dry;if('clearcoat' in material)material.clearcoat=material.userData.dryClearcoat;if('clearcoatRoughness' in material)material.clearcoatRoughness=material.userData.dryClearcoatRoughness;}
      // roughness/clearcoat are uniforms; avoid forcing shader recompilation after rain toggle.
    }
  });
}
function applyRainAtmosphere(enabled){
  if(enabled){
    sun.intensity*=.48;sun.color.set('#b8cbd3');hemi.intensity*=.86;hemi.color.set('#b4c7d0');fill.intensity=.60;rimLight.intensity=.20;
    renderer.toneMappingExposure=.84;sky.material.uniforms['turbidity'].value=16;sky.material.uniforms['mieCoefficient'].value=.025;sky.material.uniforms['mieDirectionalG'].value=.92;if(scene.fog){scene.fog.color.set('#91a8ad');scene.fog.near=72;scene.fog.far=205;}
    sunDisc.visible=false;sunGlow.visible=false;stormClouds.visible=true;if(river.material?.uniforms?.sunColor)river.material.uniforms.sunColor.value.set('#b8cbd3');setWetMaterials(true);
  }else{
    stormClouds.visible=false;timeOfDay.set(document.getElementById('timeSelect').value);if(scene.fog){scene.fog.near=118;scene.fog.far=292;}setWetMaterials(false);
  }
}
document.getElementById('rainBtn').addEventListener('click',()=>{
  const btn=document.getElementById('rainBtn');btn.disabled=true;
  try{
    // The weather module is imported with the app, but its particle buffers are only
    // allocated when rain is first enabled. This avoids a dynamic-import failure on local builds.
    if(!weatherSystem){weatherSystem=createWeatherSystem({THREE,scene,camera,terrainHeight,riverCenterX,riverStart,riverEnd,waterHalfWidth:riverWidth*.5,waterLevel:river.position.y,mobile:isMobileDevice});weatherSystem.setQuality(qualitySelect.value);}
    rainEnabled=!rainEnabled;weatherSystem.setRain(rainEnabled);applyRainAtmosphere(rainEnabled);
    btn.textContent='Rain: '+(rainEnabled?'on':'off');btn.classList.toggle('active',rainEnabled);
    toast(rainEnabled?'Rainfall, visible streaks, surface splashes and wet materials enabled':'Rain stopped; daylight restored');
  }catch(err){console.error(err);toast('Could not start rainfall. Open this project through run_local.bat or VS Code Live Server.');}
  btn.disabled=false;
});
let motionBlurFeature=null,motionBlurEnabled=false,previousCameraPosition=camera.position.clone();
document.getElementById('blurBtn').addEventListener('click',async()=>{
  const btn=document.getElementById('blurBtn');
  if(isMobileDevice){toast('Motion blur is off on mobile to keep orbit controls responsive.');return;}
  btn.disabled=true;
  try{
    if(!motionBlurFeature){const module=await import('./features/motion-blur.js');motionBlurFeature=module.createMotionBlurPass();composer.insertPass(motionBlurFeature.pass,composer.passes.length-1);motionBlurFeature.pass.enabled=false;}
    motionBlurEnabled=!motionBlurEnabled;motionBlurFeature.pass.enabled=motionBlurEnabled;btn.textContent='Motion blur: '+(motionBlurEnabled?'on':'off');btn.classList.toggle('active',motionBlurEnabled);
    toast(motionBlurEnabled?'Subtle camera-motion blur enabled':'Motion blur disabled');
  }catch(err){console.error(err);toast('Could not load motion blur module.');}
  btn.disabled=false;
});

// Mobile control drawer: every scene control and camera preset remains reachable without covering the view.
const controlDrawer=document.getElementById('controlDrawer');
const menuToggle=document.getElementById('menuToggle');
const closeDrawerBtn=document.getElementById('closeDrawer');
const drawerBackdrop=document.getElementById('drawerBackdrop');
function closeControlDrawer(){controlDrawer?.classList.remove('open');drawerBackdrop?.classList.remove('open');menuToggle?.setAttribute('aria-expanded','false');menuToggle?.setAttribute('aria-label','Open scene controls');}
function openControlDrawer(){controlDrawer?.classList.add('open');drawerBackdrop?.classList.add('open');menuToggle?.setAttribute('aria-expanded','true');menuToggle?.setAttribute('aria-label','Close scene controls');}
menuToggle?.addEventListener('click',()=>controlDrawer?.classList.contains('open')?closeControlDrawer():openControlDrawer());
closeDrawerBtn?.addEventListener('click',closeControlDrawer);
drawerBackdrop?.addEventListener('click',closeControlDrawer);
controlDrawer?.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(button && button.id!=='closeDrawer' && window.matchMedia('(max-width: 760px)').matches) setTimeout(closeControlDrawer,0);
});
controlDrawer?.addEventListener('change',event=>{
  if(event.target.matches('select') && window.matchMedia('(max-width: 760px)').matches) setTimeout(closeControlDrawer,120);
});
addEventListener('keydown',event=>{if(event.key==='Escape')closeControlDrawer();});
// On narrow/touch devices start in Balanced mode to preserve responsive orbit controls.
if(isMobileDevice && qualitySelect && qualitySelect.value==='cinematic'){
  qualitySelect.value='balanced';
  qualitySelect.dispatchEvent(new Event('change',{bubbles:true}));
}

function toast(message){const n=document.getElementById('notice');n.textContent=message;n.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.classList.remove('show'),2300);}
function createExportTarget(mode){
  if(mode!=='full')return {root:modelRoot,cleanup:()=>{},filename:'cozy-cottage.glb'};
  const root=new THREE.Group();root.name='Cottage Meadow Full Environment';
  root.add(modelRoot.clone(true));
  const environment=landscapeRoot.clone(true);
  const clonedRiver=environment.getObjectByName('Reflective flowing river');
  if(clonedRiver?.parent)clonedRiver.parent.remove(clonedRiver);
  // GLB cannot carry the Water shader, so substitute a static PBR river surface for export.
  const exportedWaterGeometry=riverGeo.clone();
  const exportedWaterMaterial=new THREE.MeshPhysicalMaterial({color:'#176d7d',roughness:.23,metalness:.12,clearcoat:.72,clearcoatRoughness:.14});
  const exportedWater=new THREE.Mesh(exportedWaterGeometry,exportedWaterMaterial);exportedWater.name='River - static reflective export';
  exportedWater.rotation.copy(river.rotation);exportedWater.position.copy(river.position);environment.add(exportedWater);
  root.add(environment);
  return {root,filename:'cottage-meadow-full-environment.glb',cleanup:()=>{exportedWaterGeometry.dispose();exportedWaterMaterial.dispose();}};
}
document.getElementById('exportBtn').addEventListener('click',()=>{
  const btn=document.getElementById('exportBtn'),mode=document.getElementById('exportModeSelect')?.value||'cottage';
  btn.disabled=true;btn.textContent='Preparing GLB…';const target=createExportTarget(mode);const exporter=new GLTFExporter();
  exporter.parse(target.root,(result)=>{
    try{const blob=new Blob([result],{type:'model/gltf-binary'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=target.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);toast(mode==='full'?'Full environment exported as GLB':'Cottage exported as GLB');}
    catch(e){console.error(e);toast('Could not download the model. See console for details.');}
    target.cleanup();btn.disabled=false;btn.textContent='Export GLB ↗';
  },(error)=>{console.error(error);target.cleanup();toast('GLB export failed. Try again in a desktop browser.');btn.disabled=false;btn.textContent='Export GLB ↗';},{binary:true,onlyVisible:true});
});

// Resize, smooth view interpolation, and render.
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const mode=document.getElementById('qualitySelect').value;
  const ratio=isMobileDevice?Math.min(devicePixelRatio,mode==='performance'?.95:mode==='balanced'?1.28:1.45):Math.min(devicePixelRatio,mode==='performance'?.85:mode==='balanced'?1.05:1.4);
  if(isMobileDevice){targetMobilePixelRatio=ratio;activeMobilePixelRatio=ratio;}
  renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
  if(composer){composer.setPixelRatio(mode==='cinematic'?Math.min(devicePixelRatio,1.0):mode==='balanced'?Math.min(devicePixelRatio,.82):Math.min(devicePixelRatio,.66));composer.setSize(innerWidth,innerHeight);}
  ssaoPass.setSize?.(innerWidth,innerHeight);
});
const clock=new THREE.Clock();let waterNormalTimer=0,weatherAccumulator=0;
let mobileFrameAvg=1/60,mobileFrameCount=0;
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);const elapsed=clock.elapsedTime;
  if(river.material?.uniforms?.time)river.material.uniforms.time.value+=dt;
  // Desktop can afford subtle vertex displacement; mobile uses the scrolling PBR normal map
  // for animated waves, avoiding per-frame CPU deformation and normal recomputation.
  if(!isMobileDevice){
    const waterPos=riverGeo.attributes.position;const waterArray=waterPos.array;
    for(let i=0;i<waterPos.count;i++){
      const k=i*3,wx=riverBasePositions[k],wz=-riverBasePositions[k+1];
      waterArray[k+2]=.022*Math.sin(wz*.63-elapsed*2.15+wx*.22)+.012*Math.sin(wz*1.24-elapsed*3.45-wx*.38);
    }
    waterPos.needsUpdate=true;waterNormalTimer+=dt;if(waterNormalTimer>.085){riverGeo.computeVertexNormals();waterNormalTimer=0;}
  }
  // Scrolling, reusable normal-map animation creates moving specular highlights with no new buffers.
  waterNormalTexture.offset.x=(elapsed*.017)%1;waterNormalTexture.offset.y=(elapsed*.062)%1;
  for(const f of floaters){let z=riverStart+(((f.start-riverStart+elapsed*.48)%(riverEnd-riverStart)+(riverEnd-riverStart))%(riverEnd-riverStart));const x=riverCenterX(z)+f.offset;f.group.position.set(x,.325+Math.sin(elapsed*1.65+f.seed)*.019+Math.sin(z*.63-elapsed*2.15+x*.22)*.015,z);f.group.rotation.y=Math.sin(elapsed*.5+f.seed)*.28;f.group.rotation.x=Math.sin(elapsed*1.2+f.seed)*.08;}
  if(bladeMaterial.userData.windShader)bladeMaterial.userData.windShader.uniforms.uGrassWindTime.value=elapsed;
  for(const t of windTrees){t.group.rotation.z=Math.sin(elapsed*.58+t.phase)*t.amount;t.group.rotation.x=Math.cos(elapsed*.47+t.phase)*t.amount*.55;}
  for(const c of cloudSprites){c.sprite.position.y=c.baseY+Math.sin(elapsed*.055+c.phase)*.22;c.sprite.position.x=Math.sin(c.angle+elapsed*.0012)*c.radius;}
  if(rainEnabled)for(const c of stormCloudMotion){c.group.position.x=c.x+Math.sin(elapsed*.018+c.phase)*1.15;c.group.position.z=c.z+Math.cos(elapsed*.014+c.phase)*.55;}
  if(weatherSystem&&rainEnabled){weatherAccumulator+=dt;const weatherTick=isMobileDevice?1/24:1/32;if(weatherAccumulator>=weatherTick){weatherSystem.update(Math.min(weatherAccumulator,.06),elapsed);weatherAccumulator=0;}}
  if(anim){anim.t=Math.min(1,anim.t+dt*1.8);const k=anim.t*anim.t*(3-2*anim.t);camera.position.lerpVectors(anim.fromPos,anim.toPos,k);controls.target.lerpVectors(anim.fromTarget,anim.toTarget,k);if(anim.t>=1)anim=null;}
  controls.update();
  if(motionBlurFeature && motionBlurEnabled){const dx=camera.position.x-previousCameraPosition.x,dy=camera.position.y-previousCameraPosition.y,dz=camera.position.z-previousCameraPosition.z;motionBlurFeature.setVelocity(dx,dy,dz,innerWidth,innerHeight);}
  previousCameraPosition.copy(camera.position);
  if(isMobileDevice){
    // Adaptive pixel ratio only changes raster resolution, not models/material detail.
    // This protects touch responsiveness on throttling phones without permanently downgrading quality.
    mobileFrameAvg=mobileFrameAvg*.92+dt*.08;mobileFrameCount++;
    if(mobileFrameCount>=90){
      let nextRatio=activeMobilePixelRatio;
      if(mobileFrameAvg>.026)nextRatio=Math.max(.90,activeMobilePixelRatio-.06);
      else if(mobileFrameAvg<.019)nextRatio=Math.min(targetMobilePixelRatio,activeMobilePixelRatio+.02);
      if(Math.abs(nextRatio-activeMobilePixelRatio)>.005){activeMobilePixelRatio=nextRatio;renderer.setPixelRatio(activeMobilePixelRatio);renderer.setSize(innerWidth,innerHeight);}
      mobileFrameCount=0;
    }
    renderer.render(scene,camera);
  }else composer.render();
}
animate();
setTimeout(()=>{const l=document.getElementById('loader');l.style.opacity='0';setTimeout(()=>l.remove(),400);},350);
