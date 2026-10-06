import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { HALF, poseAt } from './track.js';
import { viewports } from './layout.js';

function ribbon(halfWidth, y, color) {
  const n = 160;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= n; i++) {
    const pose = poseAt(i / n);
    const rx = Math.cos(pose.heading);
    const rz = -Math.sin(pose.heading);
    positions.push(
      pose.x + rx * halfWidth, y, pose.z + rz * halfWidth,
      pose.x - rx * halfWidth, y, pose.z - rz * halfWidth,
    );
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

function nameSprite(text, css) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(8, 8, 240, 48);
  g.fillStyle = css;
  g.font = 'bold 36px sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 128, 44);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
  }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.y = 2.15;
  return sprite;
}

function makeRacer(character) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.45, 1.7),
    new THREE.MeshLambertMaterial({ color: character.body }),
  );
  body.position.y = 0.48;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 12),
    new THREE.MeshLambertMaterial({ color: character.skin }),
  );
  head.position.y = 1.15;
  group.add(head);

  const hat = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: character.hat }),
  );
  hat.position.y = 1.28;
  group.add(hat);

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (const [wx, wz] of [[-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.28, wz);
    group.add(wheel);
  }

  group.add(nameSprite(character.name, character.css));
  return group;
}

function addTrack(scene) {
  scene.background = new THREE.Color(0x87d4ff);
  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x3a8f3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4d0, 1.15);
  sun.position.set(30, 50, 10);
  scene.add(sun);

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(90, 48),
    new THREE.MeshLambertMaterial({ color: 0x3cb54a }),
  );
  grass.rotation.x = -Math.PI / 2;
  scene.add(grass);

  scene.add(ribbon(HALF + 0.7, 0.02, 0xe8e8ea));
  scene.add(ribbon(HALF, 0.06, 0x4c5160));
  scene.add(ribbon(0.18, 0.09, 0xf5d90a));

  const start = poseAt(0);
  const checker = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2, 0.08, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xf7f7f7 }),
  );
  checker.position.set(start.x, 0.12, start.z);
  checker.rotation.y = start.heading;
  scene.add(checker);

  for (let i = 0; i < 10; i++) {
    const pose = poseAt((i + 0.35) / 10);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.9, 8),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xe52521 : 0xf7f7f7 }),
    );
    const rx = Math.cos(pose.heading);
    const rz = -Math.sin(pose.heading);
    cone.position.set(pose.x + rx * (HALF + 1.3), 0.45, pose.z + rz * (HALF + 1.3));
    scene.add(cone);
  }
}

export default function KartScene({ raceRef }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setScissorTest(true);
    wrap.appendChild(renderer.domElement);
    addTrack(scene);

    const racers = [];
    function ensureRacers(race) {
      if (racers.length === race.karts.length) return;
      for (const mesh of racers) scene.remove(mesh);
      racers.length = 0;
      for (const kart of race.karts) {
        const mesh = makeRacer(kart.character);
        scene.add(mesh);
        racers.push(mesh);
      }
    }
    if (raceRef.current) ensureRacers(raceRef.current);

    let frame = 0;
    let timer = 0;
    let last = performance.now();
    let lastTick = 0;
    let running = true;

    function resize() {
      renderer.setSize(wrap.clientWidth || 1, wrap.clientHeight || 1, false);
    }

    function animate(now) {
      if (!running) return;
      if (now - lastTick < 12) return;
      lastTick = now;
      try {
        animateFrame(now);
      } catch (err) {
        window.__kartError = String(err?.stack || err);
      }
    }

    function animateFrame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const race = raceRef.current;
      if (!race) return;
      ensureRacers(race);

      race.karts.forEach((kart, i) => {
        const mesh = racers[i];
        if (!mesh) return;
        mesh.position.set(kart.x, 0, kart.z);
        mesh.rotation.y = kart.heading;
      });

      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      const rects = viewports(race.karts.length, w, h);
      race.karts.forEach((kart, i) => {
        const rect = rects[i];
        renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
        renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
        camera.aspect = rect.w / Math.max(rect.h, 1);
        camera.position.set(
          kart.x - Math.sin(kart.heading) * 11,
          6.2,
          kart.z - Math.cos(kart.heading) * 11,
        );
        camera.lookAt(kart.x, 1.1, kart.z);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      });
    }

    function pump(now) {
      animate(now);
      if (!running) return;
      frame = requestAnimationFrame(pump);
    }

    function watchdog() {
      if (!running) return;
      timer = window.setTimeout(watchdog, 32);
      if (performance.now() - lastTick > 80) animate(performance.now());
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    frame = requestAnimationFrame(pump);
    timer = window.setTimeout(watchdog, 32);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            mat.map?.dispose();
            mat.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === wrap) wrap.removeChild(renderer.domElement);
    };
  }, [raceRef]);

  return <div className="kart-canvas" ref={wrapRef} />;
}
