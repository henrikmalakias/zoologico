import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Converte a malha gerada (sdf.js) num modelo three.js com esqueleto, pronto para clonar.
export function makeTemplate(m, opts = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  const bones = [], byName = {};
  for (const b of m.ossos) {
    const bone = new THREE.Bone(); bone.name = b.nome; byName[b.nome] = bone; bones.push(bone);
    const par = b.pai ? m.ossos.find(x => x.nome === b.pai) : null;
    bone.position.set(b.pos[0] - (par ? par.pos[0] : 0), b.pos[1] - (par ? par.pos[1] : 0), b.pos[2] - (par ? par.pos[2] : 0));
    if (b.pai) byName[b.pai].add(bone);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.rough ?? 0.88, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(g, mat);
  const root = bones[0];
  mesh.add(root); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#0c0a08', roughness: 0.12, metalness: 0.1 }), eyeGeo = new THREE.SphereGeometry(1, 12, 8);
  for (const e of m.extras) if (e.tipo === 'olho') {
    const b = m.ossos.find(x => x.nome === e.osso), eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.scale.setScalar(e.r); eye.position.set(e.pos[0] - b.pos[0], e.pos[1] - b.pos[1], e.pos[2] - b.pos[2]); byName[e.osso].add(eye);
  }
  const group = new THREE.Group(); group.add(mesh);
  return group;
}
export function instance(template) {
  const o = cloneSkinned(template);
  const mesh = o.children[0], bones = {};
  mesh.skeleton.bones.forEach(b => { bones[b.name] = b; b.userData.rest = b.position.clone(); });
  o.userData.sdf = { mesh, bones, phase: Math.random() * 6 };
  return o;
}
