import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../../src/types';
import { editorReducer, emptyEditor, editorDirty } from '../../src/state/project';
async function startProject(page: Page, kind = 'comic') {
  await page.goto('/');
  await expect(page.locator('#create')).toBeEnabled();
  if (kind !== 'comic') await page.locator('[data-kind="' + kind + '"]').click();
  await page.locator('#mode').selectOption('demo');
  await page.locator('#example').click();
  await page.locator('#brief-form [name="name"]').fill('React 回归 · ' + kind);
  await page.locator('#create').click();
  await expect(page.locator('#status')).toHaveText('待确认提示词');
  await expect(page.locator('#create')).toBeEnabled();
}
async function createDraft(page: Page) {
  await page.locator('#prompt-checked').check();
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toHaveText('待确认草稿');
  await expect(page.locator('#create')).toBeEnabled();
}
async function approve(page: Page) {
  await page.locator('#checked').check(); await page.locator('#approve').click();
  await expect(page.locator('#status')).toHaveText('已确认');
  await expect(page.locator('#create')).toBeEnabled();
}
test.beforeEach(async ({ request }) => {
  const config = await (await request.get('/api/config')).json();
  expect(config.media.simulation, 'Browser tests must never use a billable backend').toBe(true);
  expect(config.deepseekAvailable).toBe(false);
});
test('角色上传、折叠编辑、四格引用、实际下载和重开项目', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await startProject(page);
  await expect(page.locator('#prompt-details')).not.toHaveAttribute('open');
  await page.locator('#prompt-details > summary').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#prompt-details')).toHaveAttribute('open');
  const prompt = page.locator('[name="refinedPrompt"]');
  await prompt.fill((await prompt.inputValue()) + ' 保留角色围巾。');
  await expect(page.locator('#generate')).toBeDisabled();
  await page.locator('#save-prompt').click();
  await expect(page.locator('#notice')).toContainText('提示词已保存');
  await expect(page.locator('#prompt-details')).not.toHaveAttribute('open');
  await page.locator('#reference-file').setInputFiles('public/assets/hero-sky.png');
  await expect(page.locator('#reference-count')).toHaveText('1 / 12');
  await expect(page.locator('#reference-feedback')).toContainText('已保存');
  const uploaded = await page.locator('#reference-source').inputValue();
  expect(uploaded.startsWith('upload:')).toBe(true);
  await page.locator('#reference-file').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
  await expect(page.locator('#reference-feedback')).toContainText('无法解码');
  await expect(page.locator('#reference-source')).toHaveValue(uploaded);
  await createDraft(page);
  await expect(page.locator('.shot-fold')).toHaveCount(4);
  await expect(page.locator('.shot-fold[open]')).toHaveCount(0);
  await expect(page.locator('#image-submit')).toBeDisabled();
  await approve(page);
  let firstId = '';
  for (let index = 0; index < 4; index++) {
    await page.locator('#image-unit').selectOption(String(index));
    if (index === 1) await page.locator('#reference-source').selectOption('job:' + firstId);
    if (index === 2) await page.locator('#reference-source').selectOption('none');
    if (index === 3) await page.locator('#reference-source').selectOption(uploaded);
    await expect(page.locator('#image-cost')).not.toBeChecked();
    await page.locator('#image-cost').check(); await page.locator('#image-submit').click();
    await expect(page.locator('.image-card img')).toHaveCount(index + 1);
    const p = await (await page.request.get((await page.locator('#download-project').getAttribute('href'))!)).json() as Project;
    if (index === 0) firstId = p.imageJobs![0].id;
    expect(p.imageJobs![index].referenceUploadId).toBe(index === 0 || index === 3 ? uploaded.split(':')[1] : undefined);
    expect(p.imageJobs![index].referenceJobId).toBe(index === 1 ? firstId : undefined);
  }
  const downloadPromise = page.waitForEvent('download'); await page.locator('#comic-export').click();
  const download = await downloadPromise, bytes = await readFile((await download.path())!);
  expect(bytes.readUInt32BE(16)).toBe(1696); expect(bytes.readUInt32BE(20)).toBe(996);
  const p = await (await page.request.get((await page.locator('#download-project').getAttribute('href'))!)).json() as Project;
  expect(p.references![0].width).toBe(2048); expect(p.references![0].height).toBe(1446);
  await page.reload(); await page.locator('[data-project-id="' + p.id + '"]').click();
  await expect(page.locator('.image-card img')).toHaveCount(4);
  await expect(page.locator('#reference-source')).toHaveValue(uploaded);
  await expect(page.locator('#prompt-details')).not.toHaveAttribute('open');
  expect(errors).toEqual([]);
});
test('编辑失效门禁、未保存离开提醒与自动参考变化', async ({ page }) => {
  await startProject(page, 'comic'); await createDraft(page); await approve(page);
  await page.locator('#image-cost').check(); await page.locator('#image-submit').click();
  await expect(page.locator('#create')).toBeEnabled();
  await page.locator('#image-unit').selectOption('1'); await page.locator('#image-cost').check();
  await expect(page.locator('#reference-source')).toHaveValue(/^job:/);
  await expect(page.locator('#image-cost')).not.toBeChecked(); await expect(page.locator('#image-submit')).toBeDisabled();
  await page.locator('.shot-fold').first().locator('summary').click();
  const visual = page.locator('[name="visual0"]');
  await visual.fill('白猫在窗边读信，戴着蓝色围巾。');
  await expect(page.locator('#downloads')).toBeHidden();
  await expect(page.locator('#image-submit')).toBeDisabled();
  page.once('dialog', dialog => void dialog.dismiss()); await page.locator('#new-project').click();
  await expect(visual).toHaveValue('白猫在窗边读信，戴着蓝色围巾。');
  await page.locator('#save').click();
  await expect(page.locator('#status')).toHaveText('待确认草稿');
  await expect(page.locator('.image-card').first()).toContainText('旧版本');
  await expect(page.locator('#checked')).not.toBeChecked();
  await page.locator('#jump-prompt').click();
  await page.locator('[name="refinedPrompt"]').fill('一只白猫在海边收到新来信，蓝色围巾，温暖水彩漫画。');
  page.once('dialog', dialog => void dialog.accept()); await page.locator('#save-prompt').click();
  await expect(page.locator('#status')).toHaveText('待确认提示词');
  await expect(page.locator('#result')).toHaveCount(0);
});
test('文字、图片和动画分镜类型保持可用', async ({ page }) => {
  for (const [kind, count] of [['text', 1], ['image', 1], ['animation', 3]] as const) {
    await startProject(page, kind); await createDraft(page);
    await expect(page.locator('.shot-fold')).toHaveCount(count);
    await approve(page);
    await expect(page.locator('#download-copy')).toBeVisible();
    if (kind === 'image') {
      await page.locator('#reference-file').setInputFiles('test/fixtures/reference.jpg');
      await expect(page.locator('#reference-count')).toHaveText('1 / 12');
      await expect(page.locator('#create')).toBeEnabled();
      await page.locator('#image-cost').check(); await page.locator('#image-submit').click();
      await expect(page.locator('.image-card img')).toHaveCount(1);
    } else await expect(page.locator('#image-section')).toHaveCount(0);
  }
});
test('红蓝主题、背景预览、输入保留与五种屏宽', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#create')).toBeEnabled();
  await page.locator('#brief-form [name="prompt"]').fill('还没有保存的晴空故事');
  await page.locator('[data-palette-option="flare"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'flare');
  await expect(page.locator('#brief-form [name="prompt"]')).toHaveValue('还没有保存的晴空故事');
  await page.locator('#scene-shuffle').click();
  await expect(page.locator('#brief-form [name="prompt"]')).toHaveValue('还没有保存的晴空故事');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-palette', 'flare');
  await page.locator('#background-open').click(); await expect(page.locator('#background-dialog')).toBeVisible();
  await page.locator('#background-file').setInputFiles('test/fixtures/reference.jpg');
  await expect(page.locator('#background-layer')).toHaveCSS('background-image', /blob:/);
  await page.locator('#background-reset').click(); await expect(page.locator('#background-layer')).not.toHaveCSS('background-image', /blob:/);
  await page.keyboard.press('Escape'); await expect(page.locator('#background-dialog')).toBeHidden();
  await startProject(page); await createDraft(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'overflow at ' + width).toBe(true);
  }
  await page.locator('[data-palette-option="sky"]').click(); await expect(page.locator('html')).toHaveAttribute('data-palette', 'sky');
  expect(errors).toEqual([]);
});
test('轮询合并不会覆盖编辑内容、其他项目或新版本', () => {
  const p: Project = { id: 'one', schemaVersion: 2, revision: 2, status: 'approved', mode: 'demo', provider: 'demo', updatedAt: '', brief: { kind: 'image', name: '测试' }, trace: [], refinement: null, creative: { headline: '原题', intro: '故事', shots: [{ visual: '白猫', narration: '' }] } };
  let state = editorReducer(emptyEditor, { type: 'load', project: p });
  state = editorReducer(state, { type: 'creative', value: { ...p.creative!, headline: '未保存的修改' } });
  expect(editorDirty(state).creativeDirty).toBe(true);
  expect(editorReducer(state, { type: 'media', project: { ...p, id: 'other' } })).toBe(state);
  expect(editorReducer(state, { type: 'media', project: { ...p, revision: 1 } })).toBe(state);
  const merged = editorReducer(state, { type: 'media', project: { ...p, trace: [{ tool: 'poll', detail: '完成', at: '' }] } });
  expect(merged.creative?.headline).toBe('未保存的修改'); expect(merged.project?.trace).toHaveLength(1);
  expect(merged.approvedChecked).toBe(false);
});
test('轮询连续失败暂停，手动恢复不创建第二个生成任务', async ({ page }) => {
  let polls = 0, submits = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/images')) submits++; });
  await page.route('**/images/*/refresh', route => { polls++; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '模拟网络中断' }) }); });
  await startProject(page, 'image'); await createDraft(page); await approve(page);
  await page.locator('#image-cost').check(); await page.locator('#image-submit').click();
  await expect(page.locator('#notice')).toContainText('自动刷新已暂停', { timeout: 20_000 });
  expect(polls).toBe(3); await page.waitForTimeout(4500); expect(polls).toBe(3);
  await page.unroute('**/images/*/refresh');
  await page.getByRole('button', { name: '刷新任务状态', exact: true }).click();
  await expect(page.locator('.image-card img')).toHaveCount(1);
  expect(submits).toBe(1);
});

