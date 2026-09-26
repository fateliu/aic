import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './lib/store.mjs';
import { validateBrief, validateCreative, runAgent, campaignText, posterSvg } from './lib/agent.mjs';
import { DEFAULT_DEEPSEEK_MODEL } from './lib/providers.mjs';
import { listSkills, loadSkills } from './lib/skills.mjs';
import { validateStudioBrief, validateRefinement, validateStudioCreative, refinePrompt, runStudio, studioText } from './lib/studio.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function jsonBody(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 98_304) throw fail('请求内容过大', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail('请求不是有效的 JSON'); }
}
export function createApp({ directory = process.env.DATA_DIR || join(root, 'data'), model = process.env.OLLAMA_MODEL, baseUrl = process.env.OLLAMA_BASE_URL, agent = runAgent, deepseekKey = process.env.DEEPSEEK_API_KEY, deepseekModel = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL, deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', refiner = refinePrompt, studio = runStudio } = {}) {
  const store = new Store(directory), locks = new Set();
  const providerOptions = mode => mode === 'deepseek' ? { mode, apiKey: deepseekKey, model: deepseekModel, baseUrl: deepseekBaseUrl } : { mode, model, baseUrl };
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    const send = (data, status = 200, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    let lock;
    try {
      const url = new URL(req.url, 'http://localhost');
      const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
      const host = new URL(`http://${req.headers.host}`).hostname;
      if (!localHosts.has(host)) throw fail('仅允许本机访问', 403);
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw fail('不允许跨站请求', 403);
      if (!['GET', 'HEAD'].includes(req.method) && !req.headers['content-type']?.startsWith('application/json')) throw fail('请使用 JSON 请求', 415);
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const theme = JSON.parse(await readFile(join(root, 'public', 'theme.json'), 'utf8'));
        return send({ brand: '漫想工坊', ollamaAvailable: Boolean(model), model: model || null, deepseekAvailable: Boolean(deepseekKey), deepseekModel, theme, media: { image: false, animation: false } });
      }
      if (req.method === 'GET' && url.pathname === '/api/skills') return send(await listSkills());
      if (req.method === 'GET' && url.pathname === '/api/projects') return send(await store.list());
      if (req.method === 'POST' && url.pathname === '/api/projects') {
        const input = await jsonBody(req);
        const isStudio = input.brief?.kind !== undefined;
        const brief = isStudio ? validateStudioBrief(input.brief) : validateBrief(input.brief);
        const mode = input.mode || 'demo';
        if (!['demo', 'ollama', 'deepseek'].includes(mode)) throw fail('未知运行模式');
        if (mode === 'deepseek' && !deepseekKey) throw fail('请在服务端 .env 中配置 DEEPSEEK_API_KEY 后重启');
        if (mode === 'ollama' && !model) throw fail('请先配置 OLLAMA_MODEL 后重启');
        if (!isStudio && mode === 'deepseek') throw fail('请通过新版创作入口使用 DeepSeek');
        const skills = isStudio ? await loadSkills(input.skillIds || [], brief.kind) : [];
        const now = new Date().toISOString();
        return send(await store.save({ id: randomUUID(), schemaVersion: isStudio ? 2 : 1, brief, skills, mode, provider: mode, refinement: null, creative: null, trace: [], status: 'draft', revision: 0, createdAt: now, updatedAt: now }), 201);
      }
      const match = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(refine|refinement|generate|creative|approve|export|media-request))?$/);
      if (match) {
        const [, id, action] = match;
        if (req.method === 'GET' && !action) return send(await store.get(id));
        if (req.method === 'GET' && action === 'export') {
          const project = await store.get(id);
          if (project.status !== 'approved') throw fail('请先核对并确认草稿', 409);
          const format = url.searchParams.get('format');
          if (!['svg', 'txt', 'json'].includes(format)) throw fail('不支持的导出格式');
          if (project.schemaVersion === 2 && format === 'svg') throw fail('当前提供提示词和脚本，图片生成服务尚未接入', 409);
          res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.${format}"`);
          if (format === 'svg') return send(posterSvg(project), 200, 'image/svg+xml; charset=utf-8');
          const text = project.schemaVersion === 2 ? studioText(project) : campaignText(project);
          if (format === 'txt') return send(text, 200, 'text/plain; charset=utf-8');
          return send({ ...project, copy: text, media: { image: 'not-connected', video: 'storyboard-only' } });
        }
        if (!['POST', 'PATCH'].includes(req.method)) throw fail('请求方法不支持', 405);
        if (locks.has(id)) throw fail('该项目正在处理中，请稍后重试', 409);
        locks.add(id); lock = id;
        const project = await store.get(id);
        const input = await jsonBody(req);
        if (action === 'media-request' && req.method === 'POST') {
          if (project.status !== 'approved' || project.schemaVersion !== 2) throw fail('请先确认新版创作草稿', 409);
          if (project.brief.kind === 'text') throw fail('文字项目不需要媒体生成');
          return send({ status: 'not_connected', message: '尚未接入图片或动画服务；没有提交任务或产生费用', request: { version: 1, projectId: project.id, revision: project.revision, kind: project.brief.kind, ratio: project.brief.ratio, characterAnchor: project.refinement.characterAnchor, negativePrompt: project.refinement.negativePrompt, units: project.creative.shots } }, 200);
        } else if (action === 'refine' && req.method === 'POST') {
          if (project.schemaVersion !== 2) throw fail('旧项目不支持提示词子 Agent，请新建项目');
          if (input.revision !== project.revision) throw fail('项目已更新，请重新打开后再优化', 409);
          project.status = 'refining'; project.error = null; project.lastOperation = 'refine';
          await store.save(project);
          try {
            const result = await refiner(project.brief, { ...providerOptions(project.mode), skills: project.skills });
            Object.assign(project, result, { creative: null, status: 'prompt_review', revision: project.revision + 1, approvedAt: null });
          } catch (error) { project.status = 'failed'; project.error = error.message; }
        } else if (action === 'refinement' && req.method === 'PATCH') {
          if (project.schemaVersion !== 2 || !project.refinement) throw fail('请先优化提示词', 409);
          if (input.revision !== project.revision) throw fail('项目已更新，请重新打开', 409);
          project.refinement = validateRefinement(input.refinement);
          project.creative = null; project.approvedAt = null; project.status = 'prompt_review'; project.revision++;
          project.trace.push({ agent: 'human', tool: 'edit_prompt', detail: '修改优化提示词，旧草稿与确认已失效。', at: new Date().toISOString() });
        } else if (action === 'generate' && req.method === 'POST') {
          if (project.schemaVersion === 2 && (!project.refinement || input.revision !== project.revision)) throw fail('请先检查并确认最新提示词', 409);
          project.status = 'generating';
          project.lastOperation = 'generate';
          project.error = null;
          project.updatedAt = new Date().toISOString();
          await store.save(project);
          try {
            const result = project.schemaVersion === 2
              ? await studio(project.brief, { ...providerOptions(project.mode), refinement: project.refinement, skills: project.skills })
              : await agent(project.brief, { mode: project.mode, model, baseUrl });
            const trace = [...project.trace, ...result.trace];
            Object.assign(project, result, { trace, status: 'review', revision: project.revision + 1, approvedAt: null });
          } catch (error) {
            project.status = 'failed';
            project.error = error.name === 'TimeoutError' ? '模型生成超时，请重试' : error.message === 'fetch failed' ? '无法连接本地模型服务，请确认 Ollama 已启动' : error.message;
          }
        } else if (action === 'creative' && req.method === 'PATCH') {
          if (!project.creative) throw fail('请先生成草稿', 409);
          if (input.revision !== project.revision) throw fail('草稿已更新，请重新打开项目', 409);
          project.creative = project.schemaVersion === 2 ? validateStudioCreative(input.creative, project.brief.kind) : validateCreative(input.creative);
          project.status = 'review'; project.approvedAt = null; project.revision++;
          project.trace.push({ tool: 'human_edit', detail: '保存人工修改，需要重新确认。', at: new Date().toISOString() });
        } else if (action === 'approve' && req.method === 'POST') {
          if (!['review', 'approved'].includes(project.status) || !project.creative) throw fail('当前没有可确认的草稿', 409);
          if (input.revision !== project.revision) throw fail('草稿已更新，请重新核对', 409);
          project.status = 'approved'; project.approvedAt = new Date().toISOString();
          project.trace.push({ tool: 'human_approve', detail: '用户确认当前版本，可导出宣传资料。', at: project.approvedAt });
        } else throw fail('接口不存在', 404);
        project.updatedAt = new Date().toISOString();
        return send(await store.save(project));
      }
      const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
      const imageAsset = url.pathname.match(/^\/assets\/([a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|avif))$/);
      if (req.method === 'GET' && imageAsset) {
        try { return send(await readFile(join(root, 'public', 'assets', imageAsset[1])), 200, `image/${imageAsset[2] === 'jpg' ? 'jpeg' : imageAsset[2]}`); }
        catch (error) { if (error.code === 'ENOENT') throw fail('背景图片不存在', 404); throw error; }
      }
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        return send(await readFile(join(root, 'public', file)), 200, type);
      }
      throw fail('页面不存在', 404);
    } catch (error) { send({ error: error.status || error instanceof SyntaxError ? error.message : '操作失败：' + error.message }, error.status || 400); }
    finally { if (lock) locks.delete(lock); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`漫想工坊已启动：http://127.0.0.1:${port}`));
}
