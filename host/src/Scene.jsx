import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// ── Lane constants (meters) ───────────────────────────────────────────────────
const LANE_LENGTH = 18.3;
const LANE_WIDTH = 1.05;
const GUTTER_WIDTH = 0.1;
const GUTTER_DEPTH = 0.04;
const BALL_RADIUS = 0.11;

// Z convention: camera is at positive Z, pins are at negative Z.
// Foul line at z = 0. Ball starts just behind it (positive Z side).
const PIN_START_Z = -15.0; // front of pin deck (head pin)
const PIN_SPACING = 0.305; // 12 inches center-to-center
const BALL_START = new THREE.Vector3(0, BALL_RADIUS, 0);

// 10-pin positions in triangle — row 1 (head pin) nearest camera, row 4 furthest.
// Row n has n pins, centered on x=0.
function getPinPositions() {
  const positions = [];
  for (let row = 0; row < 4; row++) {
    const count = row + 1;
    const z = PIN_START_Z - row * PIN_SPACING * Math.sqrt(3) / 2;
    for (let col = 0; col < count; col++) {
      const x = (col - (count - 1) / 2) * PIN_SPACING;
      positions.push(new THREE.Vector3(x, 0, z));
    }
  }
  return positions;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function makeLane(geometries, materials) {
  const group = new THREE.Group();

  // Main lane surface
  const laneGeo = new THREE.BoxGeometry(LANE_WIDTH, 0.05, LANE_LENGTH);
  const laneMat = new THREE.MeshStandardMaterial({ color: '#c8a96e', roughness: 0.6, metalness: 0.1 });
  geometries.push(laneGeo);
  materials.push(laneMat);
  const lane = new THREE.Mesh(laneGeo, laneMat);
  lane.position.set(0, -0.025, -LANE_LENGTH / 2 + 2); // center lane along Z
  lane.receiveShadow = true;
  group.add(lane);

  // Gutters
  const gutterGeo = new THREE.BoxGeometry(GUTTER_WIDTH, GUTTER_DEPTH, LANE_LENGTH);
  const gutterMat = new THREE.MeshStandardMaterial({ color: '#8B6914', roughness: 0.8 });
  geometries.push(gutterGeo);
  materials.push(gutterMat);

  [-1, 1].forEach((side) => {
    const gutter = new THREE.Mesh(gutterGeo, gutterMat);
    gutter.position.set(side * (LANE_WIDTH / 2 + GUTTER_WIDTH / 2), -0.045, -LANE_LENGTH / 2 + 2);
    gutter.receiveShadow = true;
    group.add(gutter);
  });

  // Foul line
  const foulGeo = new THREE.BoxGeometry(LANE_WIDTH, 0.005, 0.03);
  const foulMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  geometries.push(foulGeo);
  materials.push(foulMat);
  const foulLine = new THREE.Mesh(foulGeo, foulMat);
  foulLine.position.set(0, 0.001, 0);
  group.add(foulLine);

  // Arrow markers — 7 arrows in V pattern, ~3.6m from foul line
  const arrowPositionsX = [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36];
  const arrowGeo = new THREE.PlaneGeometry(0.05, 0.1);
  const arrowMat = new THREE.MeshStandardMaterial({ color: '#8B4513', roughness: 0.5 });
  geometries.push(arrowGeo);
  materials.push(arrowMat);
  arrowPositionsX.forEach((x) => {
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(x, 0.001, -3.6);
    group.add(arrow);
  });

  return group;
}

function makeBall(geometries, materials) {
  const geo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: '#4488ff',
    roughness: 0.1,
    metalness: 0.3,
  });
  geometries.push(geo);
  materials.push(mat);
  const ball = new THREE.Mesh(geo, mat);
  ball.position.copy(BALL_START);
  ball.castShadow = true;
  return ball;
}

function makePins(geometries, materials) {
  const group = new THREE.Group();
  const pinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.38, 16);
  const pinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.1 });
  geometries.push(pinGeo);
  materials.push(pinMat);

  getPinPositions().forEach((pos) => {
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(pos.x, 0.19, pos.z); // 0.19 = half height, sitting on lane
    pin.castShadow = true;
    pin.receiveShadow = true;
    group.add(pin);
  });

  return group;
}

// ── Scene component ───────────────────────────────────────────────────────────
export default function Scene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const geometries = [];
    const materials = [];
    let animFrameId;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a2e');

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 2.0, 5);
    camera.lookAt(0, 0, -14);

    // Lights
    const ambient = new THREE.AmbientLight('#ffffff', 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight('#ffffff', 1.2);
    dirLight.position.set(2, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    // Tighten frustum to just cover the lane
    dirLight.shadow.camera.left = -2;
    dirLight.shadow.camera.right = 2;
    dirLight.shadow.camera.top = 2;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 30;
    scene.add(dirLight);

    // Objects
    scene.add(makeLane(geometries, materials));
    scene.add(makeBall(geometries, materials));
    scene.add(makePins(geometries, materials));

    // Render loop
    function animate() {
      animFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    function onResize() {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', onResize);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}

export { BALL_START, PIN_START_Z, PIN_SPACING, BALL_RADIUS, LANE_LENGTH, getPinPositions };
