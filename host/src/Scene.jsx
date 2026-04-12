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

const AIM_MAX_X = 0.4;      // ±0.4m lateral range from pre-aim offset
const PREVIEW_CLAMP = 0.45; // max |startX| — must match physics MAX_START_X

// Must match MAX_ANGLE_DEG in physics.js
const AIM_ANGLE_DEG = 3;

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

// ── Bowling pin lathe profile ─────────────────────────────────────────────────
// Creates a surface-of-revolution centred at y=0 (body spans -halfH to +halfH).
// Profile matches standard regulation pin proportions.
function makePinGeometry(halfH = 0.19, radialSegments = 16) {
  const s = halfH / 0.19; // scale factor relative to reference half-height
  const pts = [
    // bottom to top — [radius, y]
    [0.000, -0.190], // centre of flat base
    [0.045, -0.190], // base outer edge (45mm)
    [0.049, -0.178], // convex curve — widens going up
    [0.053, -0.158],
    [0.056, -0.130],
    [0.057, -0.100],
    [0.057, -0.070], // belly max
    [0.053, -0.022],
    [0.038,  0.018], // tapering to neck
    [0.024,  0.040],
    [0.022,  0.055], // neck minimum
    [0.026,  0.070],
    [0.038,  0.092], // head widens
    [0.041,  0.112], // head maximum
    [0.035,  0.142],
    [0.022,  0.170],
    [0.008,  0.186],
    [0.000,  0.190], // rounded tip
  ].map(([x, y]) => new THREE.Vector2(x * s, y * s));

  return new THREE.LatheGeometry(pts, radialSegments);
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
  const pinGeo = makePinGeometry(0.19, 16);
  const pinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.1 });
  geometries.push(pinGeo); materials.push(pinMat);

  return getPinPositions().map((pos) => {
    const pin = new THREE.Mesh(pinGeo, pinMat);
    // Physics body origin is at the pin centre (y=0.19), geometry is centred at y=0
    pin.position.set(pos.x, 0.19, pos.z);
    pin.castShadow = true;
    pin.receiveShadow = true;
    return pin;
  });
}

