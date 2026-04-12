import RAPIER from '@dimforge/rapier3d-compat';
import { getPinPositions, BALL_START, BALL_RADIUS, GUTTER_RADIUS } from './Scene.jsx';

const SETTLE_FRAMES = 20;
const SETTLE_LIN_THRESHOLD = 0.1;  // m/s
const SETTLE_ANG_THRESHOLD = 0.1;  // rad/s
const PIN_HALF_HEIGHT = 0.19;
const PIN_RADIUS = 0.06;
const LANE_HALF_WIDTH = 0.525;
const LANE_HALF_LENGTH = 9.15;

// Normalize throw values to physics units
const MIN_SPEED = 3;
const MAX_SPEED = 12;
const MAX_ANGLE_DEG = 15;
const MAX_SPIN = 10; // rad/s

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.ballBody = null;
    this.pinBodies = [];   // { body, mesh } — mesh set externally after init
    this.ballMesh = null;  // set externally after init
    this.settleCounter = 0;
    this.thrown = false;
    this.settled = false;
    this.onSettle = null;  // callback(standingCount)
  }

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this._createFloor();
    this._createGutterFloors();
    this._createGutterWalls();
    this._createBall();
    this._createPins();
  }

  _createFloor() {
    // Covers the lane only — gutters have their own lower floor
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      LANE_HALF_WIDTH,
      0.025,
      LANE_HALF_LENGTH
    ).setTranslation(0, -0.025, -LANE_HALF_LENGTH + 2);
    this.world.createCollider(colliderDesc, body);
  }

  _createGutterFloors() {
    // Flat floor at the bottom of each halfpipe trough.
    // Top surface at Y = -GUTTER_RADIUS so the ball sits inside the curve.
    const floorHalfThickness = 0.025;
    const gutterFloorY = -(GUTTER_RADIUS + floorHalfThickness);
    [-1, 1].forEach((side) => {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        GUTTER_RADIUS,
        floorHalfThickness,
        LANE_HALF_LENGTH
      ).setTranslation(side * (LANE_HALF_WIDTH + GUTTER_RADIUS), gutterFloorY, -LANE_HALF_LENGTH + 2);
      this.world.createCollider(colliderDesc, body);
    });
  }

  _createGutterWalls() {
    // Outer bumper walls just beyond the halfpipe outer rim
    const wallHalfHeight = 0.2;
    const wallHalfThickness = 0.02;
    const gutterOuterEdge = LANE_HALF_WIDTH + GUTTER_RADIUS * 2 + wallHalfThickness;

    [-1, 1].forEach((side) => {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        wallHalfThickness,
        wallHalfHeight,
        LANE_HALF_LENGTH
      ).setTranslation(side * gutterOuterEdge, wallHalfHeight - GUTTER_RADIUS, -LANE_HALF_LENGTH + 2);
      this.world.createCollider(colliderDesc, body);
    });
  }

  _createBall() {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(BALL_START.x, BALL_START.y, BALL_START.z)
      .setLinearDamping(0.3)
      .setAngularDamping(0.5);
    this.ballBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setRestitution(0.3)
      .setFriction(0.8);
    this.world.createCollider(colliderDesc, this.ballBody);
  }

  _createPins() {
    this.pinBodies = [];
    const positions = getPinPositions();
    positions.forEach((pos) => {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, PIN_HALF_HEIGHT, pos.z)
        .setLinearDamping(0.3)
        .setAngularDamping(0.5);
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cylinder(PIN_HALF_HEIGHT, PIN_RADIUS)
        .setRestitution(0.4)
        .setFriction(0.6);
      this.world.createCollider(colliderDesc, body);
      this.pinBodies.push(body);
    });
  }

  applyThrow(power, angle, spin) {
    if (this.thrown) return;
    this.thrown = true;
    this.settled = false;
    this.settleCounter = 0;

    const speed = MIN_SPEED + power * (MAX_SPEED - MIN_SPEED);
    const angleRad = angle * (MAX_ANGLE_DEG * Math.PI / 180);

    // Ball travels in -Z direction (toward pins), X component from angle
    const vx = Math.sin(angleRad) * speed;
    const vz = -Math.cos(angleRad) * speed;

    this.ballBody.setLinvel({ x: vx, y: 0, z: vz }, true);
    this.ballBody.setAngvel({ x: 0, y: spin * MAX_SPIN, z: 0 }, true);

    // Hard deadline: settle after 5 seconds regardless of physics state
    this._forceSettleTimer = setTimeout(() => {
      if (this.settled) return;
      this.settled = true;
      this.onSettle?.(this.getStandingPinCount());
    }, 5000);
  }

  step() {
    if (!this.world) return;
    this.world.step();
    this._syncMeshes();

    if (this.thrown && !this.settled) {
      this._checkSettle();
    }
  }

  _syncMeshes() {
    // Sync ball
    if (this.ballBody && this.ballMesh) {
      const t = this.ballBody.translation();
      const r = this.ballBody.rotation();
      this.ballMesh.position.set(t.x, t.y, t.z);
      this.ballMesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    // Sync pins
    this.pinBodies.forEach((body, i) => {
      const mesh = this.pinMeshes?.[i];
      if (!mesh) return;
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    });
  }

  _checkSettle() {
    const allStill = [this.ballBody, ...this.pinBodies].every((body) => {
      const lv = body.linvel();
      const av = body.angvel();
      const linMag = Math.sqrt(lv.x ** 2 + lv.y ** 2 + lv.z ** 2);
      const angMag = Math.sqrt(av.x ** 2 + av.y ** 2 + av.z ** 2);
      return linMag < SETTLE_LIN_THRESHOLD && angMag < SETTLE_ANG_THRESHOLD;
    });

    if (allStill) {
      this.settleCounter++;
      if (this.settleCounter >= SETTLE_FRAMES) {
        this.settled = true;
        clearTimeout(this._forceSettleTimer);
        const standing = this.getStandingPinCount();
        this.onSettle?.(standing);
      }
    } else {
      this.settleCounter = 0;
    }
  }

  getStandingPinCount() {
    return this.pinBodies.filter((body) => {
      const t = body.translation();
      const r = body.rotation();

      // Pin must still be upright in Y
      if (t.y < 0.15) return false;

      // Quaternion dot with identity — if < cos(45deg) the pin has tipped over
      // Identity quaternion is (x:0, y:0, z:0, w:1)
      // dot = r.w (since identity has x=y=z=0)
      const dot = Math.abs(r.w);
      return dot > 0.707;
    }).length;
  }

  resetBall() {
    this.ballBody.setTranslation(BALL_START, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.thrown = false;
    this.settled = false;
    this.settleCounter = 0;
  }

  resetPins() {
    clearTimeout(this._forceSettleTimer);

    // Remove existing pin bodies
    this.pinBodies.forEach((body) => this.world.removeRigidBody(body));
    this.pinBodies = [];

    // Reset ball
    this.ballBody.setTranslation(BALL_START, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.thrown = false;
    this.settled = false;
    this.settleCounter = 0;

    // Recreate pins at starting positions
    this._createPins();
  }

  destroy() {
    clearTimeout(this._forceSettleTimer);
    this.world = null;
    this.ballBody = null;
    this.pinBodies = [];
  }
}
