import * as THREE from 'three';
import { buildMesh } from '../../src/render/sdf.js';
import { makeTemplate, instance } from '../../src/render/sdfThree.js';
const specs = import.meta.glob('../../src/content/modelos/*.json', { eager: true, import: 'default' });
const S = k => specs[`../../src/content/modelos/${k}.json`];
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(innerWidth, innerHeight); r.shadowMap.enabled = true; r.toneMapping = THREE.ACESFilmicToneMapping; document.body.append(r.domElement);
const sc = new THREE.Scene(); sc.background = new THREE.Color('#9fcbe8');
const pm = new THREE.PMREMGenerator(r); const env = new THREE.Scene(); env.add(new THREE.HemisphereLight('#cfe8ff', '#6b7b4a', 3)); 
sc.add(new THREE.HemisphereLight('#d8ecff', '#5a6b3a', 1.1)); const sun = new THREE.DirectionalLight('#fff3dd', 2.6); sun.position.set(5, 9, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); sc.add(sun);
const gr = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7d9b45' })); gr.receiveShadow = true; sc.add(gr);
const list = (location.hash.slice(1) || 'leao:M,leao:F,zebra:F,girafa:F,elefante:F,macaco:F,humano:tratador,humano:seguranca').split(',');
let x = -list.length * 0.9; const objs = [];
for (const it of list) { const [k, v] = it.split(':'); const t = makeTemplate(buildMesh(S(k), v), { rough: k === 'elefante' ? 0.95 : 0.85 }); const o = instance(t); o.position.x = x + (k === 'elefante' ? 0.9 : 0); o.rotation.y = 0.9; x += k === 'elefante' ? 3.2 : k === 'girafa' ? 2.0 : 1.9; sc.add(o); objs.push(o); }
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
const view = new URLSearchParams(location.search); cam.position.set(+(view.get('x') ?? 0), +(view.get('y') ?? 2.6), +(view.get('z') ?? 13)); cam.lookAt(+(view.get('lx') ?? 0), +(view.get('ly') ?? 1.1), 0);
r.render(sc, cam); window.__done = true;