// ── WildHacks banner canvas texture ──────────────────────────────────────────
function makeWildHacksBanner(geometries, materials, textures) {
  const W = 1024, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Purple background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a1a5c');
  bg.addColorStop(0.45, '#4e2478');
  bg.addColorStop(1, '#2a1040');
  ctx.fillStyle = bg;
  ctx.beginPath();
  const r = 22;
  ctx.moveTo(r, 0); ctx.lineTo(W - r, 0); ctx.quadraticCurveTo(W, 0, W, r);
  ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Gold border
  ctx.strokeStyle = '#c89020';
  ctx.lineWidth = 7;
  ctx.beginPath();
  const ri = 17;
  ctx.moveTo(ri + 4, 4); ctx.lineTo(W - ri - 4, 4); ctx.quadraticCurveTo(W - 4, 4, W - 4, ri + 4);
  ctx.lineTo(W - 4, H - ri - 4); ctx.quadraticCurveTo(W - 4, H - 4, W - ri - 4, H - 4);
  ctx.lineTo(ri + 4, H - 4); ctx.quadraticCurveTo(4, H - 4, 4, H - ri - 4);
  ctx.lineTo(4, ri + 4); ctx.quadraticCurveTo(4, 4, ri + 4, 4);
  ctx.closePath();
  ctx.stroke();

  // Gold text gradient
  const tg = ctx.createLinearGradient(0, H * 0.12, 0, H * 0.88);
  tg.addColorStop(0, '#fdf080');
  tg.addColorStop(0.28, '#f0c830');
  tg.addColorStop(0.55, '#c88010');
  tg.addColorStop(1, '#9a5c08');

  // Fit "WILDHACKS" with padding — shrink font until text fits within banner minus padding
  const textPad = 80; // px padding on each side inside border
  const maxTextW = W - textPad * 2;
  let fontSize = 148;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  do {
    ctx.font = `bold italic ${fontSize}px Georgia, "Times New Roman", serif`;
    fontSize -= 2;
  } while (ctx.measureText('WILDHACKS').width > maxTextW && fontSize > 40);

  const cy = H / 2 + 4;

  // Text shadow / emboss
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText('WILDHACKS', W / 2 + 3, cy + 4);

  // Main text
  ctx.fillStyle = tg;
  ctx.fillText('WILDHACKS', W / 2, cy);

  const texture = new THREE.CanvasTexture(canvas);
  textures.push(texture);

  const bannerGeo = new THREE.PlaneGeometry(10, 2.5);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.5, metalness: 0.1,
  });
  geometries.push(bannerGeo);
  materials.push(bannerMat);

  const mesh = new THREE.Mesh(bannerGeo, bannerMat);
  const farZ = (-LANE_LENGTH / 2 + 2) - LANE_LENGTH / 2;
  mesh.position.set(0, 2.8, farZ - 0.35);
  return mesh;
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
  carpet.position.set(0, -(GUTTER_RADIUS + 0.07), laneZ);
  carpet.receiveShadow = true;
  group.add(carpet);

  // Wooden approach platform
  const platformW = LANE_SPACING * 6 + LANE_WIDTH + GUTTER_RADIUS * 4 + 2;
  const platformGeo = new THREE.BoxGeometry(platformW, 0.05, 10);
  const platformMat = new THREE.MeshStandardMaterial({ color: '#c8a96e', roughness: 0.65, metalness: 0.1 });
  geometries.push(platformGeo); materials.push(platformMat);
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, -0.025, 5);
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
  const bgPinGeo    = makePinGeometry(0.19, 10);
  const bgPinMat    = new THREE.MeshStandardMaterial({ color: '#f8f8f8', roughness: 0.3 });
  const brGeo       = new THREE.BoxGeometry(0.45, 0.55, 1.8);
  const brMat       = new THREE.MeshStandardMaterial({ color: '#2e3e50', roughness: 0.5, metalness: 0.3 });
  const lightGeo    = new THREE.BoxGeometry(LANE_WIDTH * 0.85, 0.04, LANE_LENGTH * 0.65);
  const lightMat    = new THREE.MeshStandardMaterial({
    color: '#fffce8', emissive: '#fffce8', emissiveIntensity: 1.2,
  });
  geometries.push(bgLaneGeo, bgGutterGeo, bgPinGeo, brGeo, lightGeo);
  materials.push(bgLaneMat, bgGutterMat, bgPinMat, brMat, lightMat);

  const bgPinOffsets = [
    [0, 0], [-0.152, -0.264], [0.152, -0.264],
    [-0.305, -0.528], [0, -0.528], [0.305, -0.528],
  ];

  for (let i = 1; i <= 3; i++) {
    [-1, 1].forEach((side) => {
      const lx = side * i * LANE_SPACING;

      const lane = new THREE.Mesh(bgLaneGeo, bgLaneMat);
      lane.position.set(lx, -0.025, laneZ);
      lane.receiveShadow = true;
      group.add(lane);

      [-1, 1].forEach((gs) => {
        const gutter = new THREE.Mesh(bgGutterGeo, bgGutterMat);
        gutter.position.set(lx + gs * (LANE_WIDTH / 2 + GUTTER_RADIUS), -0.036, laneZ);
        gutter.receiveShadow = true;
        group.add(gutter);
      });

      bgPinOffsets.forEach(([dx, dz]) => {
        const pin = new THREE.Mesh(bgPinGeo, bgPinMat);
        pin.position.set(lx + dx, 0.19, PIN_START_Z + dz);
        group.add(pin);
      });

      const strip = new THREE.Mesh(lightGeo, lightMat);
      strip.position.set(lx, 4.46, laneZ);
      group.add(strip);

      const br = new THREE.Mesh(brGeo, brMat);
      br.position.set(side * (i - 0.5) * LANE_SPACING, 0.275, laneZ + LANE_LENGTH / 2 + 2);
      group.add(br);
    });
  }

  const mainStrip = new THREE.Mesh(lightGeo, lightMat);
  mainStrip.position.set(0, 4.46, laneZ);
  group.add(mainStrip);

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
  const aimArrowRef = useRef(null);
  const targetBallXRef = useRef(0);
  const targetAimAngleRef = useRef(0); // -1 to 1, maps to ±AIM_ANGLE_DEG
  const previewActiveRef = useRef(true);
  const cameraFollowRef = useRef(false);
  const onSettleRef = useRef(onSettle);

  useEffect(() => {
    onSettleRef.current = onSettle;
  });

  useImperativeHandle(ref, () => ({
    // aimOffset (-1–1): ball starting lane position
    // aimAngle  (-1–1): trajectory direction, maps to ±AIM_ANGLE_DEG
    previewBall(aimOffset = 0, aimAngle = 0) {
      const targetX = Math.max(-PREVIEW_CLAMP, Math.min(PREVIEW_CLAMP, aimOffset * AIM_MAX_X));
      targetBallXRef.current = targetX;
      targetAimAngleRef.current = aimAngle;
    },
    throwBall(power, aimAngle, spin, aimOffset = 0) {
      previewActiveRef.current = false;
      cameraFollowRef.current = true;
      physicsRef.current?.applyThrow(power, aimAngle, spin, aimOffset);
    },
    resetBall() {
      physicsRef.current?.resetBall();
      targetBallXRef.current = 0;
      targetAimAngleRef.current = 0;
      previewActiveRef.current = true;
      cameraFollowRef.current = false;
      if (ballMeshRef.current) {
        ballMeshRef.current.position.copy(BALL_START);
        ballMeshRef.current.quaternion.set(0, 0, 0, 1);
      }
    },
    resetPins() {
      physicsRef.current?.resetPins();
      targetBallXRef.current = 0;
      targetAimAngleRef.current = 0;
      previewActiveRef.current = true;
      cameraFollowRef.current = false;

      if (ballMeshRef.current) {
        ballMeshRef.current.position.copy(BALL_START);
        ballMeshRef.current.quaternion.set(0, 0, 0, 1);
      }

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
    const textures = [];
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
    scene.background = new THREE.Color('#d8d4cc');

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 0.8, 2.0);
    camera.lookAt(0, 0, -4);

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

    scene.add(makeEnvironment(geometries, materials));
    scene.add(makeWildHacksBanner(geometries, materials, textures));
    scene.add(makeLane(geometries, materials));

    const ballMesh = makeBall(geometries, materials);
    ballMeshRef.current = ballMesh;
    scene.add(ballMesh);

    const pinMeshes = makePinMeshes(geometries, materials);
    pinMeshesRef.current = pinMeshes;
    pinMeshes.forEach((m) => scene.add(m));

    // Dashed aim line — shown during pre-shot setup, hidden after throw
    const aimLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -13),
    ]);
    const aimLineMat = new THREE.LineDashedMaterial({
      color: 0xffee00,
      dashSize: 0.35,
      gapSize: 0.2,
    });
    const aimLine = new THREE.Line(aimLineGeo, aimLineMat);
    aimLine.computeLineDistances();
    const aimHelper = new THREE.Group();
    aimHelper.add(aimLine);
    aimArrowRef.current = aimHelper;
    scene.add(aimHelper);

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

      // In preview mode, snap the physics ball body to the target X immediately.
      // This makes D-pad adjustments feel instant on the TV.
      if (previewActiveRef.current && physics.ballBody) {
        const pos = physics.ballBody.translation();
        physics.ballBody.setTranslation({ x: targetBallXRef.current, y: pos.y, z: pos.z }, true);
      }

      physicsRef.current?.step(); // syncs meshes from physics bodies

      // Update dashed aim line to track ball position and current aim angle
      if (aimArrowRef.current) {
        const ballX = ballMeshRef.current?.position.x ?? 0;
        aimArrowRef.current.position.set(ballX, BALL_RADIUS + 0.05, 0);

        if (previewActiveRef.current) {
          const aimAngleRad = targetAimAngleRef.current * (AIM_ANGLE_DEG * Math.PI / 180);
          aimArrowRef.current.rotation.y = -aimAngleRad;
          aimArrowRef.current.visible = true;
        } else {
          aimArrowRef.current.visible = false;
        }
      }

      // Camera follow — tracks ball after throw, restores on reset
      if (!previewActiveRef.current && cameraFollowRef.current && ballMeshRef.current) {
        const ball = ballMeshRef.current.position;
        if (ball.y < -2 || ball.z < -20) {
          cameraFollowRef.current = false;
        } else {
          // Close in as the ball travels: 3m behind at foul line → 0.5m behind at pins
          const progress = Math.max(0, Math.min(1, -ball.z / 15));
          const followOffset = THREE.MathUtils.lerp(3.0, 0.5, progress);
          const followX = ball.x * 0.3;
          // Cap target Z so the camera glides to a stop ~5m before the pins
          const followZ = Math.max(ball.z + followOffset, -10);
          camera.position.x = THREE.MathUtils.lerp(camera.position.x, followX, 0.1);
          camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.9, 0.1);
          camera.position.z = THREE.MathUtils.lerp(camera.position.z, followZ, 0.1);
          camera.lookAt(ball.x * 0.3, 0.3, ball.z - 2);
        }
      }
      if (previewActiveRef.current) {
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.08);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.8, 0.08);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, 2.0, 0.08);
        camera.lookAt(0, 0, -4);
      }

      renderer.render(scene, camera);
    }
    animate();

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
      textures.forEach((t) => t.dispose());
      aimLineGeo.dispose();
      aimLineMat.dispose();
      renderer.dispose();
      physics.destroy();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
});

export default Scene;
export { BALL_START, PIN_START_Z, PIN_SPACING, BALL_RADIUS, GUTTER_RADIUS, LANE_LENGTH, AIM_MAX_X, getPinPositions };
