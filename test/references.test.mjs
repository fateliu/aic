import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../lib/store.mjs';
import { createApp } from '../server.mjs';
import { inspectReference, uploadReference, readReference } from '../lib/references.mjs';
import { submitImage } from '../lib/images.mjs';

const jpeg = await readFile(new URL('./fixtures/reference.jpg', import.meta.url));
const dataUrl = bytes => `data:image/jpeg;base64,${bytes.toString('base64')}`;
const fixture = (kind = 'image') => ({ id: randomUUID(), schemaVersion: 2, revision: 2, status: 'approved', approvedAt: 'test', trace: [], updatedAt: new Date().toISOString(), brief: { name: '角色参考测试', kind, style: '日系动画', ratio: '16:9' }, refinement: { characterAnchor: '蓝发少年', negativePrompt: '多余肢体' }, creative: { shots: [{ visual: '角色在海边读信' }] } });
async function storage(t) { const directory = await mkdtemp(join(tmpdir(), 'manxiang-reference-')); t.after(() => rm(directory, { recursive: true, force: true })); return new Store(directory); }
const input = (p, bytes = jpeg) => ({ revision: p.revision, name: '角色立绘.jpg', dataUrl: dataUrl(bytes) });

test('参考图独立校验：真实JPEG、伪装格式、截断、尺寸和大小', () => {
  assert.deepEqual({ ...inspectReference(dataUrl(jpeg)), bytes: undefined }, { bytes: undefined, width: 320, height: 240 });
  assert.throws(() => inspectReference('data:image/png;base64,' + jpeg.toString('base64')), /JPEG/);
  assert.throws(() => inspectReference(dataUrl(Buffer.from('<svg onload="alert(1)">'))), /JPEG/);
  assert.throws(() => inspectReference(dataUrl(jpeg.subarray(0, -5))), /损坏/);
  const narrow = Buffer.from(jpeg), sof = narrow.indexOf(Buffer.from([0xff, 0xc0]));
  narrow.writeUInt16BE(100, sof + 5); assert.throws(() => inspectReference(dataUrl(narrow)), /240/);
  const huge = Buffer.from(jpeg); huge.writeUInt16BE(8000, sof + 7); assert.throws(() => inspectReference(dataUrl(huge)), /2048/);
  assert.throws(() => inspectReference('data:image/jpeg;base64,' + 'A'.repeat(7 * 1024 * 1024)), error => error.status === 413);
});

test('上传持久化、重复内容去重、旧版本拒绝、项目文件隔离', async t => {
  const store = await storage(t), p = fixture();
  const { reference } = await uploadReference(store, p, input(p));
  const reopened = await store.get(p.id);
  assert.deepEqual(await readReference(new Store(store.directory), reopened, reference.id), jpeg);
  assert.equal(reopened.revision, 2); assert.equal(reopened.status, 'approved'); assert.equal(reopened.approvedAt, 'test');
  await rm(join(store.directory, 'references', p.id, reference.id + '.jpg'));
  assert.equal((await uploadReference(store, reopened, input(p))).reference.id, reference.id);
  assert.deepEqual(await readReference(store, reopened, reference.id), jpeg);
  assert.equal((await store.get(p.id)).references.length, 1);
  assert.ok(!JSON.stringify(reopened).includes('base64')); assert.ok(!JSON.stringify(reopened).includes(store.directory));
  await assert.rejects(uploadReference(store, p, { ...input(p), revision: 0 }), error => error.status === 409);
  await assert.rejects(readReference(store, fixture(), reference.id), error => error.status === 404);
  await assert.rejects(readReference(store, p, '../private'), error => error.status === 404);
  await assert.rejects(uploadReference(store, fixture('animation'), input(p)), /图片和漫画/);
});

test('上传参考实际传给单图和漫画生图：来源快照、互斥、权限和费用门禁', async t => {
  const store = await storage(t);
  for (const kind of ['image', 'comic']) {
    const p = fixture(kind), payloads = [];
    const provider = { available: true, model: 'test', baseUrl: 'mock://test', submit: async payload => { payloads.push(payload); return { taskId: 'task-ref', status: 'PENDING' }; } };
    const { reference } = await uploadReference(store, p, input(p));
    const args = { revision: p.revision, unitIndex: 0, referenceUploadId: reference.id, confirmCost: true };
    await assert.rejects(submitImage(store, p, { ...args, confirmCost: false }, provider), /费用/);
    await assert.rejects(submitImage(store, p, { ...args, referenceJobId: randomUUID() }, provider), /只选择一种/);
    await assert.rejects(submitImage(store, p, { ...args, referenceUploadId: randomUUID() }, provider), error => error.status === 404);
    assert.equal(payloads.length, 0);
    await submitImage(store, p, args, provider);
    assert.equal(payloads.length, 1); assert.equal(payloads[0].referenceImage, dataUrl(jpeg));
    assert.match(payloads[0].prompt, /以参考图为准/); assert.match(payloads[0].prompt, /海边读信/);
    assert.equal(p.imageJobs[0].referenceUploadId, reference.id); assert.equal(p.imageJobs[0].referenceName, reference.name);
    assert.equal(p.imageJobs[0].referenceImage, undefined);
    await submitImage(store, p, args, provider); assert.equal(payloads.length, 1);
  }
});

test('HTTP参考图上传独立大请求上限、本地预览、来源限制和非法输入', async t => {
  const store = await storage(t), p = fixture(), other = fixture(); await store.save(p); await store.save(other);
  let submitted = 0;
  const server = createApp({ directory: store.directory, imageProvider: { available: true, model: 'test', submit: () => { submitted++; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const route = `/api/projects/${p.id}/references`;
  const post = (body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  // A valid JPEG comment segment makes the request exceed the normal 96 KiB cap.
  const comment = Buffer.alloc(60_002); comment[0] = 0xff; comment[1] = 0xfe; comment.writeUInt16BE(60_000, 2);
  const padded = Buffer.concat([jpeg.subarray(0, 2), comment, comment, jpeg.subarray(2)]);
  const response = await post(input(p, padded)); assert.equal(response.status, 200);
  const { project, reference } = await response.json(); assert.equal(project.references.length, 1); assert.equal(submitted, 0);
  const image = await fetch(base + reference.asset); assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff'); assert.deepEqual(Buffer.from(await image.arrayBuffer()), padded);
  assert.equal((await fetch(base + reference.asset.replace(p.id, other.id))).status, 404);
  assert.equal((await post(input(p), { Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await post(input(p), { 'Content-Type': 'image/jpeg' })).status, 415);
  assert.equal((await post({ ...input(p), revision: 0 })).status, 409);
  assert.equal((await post({ ...input(p), dataUrl: 'data:image/jpeg;base64,bad' })).status, 400);
  const normal = await fetch(base + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(100_000) }) });
  assert.equal(normal.status, 413);
});
