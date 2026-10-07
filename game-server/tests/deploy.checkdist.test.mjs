// tests/deploy.checkdist.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkDist, depsHash } from '../scripts/deploy.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gs-dist-'));

test('checkDist: 两个标记都在 → ok', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), "router.post('/api/client/v1/auth/sso-exchange'");
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), "Controller('health')");
  assert.deepEqual(checkDist(dir), { ok: true, missing: [] });
});

test('checkDist: 缺标记 → 报缺', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'x.js'), 'nothing here');
  assert.deepEqual(checkDist(dir), { ok: false, missing: ['sso-exchange', 'health'] });
});

test('depsHash: 与键顺序无关且稳定', () => {
  const f1 = path.join(tmp(), 'p.json'), f2 = path.join(tmp(), 'p.json');
  fs.writeFileSync(f1, JSON.stringify({ dependencies: { b: '1.0.0', a: '2.0.0' } }));
  fs.writeFileSync(f2, JSON.stringify({ dependencies: { a: '2.0.0', b: '1.0.0' } }));
  assert.equal(depsHash(f1), depsHash(f2));
  assert.match(depsHash(f1), /^[0-9a-f]{32}$/);
});
