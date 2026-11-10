// Acceptance probe for the Coconut Coast scenery (rubric criteria 5, 6, 7).
//   node scripts/kart-scenery-probe.mjs [baseUrl]     (run from host/; starts its own vite server when no baseUrl)
// Prints one line per criterion: "C5 score=0.42 ..." and exits non-zero when any score < 1.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Sunny Meadow at shot `grid`, measured on the unmodified scene (1280x720, views=1).
const BASELINE = { drawCalls: 349, triangles: 366426 };
const CALLS_FACTOR = 1.5;
const TRIS_FACTOR = 2;

const REQUIRED = {
  village: ['arch', 'hut', 'stall', 'bunting', 'palms', 'fence', 'umbrella'],
  sunshine: ['sand', 'postFence', 'sailboat'],
  pier: ['posts', 'ropeRail', 'rocks'],
  cliffs: ['cliffFace', 'railing', 'lighthouse', 'palms'],
  falls: ['waterfall', 'tunnelShell', 'tunnelLights'],
  palms: ['chevrons', 'guardrail', 'palms'],
  sandy: ['sandPath', 'fence'],
};
const MIN_PALMS_IN_GROVE = 20;
const MIN_TUNNEL_HEIGHT = 7;
const CHASE = { back: 5.5, up: 2.4 };

let server = null;
let baseUrl = process.argv[2];
if (!baseUrl) {
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  baseUrl = server.resolvedUrls.local[0].replace(/\/$/, '');
}

async function launch() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  } catch {
    return chromium.launch({ channel: 'chrome', headless: true });
  }
}

const browser = await launch();
const results = [];
const report = (id, score, detail) => {
  results.push(score);
  console.log(`${id} score=${score.toFixed(2)} ${detail}`);
};

