import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readReference } from './references.mjs';

export const DEFAULT_IMAGE_MODEL = 'wan2.7-image';
export const IMAGE_SIZES = { '16:9': '1280*720', '9:16': '720*1280', '1:1': '1024*1024' };
const pendingStates = ['SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOAD_FAILED'];
const fail = (message, status = 400, uncertain = false) => Object.assign(new Error(message), { status, uncertain });
const stamp = () => new Date().toISOString();

export function buildImagePrompt(project, unitIndex) {
  const shot = project.creative.shots[unitIndex];
  const parts = [
    `创作类型：${project.brief.kind === 'comic' ? `漫画第${unitIndex + 1}格，单独绘制这一格` : '独立插画'}。风格：${project.brief.style}。`,
    `画面要求：${shot.visual}`,
    project.refinement.characterAnchor && `固定角色特征：${project.refinement.characterAnchor}`,
    project.refinement.negativePrompt && `限制条件：${project.refinement.negativePrompt}`,
    '只生成画面，不生成对白、旁白、气泡、标题或水印；文字保留在创作稿中。',
  ].filter(Boolean);
  const prompt = parts.join('\n');
  if (Array.from(prompt).length > 5000) throw fail('该画面的提示词超过 5000 字符，请缩短画面描述、角色或限制条件');
  return prompt;
}
/** @returns {import('./image-provider').ImageProvider} */
export function createImageProvider({ apiKey, baseUrl = 'https://dashscope.aliyuncs.com/api/v1', model = DEFAULT_IMAGE_MODEL, fetchImpl = fetch } = {}) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || !(url.hostname === 'dashscope.aliyuncs.com' || /^[a-z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname)) || url.pathname.replace(/\/$/, '') !== '/api/v1') throw fail('DASHSCOPE_BASE_URL 必须是北京地域的 HTTPS DashScope /api/v1 地址');
  const base = url.href.replace(/\/$/, '');
  if (!['wan2.7-image', 'wan2.7-image-pro'].includes(model)) throw fail('当前图片适配器支持 wan2.7-image 或 wan2.7-image-pro');
  async function request(path, body) {
    if (!apiKey) throw fail('请在本机 .env 配置 DASHSCOPE_API_KEY 后重启服务');
    let response;
    try {
      response = await fetchImpl(base + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw fail(body ? '提交连接中断，任务可能已创建。请先在百炼控制台核对，系统不会自动重新扣费提交。' : '查询连接失败，可稍后刷新状态；不会重新提交生图。', 502, Boolean(body)); }
    let data;
    try { data = await response.json(); } catch { throw fail('百炼响应无法解析，请查看控制台任务记录', 502, Boolean(body)); }
    if (!response.ok || data.code) {
      const code = typeof data.code === 'string' && /^[\w.-]{1,80}$/.test(data.code) ? data.code : String(response.status);
      const hints = { 401: '百炼密钥无效，请核对北京地域的 Key', 403: '无调用权限，请检查工作空间和模型授权', 402: '账户余额不足', 429: '请求频率受限，请稍后重试' };
      throw fail(`${hints[response.status] || '百炼请求失败'}（${code}）。请核对模型、额度与地域。`, 502, Boolean(body && response.status >= 500));
    }
    return data;
  }
  return {
    available: Boolean(apiKey), model, baseUrl: base,
    async submit({ prompt, size, referenceImage }) {
      const data = await request('/services/aigc/image-generation/generation', { model, input: { messages: [{ role: 'user', content: [...(referenceImage ? [{ image: referenceImage }] : []), { text: prompt }] }] }, parameters: { size, n: 1, enable_sequential: false, thinking_mode: false, watermark: false } });
      const taskId = data.output?.task_id;
      if (typeof taskId !== 'string' || !/^[\w-]{1,120}$/.test(taskId)) throw fail('未收到有效任务编号，请在百炼控制台核对；不会自动重提。', 502, true);
      return { taskId, status: ['PENDING', 'RUNNING'].includes(data.output.task_status) ? data.output.task_status : 'PENDING', requestId: data.request_id };
    },
    async query(taskId, expectedBase) {
      if (expectedBase !== base) throw fail('此任务来自其他工作空间，请恢复创建任务时的 DASHSCOPE_BASE_URL 再查询');
      if (!/^[\w-]{1,120}$/.test(taskId)) throw fail('任务编号格式无效');
      const data = await request(`/tasks/${encodeURIComponent(taskId)}`);
      const output = data.output;
      if (!output || !['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN'].includes(output.task_status)) throw fail('百炼返回未知任务状态，请稍后查询', 502);
      return { status: output.task_status, imageUrl: output.choices?.flatMap(c => c.message?.content || []).find(c => typeof c.image === 'string')?.image, requestId: data.request_id, code: /^[\w.-]{1,80}$/.test(output.code || '') ? output.code : null };
    },
    async download(imageUrl) {
      const remote = new URL(imageUrl);
      if (remote.protocol !== 'https:' || remote.port || remote.username || remote.password || !/^[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(remote.hostname) || remote.hostname.includes('-internal')) throw fail('生成结果不是受支持的阿里云公网 OSS 图片地址');
      // Never send the API credential to the signed image URL.
      const response = await fetchImpl(remote.href, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok || !response.body) throw fail('图片下载失败，请刷新结果重试下载；不会重新生成', 502);
      const limit = 25 * 1024 * 1024;
      if (Number(response.headers?.get('content-length')) > limit) throw fail('图片超过 25 MB 保存上限');
      let total = 0; const chunks = [];
      for await (const chunk of response.body) { total += chunk.length; if (total > limit) throw fail('图片超过 25 MB 保存上限'); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw fail('生成结果不是有效的 PNG 图片');
      return bytes;
    },
  };
}
export async function submitImage(store, project, input, provider) {
  if (project.schemaVersion !== 2 || !['image', 'comic'].includes(project.brief.kind)) throw fail('当前支持图片和漫画单格生图；动画视频尚未接入');
  if (project.status !== 'approved' || input.revision !== project.revision) throw fail('请先确认最新版本的创作草稿', 409);
  if (input.confirmCost !== true) throw fail('请先确认本次生成一张图片可能产生费用');
  if (!provider.available) throw fail('请在本机 .env 配置 DASHSCOPE_API_KEY 后重启服务');
  const index = input.unitIndex;
  if (!Number.isInteger(index) || index < 0 || index >= project.creative.shots.length) throw fail('请选择有效的画面');
  project.imageJobs ||= [];
  const existing = project.imageJobs.findLast(job => job.revision === project.revision && job.unitIndex === index);
  if (existing) {
    if (!input.replaceJobId || existing.replaces === input.replaceJobId) return project;
    if (input.replaceJobId !== existing.id) throw fail('图片任务已更新，请刷新项目', 409);
    if (!['FAILED', 'CANCELED', 'SUCCEEDED'].includes(existing.status)) throw fail('现有任务仍在处理、等待下载或结果不确定，不能重复提交', 409);
  } else if (input.replaceJobId) throw fail('要替换的任务不存在', 409);
  if (input.referenceUploadId && input.referenceJobId) throw fail('请只选择一种参考来源：上传图片或已生成的漫画');
  let referenceImage, referenceName;
  if (input.referenceUploadId) {
    const bytes = await readReference(store, project, input.referenceUploadId);
    if (bytes.length > 20 * 1024 * 1024) throw fail('角色参考图超过模型的 20 MB 限制');
    referenceImage = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    referenceName = project.references.find(ref => ref.id === input.referenceUploadId).name;
  }
  if (input.referenceJobId) {
    const reference = project.imageJobs.find(j => j.id === input.referenceJobId && j.revision === project.revision && j.status === 'SUCCEEDED');
    if (project.brief.kind !== 'comic' || !reference) throw fail('角色参考图必须来自本项目当前版本的已生成漫画');
    const bytes = await readImage(store, project, reference.id);
    if (bytes.length > 20 * 1024 * 1024) throw fail('角色参考图超过模型的 20 MB 限制');
    referenceImage = `data:image/png;base64,${bytes.toString('base64')}`;
  }
  const job = { id: randomUUID(), revision: project.revision, unitIndex: index, model: provider.model, apiBase: provider.baseUrl, prompt: buildImagePrompt(project, index), size: IMAGE_SIZES[project.brief.ratio], status: 'SUBMITTING', createdAt: stamp(), updatedAt: stamp(), replaces: existing?.id || null };
  if (referenceImage) {
    if (input.referenceUploadId) { job.referenceUploadId = input.referenceUploadId; job.referenceName = referenceName; }
    else job.referenceJobId = input.referenceJobId;
    job.prompt = `参考图用于确定角色身份。优先还原图中角色的脸型、五官比例、发型发色、瞳色、服装与标志性配饰，不擅自更换角色或增加肢体。文字中自动补充的外貌若与参考图冲突，以参考图为准；场景、动作、构图按下方画面要求重新绘制，不复制参考图的排版、文字或多个角色展示视图。除非画面明确要求，画面中只出现一个该角色。\n${job.prompt}`;
  }
  if (Array.from(job.prompt).length > 5000) throw fail('含参考图约束的提示词超过 5000 字符，请缩短');
  project.imageJobs.push(job); project.updatedAt = stamp();
  // Save before the billable request; a crash must not trigger automatic resubmission.
  await store.save(project);
  try { Object.assign(job, await provider.submit({ ...job, referenceImage })); }
  catch (error) { job.status = error.uncertain ? 'SUBMIT_UNKNOWN' : 'FAILED'; job.error = error.message; }
  job.updatedAt = stamp();
  project.trace.push({ agent: 'image_provider', tool: 'submit_image', detail: `${job.model} / 画面 ${index + 1} / ${job.status}${job.taskId ? ` / ${job.taskId}` : ''}`, at: stamp() });
  await store.save(project);
  return project;
}
export async function refreshImage(store, project, jobId, provider) {
  const job = project.imageJobs?.find(job => job.id === jobId);
  if (!job) throw fail('图片任务不存在', 404);
  if (!pendingStates.includes(job.status)) return project;
  if (job.status === 'SUBMITTING' && !job.taskId) {
    job.status = 'SUBMIT_UNKNOWN'; job.error = '服务在提交阶段中断，请在百炼控制台核对任务，避免重复扣费。';
  } else {
    try {
      const result = job.status === 'DOWNLOAD_FAILED' && job.sourceUrl ? { status: 'SUCCEEDED', imageUrl: job.sourceUrl } : await provider.query(job.taskId, job.apiBase);
      job.status = result.status; job.lastPollError = null; job.error = null;
      if (result.status === 'SUCCEEDED') {
        if (result.imageUrl) job.sourceUrl = result.imageUrl;
        // Persist the returned URL before downloading, so a download failure never regenerates.
        job.status = 'DOWNLOAD_FAILED';
        await store.save(project);
        if (!job.sourceUrl) throw fail('任务完成但没有图片地址，请核对百炼任务记录');
        const bytes = await provider.download(job.sourceUrl);
        const directory = join(store.directory, 'images', project.id);
        await mkdir(directory, { recursive: true });
        const path = join(directory, `${job.id}.png`), temp = `${path}.tmp`;
        await writeFile(temp, bytes); await rename(temp, path);
        job.asset = `/api/projects/${project.id}/images/${job.id}/file`; job.status = 'SUCCEEDED'; job.completedAt = stamp();
      } else if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(result.status)) {
        job.error = `百炼任务状态 ${result.status}${result.code ? `（${result.code}）` : ''}，请在控制台核对原因。`;
      }
    } catch (error) { job.lastPollError = error.message; }
  }
  job.updatedAt = stamp(); await store.save(project); return project;
}
export async function readImage(store, project, jobId) {
  const job = project.imageJobs?.find(job => job.id === jobId && job.status === 'SUCCEEDED' && job.asset);
  if (!job) throw fail('图片尚未生成或保存', 404);
  try { return await readFile(join(store.directory, 'images', project.id, `${job.id}.png`)); }
  catch (error) { if (error.code === 'ENOENT') throw fail('本地图片文件不存在', 404); throw error; }
}
export async function recoverImage(store, project, jobId, taskId, provider) {
  const job = project.imageJobs?.find(j => j.id === jobId);
  if (!job || !['SUBMIT_UNKNOWN', 'UNKNOWN'].includes(job.status)) throw fail('只有结果未知的任务可以手动恢复', 409);
  if (typeof taskId !== 'string' || !/^[\w-]{1,120}$/.test(taskId)) throw fail('请输入百炼控制台中的任务编号');
  await provider.query(taskId, job.apiBase);
  job.taskId = taskId; job.status = 'PENDING'; job.error = null; job.recoveredAt = stamp();
  await store.save(project);
  return refreshImage(store, project, jobId, provider);
}
