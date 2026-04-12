import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { PhysicsWorld } from './physics.js';

// ── Lane constants (meters) ───────────────────────────────────────────────────
const LANE_LENGTH = 18.3;
const LANE_WIDTH = 1.05;
const GUTTER_WIDTH = 0.1;
const GUTTER_DEPTH = 0.04;
const BALL_RADIUS = 0.11;

const PIN_START_Z = -15.0;
const PIN_SPACING = 0.305;
const BALL_START = new THREE.Vector3(0, BALL_RADIUS, 0);

const PREVIEW_MAX_X = 0.3; // ±0.3m lateral range for aim preview
const LERP_FACTOR = 0.15;  // per frame — smooth but responsive

function getPinPositions() {
  const positions = [];
  for (let row = 0; row < 4; row++) {
    const count = row + 1;
    const z = PIN_START_Z - row * PIN_SPACING * (Math.sqrt(3) / 2);
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

  const laneGeo = new THREE.BoxGeometry(LANE_WIDTH, 0.05, LANE_LENGTH);
  const laneMat = new THREE.MeshStandardMaterial({ color: '#c8a96e', roughness: 0.6, metalness: 0.1 });
  geometries.push(laneGeo); materials.push(laneMat);
  const lane = new THREE.Mesh(laneGeo, laneMat);
  lane.position.set(0, -0.025, -LANE_LENGTH / 2 + 2);
  lane.receiveShadow = true;
  group.add(lane);

  const gutterGeo = new THREE.BoxGeometry(GUTTER_WIDTH, GUTTER_DEPTH, LANE_LENGTH);
  const gutterMat = new THREE.MeshStandardMaterial({ color: '#8B6914', roughness: 0.8 });
  geometries.push(gutterGeo); materials.push(gutterMat);
  [-1, 1].forEach((side) => {
    const gutter = new THREE.Mesh(gutterGeo, gutterMat);
    gutter.position.set(side * (LANE_WIDTH / 2 + GUTTER_WIDTH / 2), -0.045, -LANE_LENGTH / 2 + 2);
    gutter.receiveShadow = true;
    group.add(gutter);
  });

  const foulGeo = new THREE.BoxGeometry(LANE_WIDTH, 0.005, 0.03);
  const foulMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  geometries.push(foulGeo); materials.push(foulMat);
  const foulLine = new THREE.Mesh(foulGeo, foulMat);
  foulLine.position.set(0, 0.001, 0);
  group.add(foulLine);

  const arrowPositionsX = [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36];
  const arrowGeo = new THREE.PlaneGeometry(0.05, 0.1);
  const arrowMat = new THREE.MeshStandardMaterial({ color: '#8B4513', roughness: 0.5 });
  geometries.push(arrowGeo); materials.push(arrowMat);
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
  const mat = new THREE.MeshStandardMaterial({ color: '#4488ff', roughness: 0.1, metalness: 0.3 });
  geometries.push(geo); materials.push(mat);
  const ball = new THREE.Mesh(geo, mat);
  ball.position.copy(BALL_START);
  ball.castShadow = true;
  return ball;
}

function makePinMeshes(geometries, materials) {
  const pinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.38, 16);
  const pinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.1 });
  geometries.push(pinGeo); materials.push(pinMat);

  return getPinPositions().map((pos) => {
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(pos.x, 0.19, pos.z);
    pin.castShadow = true;
    pin.receiveShadow = true;
    return pin;
  });
}

// ── Scene component ───────────────────────────────────────────────────────────
const Scene = forwardRef(function Scene({ onSettle }, ref) {
  const mountRef = useRef(null);
  const physicsRef = useRef(null);
  const ballMeshRef = useRef(null);
  const pinMeshesRef = useRef([]);
  const targetBallXRef = useRef(0);
  const previewActiveRef = useRef(true);
  const onSettleRef = useRef(onSettle);

  // Keep onSettleRef pointing at the latest callback every render
  useEffect(() => {
    onSettleRef.current = onSettle;
  });

  useImperativeHandle(ref, () => ({
    previewBall(angle) {
      // angle is -1 to 1; mapped to ±PREVIEW_MAX_X meters
      targetBallXRef.current = angle * PREVIEW_MAX_X;
    },
    throwBall(power, angle, spin) {
      previewActiveRef.current = false;
      physicsRef.current?.applyThrow(power, angle, spin);
    },
    resetPins() {
      physicsRef.current?.resetPins();
      targetBallXRef.current = 0;
      previewActiveRef.current = true;

      // Snap ball mesh back immediately (physics body already moved by resetPins())
      if (ballMeshRef.current) {
        ballMeshRef.current.position.copy(BALL_START);
        ballMeshRef.current.quaternion.set(0, 0, 0, 1);
      }

      // Snap pin meshes back to upright starting positions
      const positions = getPinPositions();
      pinMeshesRef.current.forEach((mesh, i) => {
        if (mesh && positions[i]) {
          mesh.position.set(positions[i].x, 0.19, positions[i].z);
          mesh.quaternion.set(0, 0, 0, 1);
        }
      });
    },
  }), []);

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

    // Scene + camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a2e');

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 2.0, 5);
    camera.lookAt(0, 0, -14);

    // Lights
    const ambient = new THREE.AmbientLight('#ffffff', 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight('#ffffff', 1.2);
    dirLight.position.set(2, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -2;
    dirLight.shadow.camera.right = 2;
    dirLight.shadow.camera.top = 2;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 30;
    scene.add(dirLight);

    // Lane (static geometry)
    scene.add(makeLane(geometries, materials));

    // Ball mesh
    const ballMesh = makeBall(geometries, materials);
    ballMeshRef.current = ballMesh;
    scene.add(ballMesh);

    // Pin meshes
    const pinMeshes = makePinMeshes(geometries, materials);
    pinMeshesRef.current = pinMeshes;
    pinMeshes.forEach((m) => scene.add(m));

    // Physics
    const physics = new PhysicsWorld();
    physicsRef.current = physics;
    physics.init().then(() => {
      physics.ballMesh = ballMesh;
      physics.pinMeshes = pinMeshes;
      physics.onSettle = (standingCount) => {
        onSettleRef.current?.(standingCount);
      };
    });

    // Render loop
    function animate() {
      animFrameId = requestAnimationFrame(animate);

      // In preview mode, move the ball body to the lerped target X so the
      // ball is in the right lane position when throwBall() fires.
      if (previewActiveRef.current && physics.ballBody) {
        const pos = physics.ballBody.translation();
        const newX = pos.x + (targetBallXRef.current - pos.x) * LERP_FACTOR;
        physics.ballBody.setTranslation({ x: newX, y: pos.y, z: pos.z }, true);
      }

      physicsRef.current?.step();
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    function onResize() {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', onResize);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      physics.destroy();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
});

export default Scene;
export { BALL_START, PIN_START_Z, PIN_SPACING, BALL_RADIUS, LANE_LENGTH, getPinPositions };
