#!/usr/bin/env node
// Isolated verification instance for Wii Bowling: relay, host, phone.
//
//   node .claude/skills/verify/scripts/instance.mjs launch
//   node .claude/skills/verify/scripts/instance.mjs doctor
//   node .claude/skills/verify/scripts/instance.mjs cleanup
//
// Ports 18080 / 15173 / 15174 belong to this instance only. Anything already
// listening on them makes launch refuse. The repo's own dev servers (5173,
// 5174, 8080) are never touched.

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(SCRIPT_DIR, '..');
export const REPO = path.resolve(SKILL_DIR, '../../..');
export const RUN_DIR = path.join(SKILL_DIR, 'run');
const RECORD = path.join(RUN_DIR, 'instance.json');

export const PORTS = { relay: 18080, host: 15173, phone: 15174 };
export const URLS = {
  relay: `http://127.0.0.1:${PORTS.relay}`,
  host: `http://127.0.0.1:${PORTS.host}`,
  phone: `http://127.0.0.1:${PORTS.phone}`,
};
const TITLES = { host: 'Wii Bowling — Host', phone: 'Wii Bowling — Controller' };
// Each process's command line must contain its marker before doctor or cleanup trusts its pid.
const MARKERS = { relay: 'server.js', host: 'host.vite.config.mjs', phone: 'phone.vite.config.mjs' };

const COOP_COEP = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function viteConfig(root, port) {
  // Plain object, no imports: the repo's vite configs add HTTPS whenever certs/ exists,
  // and the relay URL here is ws://, so this instance must stay plain HTTP.
  // esbuild jsx automatic replaces @vitejs/plugin-react for the JSX transform.
  return `export default {
  root: ${JSON.stringify(root)},
  esbuild: { jsx: 'automatic' },
  server: {
    host: '127.0.0.1',
    port: ${port},
    strictPort: true,
    headers: ${JSON.stringify(COOP_COEP)},
  },
};
`;
}

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

function pidsListening(port) {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

function commandOf(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function httpBody(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

function readRecord() {
  if (!fs.existsSync(RECORD)) return null;
  return JSON.parse(fs.readFileSync(RECORD, 'utf8'));
}

function writeScaffolding() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, 'host.vite.config.mjs'), viteConfig(path.join(REPO, 'host'), PORTS.host));
  fs.writeFileSync(path.join(RUN_DIR, 'phone.vite.config.mjs'), viteConfig(path.join(REPO, 'phone'), PORTS.phone));
}

