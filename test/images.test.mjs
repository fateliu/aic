import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../lib/store.mjs';
import { createApp } from '../server.mjs';
import { createImageProvider, submitImage, refreshImage, recoverImage, readImage } from '../lib/images.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const fixture = (kind = 'image') => ({ id: randomUUID(), schemaVersion: 2, revision: 3, status: 'approved', trace: [], updatedAt: new Date().toISOString(), brief: { name: '测试作品', kind, ratio: '16:9', style: '日系动画' }, refinement: { characterAnchor: '蓝围巾白猫', negativePrompt: '无文字' }, creative: { headline: '测试作品', intro: '故事', shots: Array.from({ length: kind === 'comic' ? 4 : 1 }, (_, i) => ({ visual: `镜头${i}：白猫送信`, narration: '你好' })) } });
const provider = overrides => ({ available: true, model: 'wan2.7-image', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', submit: async () => ({ taskId: 'task-1', status: 'PENDING' }), query: async () => ({ status: 'SUCCEEDED', imageUrl: 'https://result.oss-cn-beijing.aliyuncs.com/test.png' }), download: async () => png, ...overrides });
async function storage(t) { const directory = await mkdtemp(join(tmpdir(), 'manxiang-image-')); t.after(() => rm(directory, { recursive: true, force: true })); return new Store(directory); }
const submit = (store, p, impl, extra = {}) => submitImage(store, p, { revision: p.revision, unitIndex: 0, confirmCost: true, ...extra }, impl);

test('百炼适配器使用原生异步接口，下载不携带密钥且拒绝非OSS地址', async () => {
  const requests = [];
  const impl = createImageProvider({ apiKey: 'fake-test-key', baseUrl: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1', fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return url.includes('/services/') ? { ok: true, json: async () => ({ output: { task_id: 'task-a', task_status: 'PENDING' } }) } : new Response(png);
  } });
  await impl.submit({ prompt: '一只猫', size: '1280*720', referenceImage: 'data:image/png;base64,test' });
  const first = requests[0]; assert.ok(first.url.endsWith('/api/v1/services/aigc/image-generation/generation'));
  assert.equal(first.options.headers['X-DashScope-Async'], 'enable');
  const body = JSON.parse(first.options.body); assert.equal(body.parameters.n, 1); assert.equal(body.input.messages[0].content[0].image, 'data:image/png;base64,test');
  assert.deepEqual(await impl.download('https://result.oss-cn-beijing.aliyuncs.com/test.png'), png);
  assert.equal(requests[1].options.headers, undefined); assert.equal(requests[1].options.redirect, 'error');
  await assert.rejects(impl.download('http://127.0.0.1/private'), /OSS/);
  assert.throws(() => createImageProvider({ baseUrl: 'https://example.com/api/v1' }), /北京/);
});
test('费用与版本门禁、单张任务幂等、重生成请求重复不多扣费', async t => {
  const store = await storage(t), p = fixture(); let submits = 0;
  const impl = provider({ submit: async () => ({ taskId: `task-${++submits}`, status: 'PENDING' }) });
  await assert.rejects(submit(store, p, impl, { confirmCost: false }), /费用/);
  await assert.rejects(submit(store, p, impl, { revision: 1 }), /最新版本/);
  await submit(store, p, impl); await submit(store, await store.get(p.id), impl); assert.equal(submits, 1);
  const first = p.imageJobs[0]; await refreshImage(store, p, first.id, impl);
  await submit(store, p, impl, { replaceJobId: first.id }); await submit(store, await store.get(p.id), impl, { replaceJobId: first.id }); assert.equal(submits, 2);
});
test('下载失败只重试下载，重启后任务和PNG仍可恢复', async t => {
  const store = await storage(t), p = fixture(); let downloads = 0, queries = 0;
  const impl = provider({ query: async () => { queries++; return { status: 'SUCCEEDED', imageUrl: 'https://result.oss-cn-beijing.aliyuncs.com/test.png' }; }, download: async () => { if (!downloads++) throw new Error('模拟下载失败'); return png; } });
  await submit(store, p, impl); const id = p.imageJobs[0].id;
  await refreshImage(store, p, id, impl); assert.equal(p.imageJobs[0].status, 'DOWNLOAD_FAILED');
  const reopened = await store.get(p.id); await refreshImage(store, reopened, id, impl); assert.equal(reopened.imageJobs[0].status, 'SUCCEEDED'); assert.equal(queries, 1);
  assert.deepEqual(await readImage(new Store(store.directory), await store.get(p.id), id), png);
});
test('提交断网保持未知状态，不自动重提；可恢复控制台任务编号', async t => {
  const store = await storage(t), p = fixture(); let submits = 0;
  const impl = provider({ submit: async () => { submits++; throw Object.assign(new Error('断网'), { uncertain: true }); } });
  await submit(store, p, impl); const job = p.imageJobs[0]; assert.equal(job.status, 'SUBMIT_UNKNOWN');
  await submit(store, p, impl); assert.equal(submits, 1);
  await assert.rejects(submit(store, p, impl, { replaceJobId: job.id }), /不能重复提交/);
  await recoverImage(store, p, job.id, 'found-task-id', impl); assert.equal(job.status, 'SUCCEEDED'); assert.equal(submits, 1);
});
test('漫画后续格可传递同版本参考图，不接受其他版本', async t => {
  const store = await storage(t), p = fixture('comic'); const payloads = [];
  const impl = provider({ submit: async request => { payloads.push(request); return { taskId: `task-${payloads.length}`, status: 'PENDING' }; } });
  await submit(store, p, impl); const first = p.imageJobs[0]; await refreshImage(store, p, first.id, impl);
  await submit(store, p, impl, { unitIndex: 1, referenceJobId: first.id });
  assert.ok(payloads[1].referenceImage.startsWith('data:image/png;base64,')); assert.equal(p.imageJobs[1].referenceImage, undefined);
  p.revision++; await assert.rejects(submit(store, p, impl, { unitIndex: 2, referenceJobId: first.id }), /本项目当前版本/);
});
test('HTTP重复点击锁、PNG下载和旧版本禁止提交', async t => {
  const store = await storage(t), p = fixture(); await store.save(p); let release, entered;
  const gate = new Promise(r => { release = r; }), started = new Promise(r => { entered = r; });
  const impl = provider({ submit: async () => { entered(); await gate; return { taskId: 'task-lock', status: 'PENDING' }; } });
  const server = createApp({ directory: store.directory, imageProvider: impl });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(async () => { release(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}/api/projects/${p.id}/images`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const input = { revision: p.revision, unitIndex: 0, confirmCost: true };
  const first = post('', input); await started; assert.equal((await post('', input)).status, 409); release();
  const created = await (await first).json(), id = created.imageJobs[0].id;
  const finished = await (await post(`/${id}/refresh`, {})).json(); assert.equal(finished.imageJobs[0].status, 'SUCCEEDED');
  const image = await fetch(base + `/${id}/file?download=1`); assert.equal(image.headers.get('content-type'), 'image/png'); assert.match(image.headers.get('content-disposition'), /attachment/); assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await post('', { ...input, revision: 0 })).status, 409);
});