test('旧版活动项目可打开、编辑、重新确认和下载海报', async ({ page, request }) => {
  const brief = { name: 'React 回归 · 旧版活动', time: '10 月 3 日 14:00', location: '活动中心', audience: '新同学', signup: '联系负责人', style: '清新自然' };
  const created = await request.post('/api/projects', { data: { brief, mode: 'demo' } });
  expect(created.status()).toBe(201);
  const p = await created.json() as Project;
  const generated = await request.post('/api/projects/' + p.id + '/generate', { data: { revision: p.revision } });
  expect(generated.ok()).toBe(true);
  await page.goto('/');
  await page.locator('[data-project-id="' + p.id + '"]').click();
  await expect(page.locator('#result-title')).toHaveText('旧版活动草稿');
  await expect(page.locator('.shot-fold')).toHaveCount(2);
  await expect(page.locator('#prompt-details')).toHaveCount(0);
  await expect(page.locator('#image-section')).toHaveCount(0);
  await page.locator('[name="headline"]').fill('一起开启新的秋天');
  await page.locator('#save').click();
  await expect(page.locator('#notice')).toContainText('草稿已保存');
  await approve(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-poster').click();
  const download = await downloadPromise;
  const svg = await readFile((await download.path())!, 'utf8');
  expect(svg).toContain('<svg'); expect(svg).toContain('一起开启新的秋天'); expect(svg).toContain(brief.location);
});