function start(name, cwd, args, env, logName) {
  const log = fs.openSync(path.join(RUN_DIR, logName), 'a');
  // detached gives the child its own process group, so cleanup can signal the whole tree.
  const child = spawn(args[0], args.slice(1), {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  return { name, pid: child.pid };
}

async function launch() {
  if (fs.existsSync(RECORD)) {
    console.error(`An instance record already exists at ${RECORD}.`);
    console.error('Run doctor. If it is dead, run cleanup, then launch again.');
    process.exit(1);
  }
  for (const [name, port] of Object.entries(PORTS)) {
    if (!(await portFree(port))) {
      console.error(`Port ${port} (${name}) is already in use. Refusing to start. Occupants: ${pidsListening(port).join(', ') || 'unknown'}`);
      process.exit(1);
    }
  }

  writeScaffolding();

  const viteBin = (dir) => path.join(REPO, dir, 'node_modules/vite/bin/vite.js');
  const procs = {};
  procs.relay = start('relay', path.join(REPO, 'relay'),
    ['node', 'server.js'], { PORT: String(PORTS.relay) }, 'relay.log');
  procs.host = start('host', path.join(REPO, 'host'),
    ['node', viteBin('host'), '--config', path.join(RUN_DIR, 'host.vite.config.mjs')],
    {
      VITE_RELAY_URL: `ws://127.0.0.1:${PORTS.relay}`,
      VITE_PHONE_URL: URLS.phone,
    }, 'host.log');
  procs.phone = start('phone', path.join(REPO, 'phone'),
    ['node', viteBin('phone'), '--config', path.join(RUN_DIR, 'phone.vite.config.mjs')],
    { VITE_RELAY_URL: `ws://127.0.0.1:${PORTS.relay}` }, 'phone.log');

  const record = {
    startedAt: new Date().toISOString(),
    ports: PORTS,
    urls: { ...URLS, phoneWithSession: `${URLS.phone}?session=<id>` },
    pids: { relay: procs.relay.pid, host: procs.host.pid, phone: procs.phone.pid },
  };
  fs.writeFileSync(RECORD, JSON.stringify(record, null, 2));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready =
      (await httpBody(URLS.relay)) === 'ok' &&
      (await httpBody(URLS.host)).includes(TITLES.host) &&
      (await httpBody(URLS.phone)).includes(TITLES.phone);
    if (ready) {
      console.log('Verification instance ready');
      console.log(`HOST_URL=${URLS.host}`);
      console.log(`PHONE_URL=${URLS.phone}`);
      console.log(`RELAY_URL=${URLS.relay}`);
      return;
    }
    const dead = Object.entries(record.pids).find(([, pid]) => !alive(pid));
    if (dead) {
      console.error(`${dead[0]} exited during startup. Last lines of ${dead[0]}.log:`);
      console.error(tail(path.join(RUN_DIR, `${dead[0]}.log`)));
      await cleanup();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.error('Timed out after 60s waiting for relay, host, and phone. Logs are in run/.');
  await cleanup();
  process.exit(1);
}

function tail(file, lines = 20) {
  if (!fs.existsSync(file)) return '(no log)';
  return fs.readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n');
}

export async function doctor({ quiet = false } = {}) {
  const fail = (why) => {
    if (!quiet) console.log(`DOCTOR FAIL: ${why}`);
    return false;
  };
  const record = readRecord();
  if (!record) return fail(`no instance record at ${RECORD}. Run launch first.`);

  for (const [name, pid] of Object.entries(record.pids)) {
    if (!alive(pid)) return fail(`${name} pid ${pid} is not running`);
    const cmd = commandOf(pid);
    if (!cmd.includes(MARKERS[name])) return fail(`${name} pid ${pid} command is not ${MARKERS[name]}: ${cmd}`);
    const owners = pidsListening(record.ports[name]);
    if (!owners.includes(pid)) return fail(`port ${record.ports[name]} owned by [${owners}], not ${name} pid ${pid}`);
  }

  if ((await httpBody(URLS.relay)) !== 'ok') return fail(`relay ${URLS.relay} did not return ok`);
  if (!(await httpBody(URLS.host)).includes(TITLES.host)) return fail(`host ${URLS.host} did not serve the host document`);
  if (!(await httpBody(URLS.phone)).includes(TITLES.phone)) return fail(`phone ${URLS.phone} did not serve the controller document`);

  if (!quiet) {
    console.log('DOCTOR OK');
    console.log(`host ${URLS.host} pid ${record.pids.host}`);
    console.log(`phone ${URLS.phone} pid ${record.pids.phone}`);
    console.log(`relay ${URLS.relay} pid ${record.pids.relay}`);
  }
  return true;
}

async function killGroup(pid, expectedMarker) {
  if (!alive(pid)) return;
  // Only signal a pid whose command still carries its marker; a recycled pid is left alone.
  if (!commandOf(pid).includes(expectedMarker)) return;
  try { process.kill(-pid, 'SIGTERM'); } catch { /* group already gone */ }
  for (let i = 0; i < 20 && alive(pid); i++) await new Promise((r) => setTimeout(r, 150));
  if (alive(pid)) {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

export async function cleanup() {
  const record = readRecord();
  if (record) {
    for (const [name, pid] of Object.entries(record.pids)) {
      await killGroup(pid, MARKERS[name]);
    }
  }
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
  console.log('Instance stopped and run/ removed. Proof under .claude/skills/verify/artifacts/ is kept.');
}

const [command] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (command === 'launch') await launch();
  else if (command === 'doctor') process.exit((await doctor()) ? 0 : 1);
  else if (command === 'cleanup') await cleanup();
  else {
    console.error('usage: instance.mjs launch|doctor|cleanup');
    process.exit(2);
  }
}
