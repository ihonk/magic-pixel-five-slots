import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameFile = path.join(here, '..', 'game.js');

class Element {
  constructor(id = '') {
    this.id = id;
    this.hidden = false;
    this.textContent = '';
    this.children = [];
    this.style = {};
    this.clientWidth = 600;
    this.clientHeight = 420;
    this.disabled = false;
    this.onclick = null;
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  click() { this.onclick?.(); }
}

class Vec3 {
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vec3().set(this.x || 0, this.y || 0, this.z || 0); }
  copy(other) { return this.set(other.x, other.y, other.z); }
  sub(other) { this.x -= other.x; this.y -= other.y; this.z -= other.z; return this; }
  add(other) { this.x += other.x; this.y += other.y; this.z += other.z; return this; }
  addScaledVector(other, scale) { this.x += other.x * scale; this.y += other.y * scale; this.z += other.z * scale; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const n = this.length() || 1; this.x /= n; this.y /= n; this.z /= n; return this; }
}
class Scale extends Vec3 {
  setScalar(value) { this.x = this.y = this.z = value; }
}
class Object3D {
  constructor() {
    this.position = new Vec3();
    this.rotation = {z: 0};
    this.scale = new Scale();
    this.quaternion = {setFromUnitVectors() {}};
    this.userData = {};
    this.children = [];
  }
  add(...items) { this.children.push(...items); }
  remove(item) { this.children = this.children.filter(child => child !== item); }
}
class Camera extends Object3D {
  lookAt() {}
  updateProjectionMatrix() {}
}
class Renderer {
  constructor() { this.domElement = new Element('canvas'); }
  setPixelRatio() {}
  setSize() {}
  render() {}
}
class Clock {
  constructor() { this.delta = 1 / 60; }
  getDelta() { return this.delta; }
}

const THREE = {
  Scene: class extends Object3D { constructor() { super(); this.background = null; } },
  Color: class { constructor(value) { this.value = value; } },
  OrthographicCamera: Camera,
  WebGLRenderer: Renderer,
  AmbientLight: class extends Object3D {},
  DirectionalLight: class extends Object3D {},
  PointLight: class extends Object3D {},
  Group: class extends Object3D {},
  BoxGeometry: class { dispose() {} },
  TorusGeometry: class { dispose() {} },
  CylinderGeometry: class { dispose() {} },
  MeshStandardMaterial: class {
    constructor(options = {}) { Object.assign(this, options); }
    clone() { return new this.constructor({...this}); }
    dispose() {}
  },
  MeshBasicMaterial: class {
    constructor(options = {}) { Object.assign(this, options); }
    clone() { return new this.constructor({...this}); }
    dispose() {}
  },
  Mesh: class extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } },
  Clock,
  Vector3: Vec3,
  SRGBColorSpace: 'srgb',
  AdditiveBlending: 'additive'
};

