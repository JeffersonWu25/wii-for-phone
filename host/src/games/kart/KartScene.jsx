import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FOV, PIVOT_Y, TRACK_HALF, placeCamera } from './camera.js';
import { syncEntities } from './entity-mesh.js';
import { updateKartFx } from './kart-fx.js';
import { makeRacer } from './kart-mesh.js';
import { viewports } from './layout.js';
import { driftView, effectView } from './race.js';
import { attachCourse } from './track-view.js';

export { CAM_DIST, CAM_HEIGHT, LOOK_AHEAD, LOOK_Y, FOV } from './camera.js';

function placeRacer(mesh, kart, now) {
  const view = driftView(kart);
  const fxKind = effectView(kart);
  const body = mesh.userData.body;
  mesh.position.set(kart.x, 0, kart.z);
  mesh.rotation.set(0, view.facing, 0);
  body.position.y = PIVOT_Y + Math.abs(view.roll) * TRACK_HALF;
  body.rotation.set(0, 0, fxKind === 'spin' ? Math.sin(now / 80) * 0.4 : view.roll);
  if (mesh.userData.fx) {
    updateKartFx(mesh.userData.fx, view, fxKind, now);
  } else {
    const sparks = mesh.userData.sparks;
    const glow = mesh.userData.glow;
    sparks.material.opacity = view.charge;
    sparks.material.color.set(view.charged ? 0xff8a2a : 0x9ecbff);
    glow.visible = view.phase === 'boosting' || fxKind === 'boost' || fxKind === 'star';
    glow.material.color.set(fxKind === 'star' ? 0xffe566 : 0xffb15a);
  }
}

export default function KartScene({ raceRef, track }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setScissorTest(true);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    wrap.appendChild(renderer.domElement);
    if (!track || typeof track.trackVisuals !== 'function') {
      throw new Error('KartScene requires a track with trackVisuals()');
    }
    const courseHandle = attachCourse(scene, track.trackVisuals());

    const racers = [];
    const entityPool = new Map();
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
      const race = raceRef.current;
      if (!race) return;
      ensureRacers(race);

      race.karts.forEach((kart, i) => {
        const mesh = racers[i];
        if (!mesh) return;
        placeRacer(mesh, kart, now);
      });
      syncEntities(scene, entityPool, race.entities, now);

      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      const rects = viewports(race.karts.length, w, h);
      race.karts.forEach((kart, i) => {
        const rect = rects[i];
        renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
        renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
        camera.aspect = rect.w / Math.max(rect.h, 1);
        placeCamera(camera, kart, driftView(kart).travel);
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
      courseHandle.dispose();
      scene.traverse((obj) => {
        if (obj.parent?.name === 'luigi-course') return;
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
  }, [raceRef, track]);

  return <div className="kart-canvas" ref={wrapRef} />;
}