try {
  const open = async (query) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
    page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
    await page.goto(`${baseUrl}/kart-preview.html?${query}`);
    await page.waitForFunction(() => window.__kartReady === true, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    return page;
  };

  const measure = async (query) => {
    const page = await open(query);
    const info = await page.evaluate(() => ({ drawCalls: window.__kartInfo.render.calls, triangles: window.__kartInfo.render.triangles }));
    await page.close();
    return info;
  };

  // Criteria 5 and 6 run on a page that builds the Coconut Coast world itself.
  const page = await open('track=coconut-coast&shot=ccStart');
  const world = await page.evaluate(async ({ REQUIRED, MIN_PALMS_IN_GROVE, MIN_TUNNEL_HEIGHT, CHASE }) => {
    const THREE = await import('/src/games/kart/probe/three.js');
    const { loadTrack } = await import('/src/games/kart/tracks/index.js');
    const { buildWorld } = await import('/src/games/kart/scene/world.js');
    const track = loadTrack('coconut-coast');
    const renderer = new THREE.WebGLRenderer();
    const built = buildWorld(track, renderer);
    const root = built.group;
    root.updateMatrixWorld(true);

    const meshCount = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh || c.isInstancedMesh || c.isPoints || c.isLine) n++; }); return n; };
    const find = (parent, name) => { let hit = null; parent.traverse((c) => { if (!hit && c.name === name) hit = c; }); return hit; };

    const missing = [];
    let wanted = 0;
    const need = (ok, label) => { wanted++; if (!ok) missing.push(label); };
    need(!!find(root, 'ocean'), 'ocean');
    need(!!find(root, 'sky'), 'sky');
    for (const [sec, kinds] of Object.entries(REQUIRED)) {
      const g = find(root, `section:${sec}`);
      need(!!g, `section:${sec}`);
      for (const kind of kinds) {
        const p = g && find(g, `prop:${kind}`);
        need(!!p && meshCount(p) > 0, `${sec}/prop:${kind}`);
      }
    }
    const grove = find(root, 'section:palms') && find(find(root, 'section:palms'), 'prop:palms');
    const palmCount = grove ? grove.children.length : 0;
    need(palmCount >= MIN_PALMS_IN_GROVE, `palms/prop:palms children>=${MIN_PALMS_IN_GROVE} (have ${palmCount})`);

    // Criterion 6: chase camera against the tunnel shell.
    const tunnelPiece = track.pieces.find((p) => p.tunnel);
    const shell = find(root, 'prop:tunnelShell');
    const tunnel = { shell: !!shell, samples: 0, bad: [], minCeiling: Infinity, zfight: 0 };
    if (shell && tunnelPiece) {
      let s0 = null;
      let s1 = null;
      let acc = 0;
      for (const p of track.pieces) {
        const len = p.length ?? (p.angle * Math.PI / 180 * p.radius);
        if (p.tunnel && s0 === null) { s0 = acc; s1 = acc + len; }
        acc += len;
      }
      tunnel.s0 = s0; tunnel.s1 = s1;
      const ray = new THREE.Raycaster();
      const hitDist = (origin, dir) => { ray.set(origin, dir.clone().normalize()); ray.far = 200; const h = ray.intersectObject(shell, true); return h.length ? h[0].distance : Infinity; };
      for (let s = s0; s <= s1; s += 1) {
        const fr = track.frameAt(s);
        for (const lateral of [-0.8, 0, 0.8].map((f) => f * (fr.halfWidth - 1.2))) {
          const kx = fr.x + fr.rx * lateral, kz = fr.z + fr.rz * lateral, ky = track.heightAt(s, lateral);
          const fx = Math.cos(fr.h), fz = Math.sin(fr.h);
          const cam = new THREE.Vector3(kx - fx * CHASE.back, ky + CHASE.up, kz - fz * CHASE.back);
          // the camera trails the kart, so it may sit before the tunnel mouth when the kart is near the entrance: only judge it once inside
          if (s - CHASE.back < s0) continue;
          tunnel.samples++;
          const up = hitDist(cam, new THREE.Vector3(0, 1, 0));
          const left = hitDist(cam, new THREE.Vector3(-fr.rx, 0, -fr.rz));
          const right = hitDist(cam, new THREE.Vector3(fr.rx, 0, fr.rz));
          const ceiling = ky + CHASE.up + up - track.heightAt(s, lateral);
          tunnel.minCeiling = Math.min(tunnel.minCeiling, ceiling);
          if (!Number.isFinite(up) || !Number.isFinite(left) || !Number.isFinite(right)) tunnel.bad.push(`s=${s} lat=${lateral.toFixed(1)} open(up=${up},l=${left},r=${right})`);
        }
      }
      // z-fighting: shell geometry within 5 cm of the road surface near the mouths
      for (const mouth of [s0, s1]) {
        for (let ds = -3; ds <= 3; ds += 0.5) {
          for (let lat = -6; lat <= 6; lat += 1) {
            const s = mouth + ds, fr = track.frameAt(s);
            const x = fr.x + fr.rx * lat, z = fr.z + fr.rz * lat, y = track.heightAt(s, lat);
            ray.set(new THREE.Vector3(x, y + 30, z), new THREE.Vector3(0, -1, 0)); ray.far = 60;
            if (ray.intersectObject(shell, true).some((h) => Math.abs(h.point.y - y) < 0.05)) tunnel.zfight++;
          }
        }
      }
    }
    renderer.dispose();
    return { wanted, missing, palmCount, tunnel };
  }, { REQUIRED, MIN_PALMS_IN_GROVE, MIN_TUNNEL_HEIGHT, CHASE });
  await page.close();

  const c5 = (world.wanted - world.missing.length) / world.wanted;
  report('C5', c5, `${world.wanted - world.missing.length}/${world.wanted} named objects present; missing: ${world.missing.join(', ') || 'none'}`);

  const t = world.tunnel;
  let c6 = 0;
  let c6detail;
  if (!t.shell || !t.samples) {
    c6detail = `no prop:tunnelShell in section:falls (or no tunnel samples); samples=${t.samples}`;
  } else {
    const okSamples = t.samples - t.bad.length;
    const heightOk = t.minCeiling >= MIN_TUNNEL_HEIGHT;
    const zOk = t.zfight === 0;
    c6 = (okSamples / t.samples) * 0.5 + (heightOk ? 0.3 : 0) + (zOk ? 0.2 : 0);
    c6detail = `samples=${t.samples} outside=${t.bad.length} minCeilingAboveRoad=${t.minCeiling.toFixed(2)}m (need >=${MIN_TUNNEL_HEIGHT}) zfightHits=${t.zfight}${t.bad[0] ? ` first=${t.bad[0]}` : ''}`;
  }
  report('C6', c6, c6detail);

  // Criterion 7
  const sunny = await measure('track=sunny-meadow&shot=grid');
  const coast = await measure('track=coconut-coast&shot=ccStart');
  const sunnyOk = sunny.drawCalls === BASELINE.drawCalls && sunny.triangles === BASELINE.triangles;
  const callsOk = coast.drawCalls <= CALLS_FACTOR * BASELINE.drawCalls;
  const trisOk = coast.triangles <= TRIS_FACTOR * BASELINE.triangles;
  const c7 = (sunnyOk ? 0.4 : 0) + (callsOk ? 0.3 : 0) + (trisOk ? 0.3 : 0);
  report('C7', c7, `sunny calls=${sunny.drawCalls} tris=${sunny.triangles} (baseline ${BASELINE.drawCalls}/${BASELINE.triangles}) unchanged=${sunnyOk}; coast calls=${coast.drawCalls} (<=${CALLS_FACTOR * BASELINE.drawCalls}) tris=${coast.triangles} (<=${TRIS_FACTOR * BASELINE.triangles})`);
} finally {
  await browser.close();
  if (server) await server.close();
}
process.exit(results.every((s) => s >= 1) ? 0 : 1);
