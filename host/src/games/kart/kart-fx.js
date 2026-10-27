import * as THREE from 'three';

export function attachKartFx(body) {
  const sparks = makeSparkBurst();
  sparks.position.set(0, 0.02, -0.95);
  body.add(sparks);

  const glowL = makeFlame();
  glowL.position.set(-0.28, 0.08, -1.05);
  body.add(glowL);
  const glowR = makeFlame();
  glowR.position.set(0.28, 0.08, -1.05);
  body.add(glowR);

  const smokeL = makeSmokePuff();
  smokeL.position.set(-0.5, 0.12, -0.55);
  body.add(smokeL);
  const smokeR = makeSmokePuff();
  smokeR.position.set(0.5, 0.12, -0.55);
  body.add(smokeR);

  return { sparks, glowL, glowR, smokeL, smokeR, glow: glowL };
}

export function updateKartFx(fx, view, effect, now) {
  const drifting = view.phase === 'drifting' && view.charge > 0.02;
  const boosting =
    view.phase === 'boosting' || effect === 'boost' || effect === 'star';
  const charged = !!view.charged;

  fx.sparks.material.opacity = drifting ? Math.min(1, 0.25 + view.charge * 0.9) : 0;
  fx.sparks.material.color.set(charged ? 0xff8a2a : 0x9ecbff);
  fx.sparks.scale.setScalar(0.7 + view.charge * 1.1);
  fx.sparks.rotation.y = now * 0.01;

  for (const flame of [fx.glowL, fx.glowR]) {
    flame.visible = boosting;
    if (!boosting) continue;
    const pulse = 0.85 + Math.sin(now / 40) * 0.15;
    flame.scale.set(pulse, pulse * (1.1 + Math.sin(now / 25) * 0.2), pulse);
    flame.material.color.set(effect === 'star' ? 0xffe566 : 0xff7a18);
    flame.material.emissive?.set(effect === 'star' ? 0xffcc33 : 0xff5510);
  }

  const dust = drifting || Math.abs(view.slip) > 0.2;
  for (const puff of [fx.smokeL, fx.smokeR]) {
    puff.material.opacity = dust ? 0.35 + Math.abs(view.slip) * 0.35 : 0;
    puff.scale.setScalar(0.8 + Math.abs(view.slip) * 0.8 + (drifting ? view.charge * 0.4 : 0));
    puff.position.y = 0.12 + Math.sin(now / 90) * 0.04;
  }
}

function makeSparkBurst() {
  const geo = new THREE.SphereGeometry(0.22, 10, 8);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x9ecbff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    emissive: 0x3a6cff,
    emissiveIntensity: 0.6,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  return mesh;
}

function makeFlame() {
  const geo = new THREE.ConeGeometry(0.16, 0.55, 10);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xff7a18,
    emissive: 0xff5510,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.visible = false;
  mesh.castShadow = false;
  return mesh;
}

function makeSmokePuff() {
  const geo = new THREE.SphereGeometry(0.2, 8, 6);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xc8c8c8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  return mesh;
}
