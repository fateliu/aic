import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { runAgent, demoCreative, posterSvg, validateBrief } from '../lib/agent.mjs';
const brief = { name: '秋日见面会', time: '10 月 3 日 14:00', location: '活动中心', audience: '新同学', signup: '联系负责人', style: '清新自然' };
test('必填字段缺失时不猜测事实', () => { assert.throws(() => validateBrief({ ...brief, location: '' }), /地点/); });
test('海报转义输入并保留完整长字段', () => {
  const svg = posterSvg({ brief: { ...brief, name: '<script>alert(1)</script>', signup: '甲'.repeat(100) }, creative: demoCreative(brief) });
  assert.ok(!svg.includes('<script>')); assert.ok(svg.includes('&lt;script&gt;')); assert.equal((svg.match(/甲/g) || []).length, 100);
});
test('模型通过工具保存、修正错误并审核', async () => {
  let requests = 0;
  const result = await runAgent(brief, { mode: 'ollama', model: 'test-model', fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.stream, false);
    const calls = requests++ === 0 ? [{ function: { name: 'save_creative', arguments: {} } }] : [{ function: { name: 'save_creative', arguments: demoCreative(brief) } }, { function: { name: 'review_creative', arguments: {} } }];
    return { ok: true, json: async () => ({ message: { role: 'assistant', content: '', tool_calls: calls } }) };
  } });
  assert.equal(requests, 2); assert.equal(result.provider, 'ollama'); assert.ok(result.trace.some(e => e.detail.includes('两个分镜')));
});
test('失控模型在六轮后终止且不执行任意工具', async () => {
  let requests = 0;
  await assert.rejects(runAgent(brief, { mode: 'ollama', model: 'test', fetchImpl: async () => { requests++; return { ok: true, json: async () => ({ message: { role: 'assistant', tool_calls: [{ function: { name: 'shell', arguments: { command: 'anything' } } }] } }) }; } }), /6 轮/);
  assert.equal(requests, 6);
});
test('HTTP闭环：持久化、确认门禁、版本冲突、修改撤销确认、导出', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aic-test-'));
  const server = createApp({ directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = 'GET', body) => fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let response = await call('/api/projects', 'POST', { brief, mode: 'demo' }); assert.equal(response.status, 201);
  const project = await response.json(), path = `/api/projects/${project.id}`;
  assert.equal((await call(path + '/export?format=txt')).status, 409);
  const generated = await (await call(path + '/generate', 'POST', {})).json(); assert.equal(generated.status, 'review'); assert.equal(generated.revision, 1);
  assert.equal((await call(path + '/approve', 'POST', { revision: 0 })).status, 409);
  assert.equal((await call(path + '/approve', 'POST', { revision: 1 })).status, 200);
  const text = await (await call(path + '/export?format=txt')).text(); assert.ok(text.includes(brief.location));
  assert.ok((await (await call(path + '/export?format=svg')).text()).startsWith('<svg'));
  const edited = await (await call(path + '/creative', 'PATCH', { creative: { ...generated.creative, headline: '新的相聚' }, revision: 1 })).json(); assert.equal(edited.status, 'review');
  assert.equal((await call(path + '/export?format=txt')).status, 409);
  const reopened = await (await call(path)).json(); assert.equal(reopened.creative.headline, '新的相聚');
  assert.equal((await (await call('/api/projects')).json()).length, 1);
  assert.equal((await fetch(base + '/api/projects', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await call('/data/' + project.id + '.json')).status, 404);
});
test('生成中的重复请求被拒绝，失败后可以重试', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aic-test-'));
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let count = 0;
  const server = createApp({ directory, agent: async b => { if (!count++) { entered(); await pending; throw new Error('模拟服务失败'); } return runAgent(b); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { release(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const p = await (await post('/api/projects', { brief })).json();
  const path = `/api/projects/${p.id}/generate`;
  const first = post(path, {}); await started;
  assert.equal((await post(path, {})).status, 409);
  release(); assert.equal((await (await first).json()).status, 'failed');
  assert.equal((await (await post(path, {})).json()).status, 'review');
});
