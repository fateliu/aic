import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { createProvider } from '../lib/providers.mjs';
import { loadSkills } from '../lib/skills.mjs';
import { validateStudioBrief, refinePrompt, runStudio, demoRefinement, demoStudioCreative } from '../lib/studio.mjs';
const brief = { name: '云端来信', prompt: '戴蓝色围巾的白猫坐纸飞机去地面送信，温暖四格漫画。', kind: 'comic', ratio: '16:9', style: '日系动画' };
const response = message => ({ ok: true, json: async () => ({ choices: [{ message }] }) });
test('四种创作类型分别产生1、1、4、3个单元', async () => {
  for (const [kind, count] of Object.entries({ text: 1, image: 1, comic: 4, animation: 3 })) {
    const b = validateStudioBrief({ ...brief, kind });
    const child = await refinePrompt(b, { mode: 'demo' });
    const main = await runStudio(b, { mode: 'demo', refinement: child.refinement });
    assert.equal(main.creative.shots.length, count);
    assert.ok(child.refinement.refinedPrompt.includes(b.prompt));
    assert.ok(child.trace.some(e => e.agent === 'prompt_subagent'));
  }
});
test('DeepSeek子Agent使用独立JSON调用，主Agent保留tool_call_id并根据检查继续', async () => {
  const records = [], refinement = demoRefinement(brief), creative = demoStudioCreative(brief, refinement);
  const outputs = [
    { role: 'assistant', content: JSON.stringify(refinement) },
    { role: 'assistant', content: null, tool_calls: [{ id: 'save-1', type: 'function', function: { name: 'save_creative', arguments: JSON.stringify(creative) } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'review-1', type: 'function', function: { name: 'review_creative', arguments: '{}' } }] },
  ];
  const options = { mode: 'deepseek', apiKey: 'test-key-not-real', model: 'test-model', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions'); assert.equal(init.headers.Authorization, 'Bearer test-key-not-real');
    const body = JSON.parse(init.body); records.push(body); return response(outputs.shift());
  } };
  const child = await refinePrompt(brief, options);
  assert.deepEqual(records[0].response_format, { type: 'json_object' }); assert.equal(records[0].tools, undefined);
  const result = await runStudio(brief, { ...options, refinement: child.refinement });
  assert.equal(result.creative.shots.length, 4); assert.equal(records[1].messages.length, 2);
  assert.equal(records[2].messages.at(-1).tool_call_id, 'save-1'); assert.equal(records[2].messages.at(-1).role, 'tool');
  assert.ok(!JSON.stringify(result).includes('test-key-not-real'));
});
test('无密钥不会调用DeepSeek；HTTP失败不回传服务端敏感正文', async () => {
  assert.throws(() => createProvider({ mode: 'deepseek' }), /DEEPSEEK_API_KEY/);
  const provider = createProvider({ mode: 'deepseek', apiKey: 'test', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ secret: 'do-not-expose' }) }) });
  await assert.rejects(provider.chat([]), error => /密钥无效/.test(error.message) && !error.message.includes('do-not-expose'));
});
test('子Agent格式错误最多重试一次；主Agent拒绝任意工具并在六轮停止', async () => {
  let childCalls = 0, mainCalls = 0;
  await assert.rejects(refinePrompt(brief, { mode: 'deepseek', apiKey: 'test', fetchImpl: async () => { childCalls++; return response({ role: 'assistant', content: '{}' }); } }), /两次/);
  assert.equal(childCalls, 2);
  await assert.rejects(runStudio(brief, { mode: 'deepseek', apiKey: 'test', refinement: demoRefinement(brief), fetchImpl: async () => { mainCalls++; return response({ role: 'assistant', tool_calls: [{ id: `call-${mainCalls}`, function: { name: 'execute_shell', arguments: '{}' } }] }); } }), /6 轮/);
  assert.equal(mainCalls, 6);
});
test('Skill白名单、类型限制及内容快照', async () => {
  const [skill] = await loadSkills(['comic-continuity'], 'comic');
  assert.equal(skill.sha256.length, 64); assert.ok(skill.instructions.includes('角色')); assert.ok(skill.source.includes('JimLiu'));
  await assert.rejects(loadSkills(['../../.env'], 'comic'), /不存在/);
  await assert.rejects(loadSkills(['comic-continuity'], 'image'), /不适用/);
  await assert.rejects(loadSkills(['a', 'b', 'c', 'd'], 'comic'), /最多/);
});
test('新流程HTTP：提示词门禁、四格草稿、媒体接口、编辑失效、密钥不泄露', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'manxiang-test-'));
  const server = createApp({ directory, deepseekKey: 'only-on-server' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = 'GET', body) => fetch(base + path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const config = await (await call('/api/config')).json(); assert.equal(config.deepseekAvailable, true); assert.ok(!JSON.stringify(config).includes('only-on-server'));
  assert.equal((await (await call('/api/skills')).json()).length, 3);
  const p = await (await call('/api/projects', 'POST', { brief, mode: 'demo', skillIds: ['comic-continuity'] })).json();
  const path = `/api/projects/${p.id}`;
  assert.equal((await call(path + '/generate', 'POST', { revision: 0 })).status, 409);
  const refined = await (await call(path + '/refine', 'POST', { revision: 0 })).json(); assert.equal(refined.status, 'prompt_review'); assert.equal(refined.skills.length, 1);
  assert.equal((await call(path + '/refine', 'POST', { revision: 0 })).status, 409);
  assert.equal((await call(path + '/generate', 'POST', { revision: 0 })).status, 409);
  const generated = await (await call(path + '/generate', 'POST', { revision: refined.revision })).json(); assert.equal(generated.creative.shots.length, 4);
  assert.ok(generated.trace.some(e => e.agent === 'prompt_subagent')); assert.ok(generated.trace.some(e => e.agent === 'director'));
  assert.equal((await call(path + '/media-request', 'POST', {})).status, 409);
  await call(path + '/approve', 'POST', { revision: generated.revision });
  const media = await (await call(path + '/media-request', 'POST', {})).json(); assert.equal(media.status, 'not_connected'); assert.equal(media.request.units.length, 4);
  assert.equal((await call(path + '/export?format=svg')).status, 409);
  const text = await (await call(path + '/export?format=txt')).text(); assert.ok(text.includes(brief.prompt)); assert.ok(text.includes('角色锚点'));
  const updated = await (await call(path + '/refinement', 'PATCH', { revision: generated.revision, refinement: { ...refined.refinement, characterAnchor: '白猫，蓝围巾，棕色信包' } })).json();
  assert.equal(updated.creative, null); assert.equal(updated.approvedAt, null); assert.equal(updated.status, 'prompt_review');
  assert.equal((await call(path + '/export?format=json')).status, 409);
  assert.equal((await call('/.env')).status, 404); assert.equal((await call('/assets/missing.webp')).status, 404);
});