function makeHarness() {
  const ids = ['boardWrap', 'modal', 'levelText', 'boardLabel', 'toast', 'slotCount',
    'progress', 'slots', 'queues', 'modalTitle', 'modalBody', 'modalAction', 'resetBtn',
    'helpBtn', 'help', 'closeHelp'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  elements.modal.hidden = true;
  elements.help.hidden = true;

  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const setTimeoutFake = (fn, delay = 0) => {
    const id = ++timerId;
    timers.set(id, {fn, at: now + delay});
    return id;
  };
  const clearTimeoutFake = id => timers.delete(id);
  const advance = milliseconds => {
    const end = now + milliseconds;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };

  let source = fs.readFileSync(gameFile, 'utf8')
    .replace(/^import\s+\*\s+as\s+THREE\s+from\s+['"][^'"]+['"];?\s*/m, '');
  source += `\nreturn {
    bottomExposed, component, target, remaining, dispatch, schedule, step, makeLevel, animate, waveDistances,
    get grid(){return grid}, set grid(v){grid=v},
    get slots(){return slots}, set slots(v){slots=v},
    get queues(){return queues}, set queues(v){queues=v},
    get busy(){return busy}, get done(){return done},
    get effects(){return effects}, get meshes(){return meshes},
    get levelIndex(){return levelIndex}
  };`;

  const factory = new Function('THREE', 'document', 'devicePixelRatio', 'ResizeObserver',
    'requestAnimationFrame', 'setTimeout', 'clearTimeout', source);
  const api = factory(
    THREE,
    {getElementById: id => elements[id], createElement: () => new Element()},
    1,
    class { constructor(callback) { this.callback = callback; } observe() {} },
    () => 0,
    setTimeoutFake,
    clearTimeoutFake
  );
  return {api, elements, advance, timers};
}

function emptyGrid() {
  return Array.from({length: 12}, () => Array(12).fill(null));
}

const tests = [];
function test(name, fn) { tests.push({name, fn}); }

test('bottomExposed returns exactly the lowest occupied cell in each non-empty column', () => {
  const {api} = makeHarness();
  const grid = emptyGrid();
  grid[1][0] = 'P';
  grid[9][0] = 'C';
  grid[4][3] = 'Y';
  grid[11][11] = 'V';
  api.grid = grid;
  assert.deepEqual(api.bottomExposed(), [[0, 9], [3, 4], [11, 11]]);
});

test('component chains only in four directions and includes an L-shaped branch', () => {
  const {api} = makeHarness();
  const grid = emptyGrid();
  grid[5][5] = grid[5][6] = grid[6][6] = 'P';
  grid[6][4] = 'P'; // diagonal-only: must not join
  api.grid = grid;
  assert.deepEqual(new Set(api.component(5, 5).map(([x, y]) => `${x},${y}`)),
    new Set(['5,5', '6,5', '6,6']));
});

test('target chooses the largest exposed component of the requested color', () => {
  const {api} = makeHarness();
  const grid = emptyGrid();
  grid[11][0] = 'C';
  grid[10][4] = grid[10][5] = grid[9][5] = 'C';
  api.grid = grid;
  assert.equal(api.target('C').cells.length, 3);
  assert.equal(api.target('Y'), null);
});

test('five occupied slots with no attackable color ends in a deadlock modal', () => {
  const {api, elements} = makeHarness();
  const grid = emptyGrid();
  grid[11][0] = 'C';
  api.grid = grid;
  api.slots = Array.from({length: 5}, () => ({color: 'P', charges: 3}));
  api.queues = [[{color: 'C', charges: 3}]];
  api.step();
  assert.equal(api.done, true);
  assert.equal(elements.modal.hidden, false);
  assert.equal(elements.modalTitle.textContent, '栏位已满');
});

test('clearing the last component marks completion and shows the win action', () => {
  const {api, elements, advance} = makeHarness();
  const grid = emptyGrid();
  grid[11][0] = grid[10][0] = 'Y';
  api.grid = grid;
  api.meshes.set('0,11', new THREE.Mesh());
  api.meshes.set('0,10', new THREE.Mesh());
  api.slots = [{color: 'Y', charges: 1}, null, null, null, null];
  api.step();
  assert.equal(api.remaining(), 0);
  assert.equal(api.done, false, 'completion waits for the visible wave to finish');
  assert.equal(api.effects.length, 2);
  advance(661);
  assert.equal(elements.modal.hidden, true);
  advance(1);
  assert.equal(api.done, true);
  assert.equal(elements.modalTitle.textContent, '画面清空！');
});

test('animation retires completed effect meshes from both state and scene', () => {
  const {api} = makeHarness();
  const grid = emptyGrid();
  grid[11][0] = 'P';
  api.grid = grid;
  api.meshes.set('0,11', new THREE.Mesh());
  api.slots = [{color: 'P', charges: 2}, null, null, null, null];
  api.step();
  assert.equal(api.effects.length, 1);
  for (let i = 0; i < 30; i++) api.animate();
  assert.equal(api.effects.length, 0);
});

test('restart restores the board, slots, queues, modal, and cancels old scheduled work', () => {
  const {api, elements, advance, timers} = makeHarness();
  const grid = emptyGrid();
  grid[11][0] = 'P';
  api.grid = grid;
  api.slots = [{color: 'P', charges: 1}, null, null, null, null];
  api.step(); // schedules the delayed victory modal
  elements.resetBtn.click();
  assert.equal(timers.size, 0, 'restart left a pre-restart timer alive');
  const initialRemaining = api.remaining();
  assert.equal(api.slots.filter(Boolean).length, 0);
  assert.equal(elements.modal.hidden, true);
  assert.match(elements.slotCount.textContent, /0 \/ 5/);
  advance(1000); // a pre-restart victory callback must not reopen the modal
  assert.equal(api.remaining(), initialRemaining, 'a timer from before restart mutated the new level');
  assert.equal(api.slots.filter(Boolean).length, 0, 'a timer from before restart altered slots');
  assert.equal(elements.modal.hidden, true, 'a timer from before restart reopened the modal');
});

let failures = 0;
for (const {name, fn} of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`✗ ${name}`);
    console.error(error.stack || error);
  }
}
console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
if (failures) process.exitCode = 1;
