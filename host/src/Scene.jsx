import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { PhysicsWorld } from './physics.js';

// ── Lane constants (meters) ───────────────────────────────────────────────────
const LANE_LENGTH = 18.3;
const LANE_WIDTH = 1.05;
const GUTTER_RADIUS = 0.13; // halfpipe radius — must be > BALL_RADIUS so ball fits
const BALL_RADIUS = 0.11;

const PIN_START_Z = -15.0;
const PIN_SPACING = 0.305;
const BALL_START = new THREE.Vector3(0, BALL_RADIUS, 0);

const LANE_SPACING = 1.8;  // center-to-center distance between adjacent lanes

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

  // Halfpipe gutter — bottom half of a cylinder (U-shape opening upward).
  // After rotateX(π/2) the cylinder lies along Z. With thetaStart=3π/2, thetaLength=π
  // the surface runs from the left rim (−r,0) through the bottom (0,−r) to the right rim (r,0).
  // Rims sit flush with the lane surface (Y=0); the trough bottom is at Y=−GUTTER_RADIUS.
  const gutterGeo = new THREE.CylinderGeometry(
    GUTTER_RADIUS, GUTTER_RADIUS,
    LANE_LENGTH,
    24, 1,
    true,                          // open-ended — no caps
    Math.PI * 1.5, Math.PI,        // bottom half: left-rim → trough → right-rim
  );
  gutterGeo.rotateX(Math.PI / 2);  // lay cylinder along Z (lane direction)
  const gutterMat = new THREE.MeshStandardMaterial({
    color: '#8B6914', roughness: 0.8, side: THREE.DoubleSide,
  });
  geometries.push(gutterGeo); materials.push(gutterMat);
  [-1, 1].forEach((side) => {
    const gutter = new THREE.Mesh(gutterGeo, gutterMat);
    // Center the cylinder axis so its rims land exactly at the lane edge
    gutter.position.set(side * (LANE_WIDTH / 2 + GUTTER_RADIUS), 0, -LANE_LENGTH / 2 + 2);
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

// ── Bowling-center environment ────────────────────────────────────────────────
function makeEnvironment(geometries, materials) {
  const group = new THREE.Group();
  const laneZ = -LANE_LENGTH / 2 + 2;   // same centre-Z as the main lane box
  const farZ  = laneZ - LANE_LENGTH / 2; // = -16.3 m (pin-deck end)

  // Carpet floor — sits below the gutter bottoms (Y < -GUTTER_RADIUS)
  const carpetGeo = new THREE.PlaneGeometry(50, LANE_LENGTH + 14);
  const carpetMat = new THREE.MeshStandardMaterial({ color: '#1c1830', roughness: 1.0 });
  geometries.push(carpetGeo); materials.push(carpetMat);
  const carpet = new THREE.Mesh(carpetGeo, carpetMat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, -(GUTTER_RADIUS + 0.07), laneZ); // well below gutter bottoms
  carpet.receiveShadow = true;
  group.add(carpet);

  // Wooden approach platform — spans all lanes at lane-surface level.
  // Starts at the foul line (Z=0) and extends behind the camera, connecting
  // the near ends of every lane into one continuous wooden surface.
  const platformW = LANE_SPACING * 6 + LANE_WIDTH + GUTTER_RADIUS * 4 + 2; // covers all 7 lanes
  const platformGeo = new THREE.BoxGeometry(platformW, 0.05, 10);
  const platformMat = new THREE.MeshStandardMaterial({ color: '#c8a96e', roughness: 0.65, metalness: 0.1 });
  geometries.push(platformGeo); materials.push(platformMat);
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, -0.025, 5); // Z 0→10, top surface flush with lane top (Y=0)
  platform.receiveShadow = true;
  group.add(platform);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(50, LANE_LENGTH + 14);
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 1.0 });
  geometries.push(ceilGeo); materials.push(ceilMat);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 4.5, laneZ);
  group.add(ceil);

  // Back wall at the pin-deck end
  const backWallGeo = new THREE.PlaneGeometry(50, 6);
  const backWallMat = new THREE.MeshStandardMaterial({ color: '#b8a88a', roughness: 0.8 });
  geometries.push(backWallGeo); materials.push(backWallMat);
  const backWall = new THREE.Mesh(backWallGeo, backWallMat);
  backWall.position.set(0, 3.0, farZ - 0.5);
  group.add(backWall);

  // Shared geometry for all background lanes and their decorations
  const bgLaneGeo   = new THREE.BoxGeometry(LANE_WIDTH, 0.05, LANE_LENGTH);
  const bgLaneMat   = new THREE.MeshStandardMaterial({ color: '#c8a96e', roughness: 0.6, metalness: 0.1 });
  const bgGutterGeo = new THREE.BoxGeometry(GUTTER_RADIUS * 2, 0.03, LANE_LENGTH);
  const bgGutterMat = new THREE.MeshStandardMaterial({ color: '#5a3c10', roughness: 0.9 });
  const bgPinGeo    = new THREE.CylinderGeometry(0.045, 0.045, 0.32, 8);
  const bgPinMat    = new THREE.MeshStandardMaterial({ color: '#f8f8f8', roughness: 0.3 });
  const brGeo       = new THREE.BoxGeometry(0.45, 0.55, 1.8);
  const brMat       = new THREE.MeshStandardMaterial({ color: '#2e3e50', roughness: 0.5, metalness: 0.3 });
  // Emissive light panel above each lane (main lane gets one too, added below)
  const lightGeo    = new THREE.BoxGeometry(LANE_WIDTH * 0.85, 0.04, LANE_LENGTH * 0.65);
  const lightMat    = new THREE.MeshStandardMaterial({
    color: '#fffce8', emissive: '#fffce8', emissiveIntensity: 1.2,
  });
  geometries.push(bgLaneGeo, bgGutterGeo, bgPinGeo, brGeo, lightGeo);
  materials.push(bgLaneMat, bgGutterMat, bgPinMat, brMat, lightMat);

  // Front-six pin positions used on every background lane
  const bgPinOffsets = [
    [0, 0], [-0.152, -0.264], [0.152, -0.264],
    [-0.305, -0.528], [0, -0.528], [0.305, -0.528],
  ];

  for (let i = 1; i <= 3; i++) {
    [-1, 1].forEach((side) => {
      const lx = side * i * LANE_SPACING;

      // Lane surface
      const lane = new THREE.Mesh(bgLaneGeo, bgLaneMat);
      lane.position.set(lx, -0.025, laneZ);
      lane.receiveShadow = true;
      group.add(lane);

      // Flat gutter strips (simpler than halfpipe for bg lanes)
      [-1, 1].forEach((gs) => {
        const gutter = new THREE.Mesh(bgGutterGeo, bgGutterMat);
        gutter.position.set(lx + gs * (LANE_WIDTH / 2 + GUTTER_RADIUS), -0.036, laneZ);
        gutter.receiveShadow = true;
        group.add(gutter);
      });

      // Simplified pin cluster
      bgPinOffsets.forEach(([dx, dz]) => {
        const pin = new THREE.Mesh(bgPinGeo, bgPinMat);
        pin.position.set(lx + dx, 0.16, PIN_START_Z + dz);
        group.add(pin);
      });

      // Overhead light strip
      const strip = new THREE.Mesh(lightGeo, lightMat);
      strip.position.set(lx, 4.46, laneZ);
      group.add(strip);

      // Ball-return unit between this lane and the next one toward centre
      const br = new THREE.Mesh(brGeo, brMat);
      br.position.set(side * (i - 0.5) * LANE_SPACING, 0.275, laneZ + LANE_LENGTH / 2 + 2);
      group.add(br);
    });
  }

  // Overhead light strip for the main (playable) lane
  const mainStrip = new THREE.Mesh(lightGeo, lightMat);
  mainStrip.position.set(0, 4.46, laneZ);
  group.add(mainStrip);

  // Ball-return unit between main lane and lane ±1 on each side
  [-1, 1].forEach((side) => {
    const br = new THREE.Mesh(brGeo, brMat);
    br.position.set(side * LANE_SPACING / 2, 0.275, laneZ + LANE_LENGTH / 2 + 2);
    group.add(br);
  });

  return group;
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
    scene.background = new THREE.Color('#d8d4cc'); // matches ceiling colour

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

    // Environment (background lanes, ceiling, floor, walls)
    scene.add(makeEnvironment(geometries, materials));

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
export { BALL_START, PIN_START_Z, PIN_SPACING, BALL_RADIUS, GUTTER_RADIUS, LANE_LENGTH, getPinPositions };
