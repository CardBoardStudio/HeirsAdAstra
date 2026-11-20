// node --test deploy/dev-host/dev-host.test.mjs
// Names each instance resolves, and what `install` writes, with sudo, git and
// systemctl stubbed so nothing outside a scratch directory is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./dev-host.sh', import.meta.url));

function run(args, env = {}, path = process.env.PATH) {
  const r = spawnSync('bash', [SCRIPT, ...args], { env: { PATH: path, HOME: process.env.HOME, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const config = (env) => {
  const r = run(['config'], env);
  assert.equal(r.code, 0, r.err);
  return Object.fromEntries(r.out.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
};

test('the default invocation resolves the dev names it always had', () => {
  assert.deepEqual(config({}), {
    INSTANCE: 'dev',
    ROOT: '/opt/drawing-board-dev',
    BRANCH: 'main',
    PORT: '3200',
    IMAGE: 'drawing-board-dev',
    CONTAINER: 'drawing-board-dev',
    ENV_FILE: '/opt/drawing-board-dev/dev.env',
    LOCK: '/opt/drawing-board-dev/update.lock',
    UNIT: 'drawing-board-dev-update',
    GALACTIC_REACH_CHANNEL: 'dev',
  });
  assert.deepEqual(config({ DEV_HOST_INSTANCE: 'dev' }), config({}));
});

test('the stable instance shares no name, path or port with dev and sets no channel', () => {
  const dev = config({});
  const stable = config({ DEV_HOST_INSTANCE: 'stable' });
  assert.deepEqual(stable, {
    INSTANCE: 'stable',
    ROOT: '/opt/drawing-board-stable',
    BRANCH: 'stable',
    PORT: '3201',
    IMAGE: 'drawing-board-stable',
    CONTAINER: 'drawing-board-stable',
    ENV_FILE: '/opt/drawing-board-stable/stable.env',
    LOCK: '/opt/drawing-board-stable/update.lock',
    UNIT: 'drawing-board-stable-update',
    GALACTIC_REACH_CHANNEL: '',
  });
  for (const key of ['ROOT', 'BRANCH', 'PORT', 'IMAGE', 'CONTAINER', 'ENV_FILE', 'LOCK', 'UNIT'])
    assert.notEqual(stable[key], dev[key], key);
});

test('an existing dev-host.conf still overrides branch, port, image and container', () => {
  const root = mkdtempSync(join(tmpdir(), 'dev-host-'));
  try {
    writeFileSync(join(root, 'dev-host.conf'), 'BRANCH=feature\nPORT=4000\nIMAGE=img\nCONTAINER=box\n');
    const c = config({ DEV_HOST_ROOT: root });
    assert.deepEqual([c.ROOT, c.BRANCH, c.PORT, c.IMAGE, c.CONTAINER, c.UNIT], [root, 'feature', '4000', 'img', 'box', 'drawing-board-dev-update']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown instance is refused', () => {
  const r = run(['config'], { DEV_HOST_INSTANCE: 'prod' });
  assert.equal(r.code, 2);
  assert.match(r.err, /dev or stable/);
});

test('an installed copy refuses another instance\'s root', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-host-copy-'));
  try {
    const root = join(dir, 'stable');
    mkdirSync(join(root, 'bin'), { recursive: true });
    writeFileSync(join(root, 'dev-host.conf'), 'BRANCH=stable\nPORT=3201\n');
    writeFileSync(join(root, 'bin', 'dev-host.sh'), readFileSync(SCRIPT));
    const copy = (env) => spawnSync('bash', [join(root, 'bin', 'dev-host.sh'), 'config'], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
    const wrong = copy({});
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /belongs to .*stable, not \/opt\/drawing-board-dev/);
    const right = copy({ DEV_HOST_INSTANCE: 'stable', DEV_HOST_ROOT: root });
    assert.equal(right.status, 0, right.stderr);
    assert.match(right.stdout, /^CONTAINER=drawing-board-stable$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A scratch machine: sudo drops ownership flags and writes units into etc/,
// git clone makes an empty checkout, systemctl only logs.
function machine() {
  const dir = mkdtempSync(join(tmpdir(), 'dev-host-install-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, 'etc'));
  const stub = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${dir}/log"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub('sudo', `case $1 in
  tee) exec tee "${dir}/etc/$(basename "$2")" ;;
  install) shift; a=(); while [ $# -gt 0 ]; do case $1 in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done; exec install "\${a[@]}" ;;
  *) exit 0 ;;
esac`);
  stub('git', `case $1 in
  clone) mkdir -p "\${@: -1}/.git" ;;
  rev-parse) echo 0123456789abcdef0123456789abcdef01234567 ;;
esac`);
  stub('flock', 'exit 0');
  stub('curl', 'exit 0');
  // A container from image drawing-board-<instance>:abc, running unless STUB_STOPPED is set.
  stub('docker', `case "$1 $3" in
  "inspect {{.Config.Image}}") echo "$4:abc" ;;
  "inspect {{.State.Running}}") if [ -n "\${STUB_STOPPED:-}" ]; then echo false; else echo true; fi ;;
esac`);
  const path = `${bin}:${process.env.PATH}`;
  return {
    dir,
    install: (env) => run(['install'], { USER: 'op', ...env }, path),
    archive: (env) => run(['archive'], env, path),
    update: (env) => run(['update'], env, path),
    log: () => (existsSync(join(dir, 'log')) ? readFileSync(join(dir, 'log'), 'utf8') : ''),
    etc: (name) => readFileSync(join(dir, 'etc', name), 'utf8'),
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('install refuses a missing or non-HTTPS origin before touching anything', () => {
  const m = machine();
  try {
    const root = join(m.dir, 'root');
    let r = m.install({ DEV_HOST_ROOT: root });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /public HTTPS origin/);
    assert.doesNotMatch(r.err, /tailnet/);
    r = m.install({ DEV_HOST_ROOT: root, APP_ORIGIN: 'http://play.example.com' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /https:\/\//);
    assert.equal(m.log(), '');
    assert.equal(existsSync(root), false);
  } finally {
    m.done();
  }
});

test('installing dev writes the dev units and env file', () => {
  const m = machine();
  try {
    const root = join(m.dir, 'dev');
    const r = m.install({ DEV_HOST_ROOT: root, APP_ORIGIN: 'https://dev.play.example.com' });
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(readdirSync(join(m.dir, 'etc')).sort(), ['drawing-board-dev-update.service', 'drawing-board-dev-update.timer']);
    const service = m.etc('drawing-board-dev-update.service');
    assert.match(service, /^Description=Deploy the newest Drawing Board main to the dev host/m);
    assert.match(service, new RegExp(`^Environment=DEV_HOST_INSTANCE=dev DEV_HOST_ROOT=${root}$`, 'm'));
    assert.match(service, new RegExp(`^ExecStart=${root}/bin/dev-host.sh update$`, 'm'));
    assert.match(m.etc('drawing-board-dev-update.timer'), /^Description=Check for a new Drawing Board main every minute$/m);
    assert.equal(readFileSync(join(root, 'dev.env'), 'utf8'),
      'APP_ORIGIN=https://dev.play.example.com\nACCESS=invite-only\nNIDO_WALLET_HOST=test.nido.fyi\nRUST_LOG=info\n');
    assert.equal(readFileSync(join(root, 'dev-host.conf'), 'utf8'), 'BRANCH=main\nPORT=3200\n');
    assert.match(m.log(), /systemctl enable --now drawing-board-dev-update\.timer/);
    assert.match(r.out, /https:\/\/dev\.play\.example\.com from http:\/\/127\.0\.0\.1:3200/);
  } finally {
    m.done();
  }
});

test('installing stable beside dev writes only its own files and units', () => {
  const m = machine();
  try {
    const root = join(m.dir, 'stable');
    const r = m.install({ DEV_HOST_INSTANCE: 'stable', DEV_HOST_ROOT: root, APP_ORIGIN: 'https://play.example.com', NIDO_WALLET_HOST: 'wallet.example' });
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(readdirSync(join(m.dir, 'etc')).sort(), ['drawing-board-stable-update.service', 'drawing-board-stable-update.timer']);
    const service = m.etc('drawing-board-stable-update.service');
    assert.match(service, /^Description=Deploy the newest Drawing Board stable to the stable host/m);
    assert.match(service, new RegExp(`^Environment=DEV_HOST_INSTANCE=stable DEV_HOST_ROOT=${root}$`, 'm'));
    assert.deepEqual(readdirSync(root).sort(), ['bin', 'data', 'dev-host.conf', 'repo', 'stable.env']);
    assert.equal(readFileSync(join(root, 'stable.env'), 'utf8'),
      'APP_ORIGIN=https://play.example.com\nACCESS=invite-only\nNIDO_WALLET_HOST=wallet.example\nRUST_LOG=info\n');
    assert.equal(readFileSync(join(root, 'dev-host.conf'), 'utf8'), 'BRANCH=stable\nPORT=3201\n');
    assert.doesNotMatch(m.log(), /drawing-board-dev/);
  } finally {
    m.done();
  }
});

test('ACCESS is overridable on a new install', () => {
  const m = machine();
  try {
    const root = join(m.dir, 'stable');
    const r = m.install({ DEV_HOST_INSTANCE: 'stable', DEV_HOST_ROOT: root, APP_ORIGIN: 'https://play.example.com', ACCESS: 'open' });
    assert.equal(r.code, 0, r.err);
    assert.match(readFileSync(join(root, 'stable.env'), 'utf8'), /^ACCESS=open$/m);
  } finally {
    m.done();
  }
});

test('update runs dev on the dev channel and stable on the released rules, each on its own port and env file', () => {
  const m = machine();
  try {
    for (const instance of ['dev', 'stable']) {
      const root = join(m.dir, instance);
      mkdirSync(join(root, 'repo'), { recursive: true });
      const r = m.update({ DEV_HOST_INSTANCE: instance, DEV_HOST_ROOT: root });
      assert.equal(r.code, 0, r.err);
    }
    const runs = m.log().split('\n').filter((l) => l.startsWith('docker run'));
    const sha = '0123456789abcdef0123456789abcdef01234567';
    assert.deepEqual(runs, [
      `docker run -d --name drawing-board-dev --restart unless-stopped --label commit=${sha} -p 127.0.0.1:3200:3000 -v ${m.dir}/dev/data:/app/data --env-file ${m.dir}/dev/dev.env -e GALACTIC_REACH_CHANNEL=dev -e GIT_COMMIT=${sha} drawing-board-dev:0123456789ab`,
      `docker run -d --name drawing-board-stable --restart unless-stopped --label commit=${sha} -p 127.0.0.1:3201:3000 -v ${m.dir}/stable/data:/app/data --env-file ${m.dir}/stable/stable.env -e GIT_COMMIT=${sha} drawing-board-stable:0123456789ab`,
    ]);
    assert.match(m.log(), /git fetch --quiet origin main\n[^]*git fetch --quiet origin stable\n/);
  } finally {
    m.done();
  }
});

test('archive stops the instance, copies data/ read-only to a new timestamped directory, and restarts it', () => {
  const m = machine();
  try {
    const root = join(m.dir, 'stable');
    mkdirSync(join(root, 'data'), { recursive: true });
    const r = m.archive({ DEV_HOST_INSTANCE: 'stable', DEV_HOST_ROOT: root });
    assert.equal(r.code, 0, r.err);
    const docker = m.log().split('\n').filter((l) => l.startsWith('docker ') && !l.startsWith('docker inspect'));
    const name = r.out.match(/archive\/(data-\d{8}T\d{6}Z)/)[1];
    assert.deepEqual(docker, [
      'docker stop -t 10 drawing-board-stable',
      `docker run --rm --network none --user 0 --entrypoint cp -v ${root}/data:/from:ro -v ${root}/archive:/to drawing-board-stable:abc -a /from /to/${name}`,
      'docker start drawing-board-stable',
    ]);
    assert.ok(existsSync(join(root, 'archive')));
    assert.ok(existsSync(join(root, 'data')));
    assert.match(r.out, /drawing-board-stable is back up/);
  } finally {
    m.done();
  }
});

test('archive leaves a stopped instance stopped', () => {
  const m = machine();
  try {
    const root = join(m.dir, 'dev');
    mkdirSync(join(root, 'data'), { recursive: true });
    const r = m.archive({ DEV_HOST_ROOT: root, STUB_STOPPED: '1' });
    assert.equal(r.code, 0, r.err);
    assert.doesNotMatch(m.log(), /docker (stop|start)/);
    assert.match(m.log(), /docker run .* drawing-board-dev:abc -a \/from/);
  } finally {
    m.done();
  }
});

const shellcheck = spawnSync('shellcheck', ['--version']).status === 0;
test('shellcheck passes', { skip: !shellcheck && 'shellcheck not installed' }, () => {
  const r = spawnSync('shellcheck', ['-s', 'bash', SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
