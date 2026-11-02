// Gradient sky dome + puffy toon clouds. Both follow the camera so the horizon never moves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const HORIZON = 0xa9ddff;

export function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloud(rand, scale) {
  const parts = [];
  const n = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const r = scale * (0.55 + 0.6 * (1 - Math.abs(t) * 1.4) * (0.7 + rand() * 0.5));
    const g = new THREE.SphereGeometry(r, 14, 10);
    g.scale(1, 0.72, 1);
    g.translate(t * scale * 3.2 + (rand() - 0.5) * scale * 0.4, (rand() - 0.2) * scale * 0.35, (rand() - 0.5) * scale * 0.9);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xffffff);
  const low = new THREE.Color(0x9fc0ee);
  const c = new THREE.Color();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) {
    const hy = (pos.getY(i) - minY) / (maxY - minY);
    const k = Math.min(1, Math.max(0, 0.15 + hy * 0.55 + nrm.getY(i) * 0.45));
    c.lerpColors(low, top, Math.pow(k, 0.8));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function buildSky() {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2400, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // Values are written straight to the (sRGB) framebuffer, no conversion.
      fragmentShader: `varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 hor = vec3(0.66, 0.87, 1.0);
          vec3 mid = vec3(0.16, 0.50, 0.96);
          vec3 top = vec3(0.04, 0.26, 0.85);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.28, h));
          c = mix(c, top, smoothstep(0.2, 0.9, h));
          if (vDir.y < 0.0) c = hor * 0.96;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  dome.renderOrder = -10;
  group.add(dome);

  const rand = rng(1234);
  const cloudGroup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const count = 26;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rand() * 0.5;
    const elev = 0.05 + Math.pow(rand(), 1.4) * 0.6; // radians above the horizon
    const dist = 1500 + rand() * 500;
    const scale = 38 + rand() * 50;
    const m = new THREE.Mesh(cloud(rand, scale), mat);
    m.position.set(Math.cos(ang) * Math.cos(elev) * dist, Math.sin(elev) * dist + 40, Math.sin(ang) * Math.cos(elev) * dist);
    m.rotation.y = -ang - Math.PI / 2 + (rand() - 0.5) * 0.6;
    cloudGroup.add(m);
  }
  group.add(cloudGroup);
  return {
    group,
    tick(t, camera) {
      if (camera) group.position.copy(camera.position);
      cloudGroup.rotation.y = t * 0.004;
    },
  };
}
