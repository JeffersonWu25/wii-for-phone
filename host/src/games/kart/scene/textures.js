// Canvas-generated textures and the shared toon material helper. Nothing external is loaded.
import * as THREE from 'three';

export function canvasTex(w, h, draw, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// 4-step ramp that gives MeshToonMaterial its cel look (kept soft enough to stay cheerful).
let gradient;
export function toonGradient() {
  if (!gradient) {
    const data = new Uint8Array([120, 120, 120, 255, 175, 175, 175, 255, 225, 225, 225, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

// Toon material with a cool rim light, the "saturated toy" look for props and karts.
export function toonMat(opts = {}) {
  const { rim = 0.35, rimColor = [0.55, 0.78, 1.0], ...rest } = opts;
  const mat = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...rest });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Vector4(rimColor[0], rimColor[1], rimColor[2], rim) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uRim;')
      .replace(
        '#include <opaque_fragment>',
        `float rimT = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
         outgoingLight += uRim.rgb * rimT * uRim.a;
         #include <opaque_fragment>`
      );
  };
  mat.customProgramCacheKey = () => 'toonrim';
  return mat;
}

const SPONSORS = [
  { text: 'ZOOMCOLA', bg: '#e8272a', fg: '#ffffff', accent: '#ffd23a' },
  { text: 'PEBBLE TIRES', bg: '#1b5fd6', fg: '#ffffff', accent: '#ffd23a' },
  { text: 'TURBO TOAST', bg: '#ffb320', fg: '#3a1a08', accent: '#e8272a' },
  { text: 'SUNNY MEADOW', bg: '#14a64a', fg: '#ffffff', accent: '#ffe14a' },
];

function drawPanel(ctx, x, y, w, h, sp) {
  ctx.fillStyle = sp.bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = sp.accent;
  ctx.fillRect(x, y, w, h * 0.09);
  ctx.fillRect(x, y + h * 0.91, w, h * 0.09);
  ctx.fillStyle = sp.fg;
  ctx.font = `900 ${Math.floor(h * 0.56)}px "Arial Black", Impact, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sp.text, x + w / 2, y + h * 0.53, w * 0.9);
}

// One tile = 4 sponsor panels, 6 m each. Rows: grey base, banner, white cap (bottom to top of the wall profile).
export function wallTexture() {
  return canvasTex(4096, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(0, 0, w, h);
    SPONSORS.forEach((sp, i) => drawPanel(ctx, i * (w / 4) + 6, h * 0.22, w / 4 - 12, h * 0.56, sp));
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h * 0.16);
  });
}

// Banner board for fences: full-height sponsor panels.
export function bannerTexture() {
  return canvasTex(4096, 192, (ctx, w, h) => {
    SPONSORS.slice().reverse().forEach((sp, i) => drawPanel(ctx, i * (w / 4), 0, w / 4, h, sp));
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 4; i++) ctx.fillRect(i * (w / 4), 0, 5, h);
  });
}

export function chainLinkTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(205,215,225,0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let k = -2; k <= 4; k++) {
      ctx.moveTo(-10, k * 32);
      ctx.lineTo(w + 10, k * 32 + w + 20);
      ctx.moveTo(-10, k * 32 + w + 20);
      ctx.lineTo(w + 10, k * 32);
    }
    ctx.stroke();
  }, { repeat: true });
}

export function signTexture() {
  return canvasTex(2048, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a8f45');
    g.addColorStop(1, '#0f6a31');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe14a';
    ctx.fillRect(0, 0, w, 26);
    ctx.fillRect(0, h - 26, w, 26);
    for (let k = 0; k < 2; k++) {
      const ox = k * (w / 2);
      // sun emblem
      ctx.save();
      ctx.translate(ox + 190, h / 2);
      ctx.fillStyle = '#ffd23a';
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(-14, -150, 28, 54);
      }
      ctx.beginPath();
      ctx.arc(0, 0, 84, 0, Math.PI * 2);
      ctx.fillStyle = '#ffb320';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 150px "Arial Black", Impact, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('SUNNY', ox + 340, h * 0.34);
      ctx.fillStyle = '#ffe14a';
      ctx.fillText('MEADOW', ox + 340, h * 0.68);
    }
  });
}

export function startBoardTexture() {
  return canvasTex(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) ctx.fillRect(i * 32, j * 16, 32, 16);
    ctx.fillStyle = '#ffd23a';
    ctx.font = '900 70px "Arial Black", Impact, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SUNNY MEADOW CIRCUIT', w / 2, h * 0.64);
  });
}

export function balloonTexture() {
  return canvasTex(512, 256, (ctx, w, h) => {
    const cols = ['#ff3b3b', '#ffffff', '#ffc21a', '#ffffff', '#2f7bff', '#ffffff'];
    const n = 12;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect((i * w) / n, 0, w / n + 1, h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.0)';
  });
}

export function waterTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#27b4ee');
    g.addColorStop(1, '#1b8fe0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const l = 24 + rnd() * 40;
      for (const dx of [-w, 0, w]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y);
        ctx.quadraticCurveTo(x + dx + l / 2, y - 7, x + dx + l, y);
        ctx.stroke();
      }
    }
  }, { repeat: true });
}

export function blobShadowTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}
