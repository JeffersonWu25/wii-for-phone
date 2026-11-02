// Pure per-view math for split screen, kept free of three.js so it can be tested without WebGL.

const FOV = 60;
const MIN_HFOV = 75; // narrow panes (2p halves) widen the vertical FOV so the sides of the road are not cropped

// Vertical FOV in degrees for a pane of the given aspect ratio.
export const viewFov = (aspect) => Math.max(FOV, (2 * Math.atan(Math.tan((MIN_HFOV * Math.PI) / 360) / aspect) * 180) / Math.PI);

// Whole-pixel GL viewport (y from the bottom) for a view given in screen fractions (y from the top).
// Edges are rounded, not sizes, so neighbouring panes tile the canvas with no seam or overlap.
export function viewRect(view, width, height) {
  const x = Math.round(view.x * width);
  const y = Math.round(view.y * height);
  const w = Math.round((view.x + view.w) * width) - x;
  const h = Math.round((view.y + view.h) * height) - y;
  return { x, y: height - y - h, w, h };
}
