/** Mario Kart Wii–style chase camera constants for KartScene. */

export const CAM_DIST = 7.2;
export const CAM_HEIGHT = 3.15;
export const LOOK_AHEAD = 7.2;
export const LOOK_Y = 0.85;
export const FOV = 55;
export const PIVOT_Y = 0.42;
export const TRACK_HALF = 0.58;

export function placeCamera(camera, kart, travel) {
  const backX = Math.sin(travel);
  const backZ = Math.cos(travel);
  camera.position.set(
    kart.x - backX * CAM_DIST,
    CAM_HEIGHT,
    kart.z - backZ * CAM_DIST,
  );
  camera.lookAt(
    kart.x + backX * LOOK_AHEAD,
    LOOK_Y,
    kart.z + backZ * LOOK_AHEAD,
  );
  camera.up.set(0, 1, 0);
  camera.fov = FOV;
}
