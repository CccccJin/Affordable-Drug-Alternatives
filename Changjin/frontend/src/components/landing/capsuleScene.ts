import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Closed capsule geometry; orientation is a pure function of page progress. */
export function createCapsuleScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 7.6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.035);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffee, 0x47645a, 2));
  const light = new THREE.DirectionalLight(0xfffcf1, 3); light.position.set(-3, 4, 5); scene.add(light);
  const rim = new THREE.DirectionalLight(0xd5fff3, 2); rim.position.set(4, 1, -2); scene.add(rim);
  const pill = new THREE.Group(); scene.add(pill);
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const pearl = new THREE.MeshPhysicalMaterial({ color:0xf2efe1, roughness:0.26, metalness:0.04, clearcoat:1, clearcoatRoughness:0.18 });
  const teal = new THREE.MeshPhysicalMaterial({ color:0x2b7863, roughness:0.22, metalness:0.12, clearcoat:1, clearcoatRoughness:0.15 });
  materials.push(pearl, teal);
  const makeHalf = (radius: number) => {
    const points = [new THREE.Vector2(0,0),new THREE.Vector2(radius-.012,0),new THREE.Vector2(radius,.018),new THREE.Vector2(radius,.72)];
    for (let i=1;i<=32;i++) { const a=i/32*Math.PI/2; points.push(new THREE.Vector2(radius*Math.cos(a),.72+radius*Math.sin(a))); }
    return new THREE.LatheGeometry(points,96);
  };
  const cap = new THREE.Mesh(makeHalf(.6),pearl), body = new THREE.Mesh(makeHalf(.591),teal);
  body.rotation.z = Math.PI; body.position.y = -.006; pill.add(cap,body);
  const seamMaterial = new THREE.MeshStandardMaterial({color:0x658479,roughness:.4}); materials.push(seamMaterial);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(.595,.009,10,96),seamMaterial); seam.rotation.x = Math.PI/2; pill.add(seam);
  const labelCanvas = document.createElement('canvas'); labelCanvas.width=512; labelCanvas.height=128;
  const ctx = labelCanvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle='#34594b'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='500 42px monospace'; ctx.fillText('CHEM / 01',256,64);
    const texture=new THREE.CanvasTexture(labelCanvas); texture.colorSpace=THREE.SRGBColorSpace; textures.push(texture);
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}); materials.push(material);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.72,.18),material); label.position.set(0,.37,.605); pill.add(label);
  }
  const shadowCanvas=document.createElement('canvas'); shadowCanvas.width=256; shadowCanvas.height=256;
  const shadowContext=shadowCanvas.getContext('2d');
  if (shadowContext) {
    const gradient=shadowContext.createRadialGradient(128,128,8,128,128,128);
    gradient.addColorStop(0,'rgba(32,66,46,.26)'); gradient.addColorStop(.45,'rgba(32,66,46,.12)'); gradient.addColorStop(1,'rgba(32,66,46,0)');
    shadowContext.fillStyle=gradient; shadowContext.fillRect(0,0,256,256);
    const texture=new THREE.CanvasTexture(shadowCanvas); textures.push(texture);
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}); materials.push(material);
    const shadow=new THREE.Sprite(material); shadow.position.set(0,-1.48,-.7); shadow.scale.set(4,.55,1); scene.add(shadow);
  }
  let current=0, disposed=false;
  const update = (p: number) => {
    if (disposed) return;
    current=p;
    pill.rotation.set(.22+Math.sin(p*Math.PI*2)*.24,p*Math.PI*2-.28,-.75+p*Math.PI*1.55);
    pill.position.set(.2*Math.sin(p*Math.PI*2),.08*Math.sin(p*Math.PI*4),0);
    canvas.dataset.rotation=[pill.rotation.x,pill.rotation.y,pill.rotation.z].map(x=>x.toFixed(4)).join(',');
    renderer.render(scene,camera);
  };
  const resize = () => {
    const rect=canvas.getBoundingClientRect(); if (rect.width<=0 || rect.height<=0) return;
    renderer.setSize(rect.width,rect.height,false); camera.aspect=rect.width/rect.height;
    camera.position.z=camera.aspect<1 ? 9.4 : 7.6; camera.updateProjectionMatrix(); update(current);
  };
  const observer=new ResizeObserver(resize); observer.observe(canvas); resize();
  return {update,dispose:()=>{
    disposed=true; observer.disconnect();
    scene.traverse(object=>{ if(object instanceof THREE.Mesh) object.geometry.dispose(); });
    materials.forEach(material=>material.dispose()); textures.forEach(texture=>texture.dispose()); environment.dispose(); renderer.dispose();
  }};
}
