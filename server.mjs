import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './lib/store.mjs';
import { validateBrief, validateCreative, runAgent, campaignText, posterSvg } from './lib/agent.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function jsonBody(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw fail('请求内容过大', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail('请求不是有效的 JSON'); }
}
export function createApp({ directory = process.env.DATA_DIR || join(root, 'data'), model = process.env.OLLAMA_MODEL, baseUrl = process.env.OLLAMA_BASE_URL, agent = runAgent } = {}) {
  const store = new Store(directory), locks = new Set();
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
      if (req.method === 'GET' && url.pathname === '/api/config') return send({ ollamaAvailable: Boolean(model), model: model || null });
      if (req.method === 'GET' && url.pathname === '/api/projects') return send(await store.list());
      if (req.method === 'POST' && url.pathname === '/api/projects') {
        const input = await jsonBody(req);
        const brief = validateBrief(input.brief);
        const mode = input.mode || 'demo';
        if (!['demo', 'ollama'].includes(mode)) throw fail('未知运行模式');
        const now = new Date().toISOString();
        return send(await store.save({ id: randomUUID(), brief, mode, provider: mode, creative: null, trace: [], status: 'draft', revision: 0, createdAt: now, updatedAt: now }), 201);
      }
      const match = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(generate|creative|approve|export))?$/);
      if (match) {
        const [, id, action] = match;
        if (req.method === 'GET' && !action) return send(await store.get(id));
        if (req.method === 'GET' && action === 'export') {
          const project = await store.get(id);
          if (project.status !== 'approved') throw fail('请先核对并确认草稿', 409);
          const format = url.searchParams.get('format');
          if (!['svg', 'txt', 'json'].includes(format)) throw fail('不支持的导出格式');
          res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.${format}"`);
          if (format === 'svg') return send(posterSvg(project), 200, 'image/svg+xml; charset=utf-8');
          if (format === 'txt') return send(campaignText(project), 200, 'text/plain; charset=utf-8');
          return send({ ...project, copy: campaignText(project), media: { poster: 'programmatic-svg', video: 'storyboard-only' } });
        }
        if (!['POST', 'PATCH'].includes(req.method)) throw fail('请求方法不支持', 405);
        if (locks.has(id)) throw fail('该项目正在处理中，请稍后重试', 409);
        locks.add(id); lock = id;
        const project = await store.get(id);
        const input = await jsonBody(req);
        if (action === 'generate' && req.method === 'POST') {
          project.status = 'generating';
          project.error = null;
          project.updatedAt = new Date().toISOString();
          await store.save(project);
          try {
            const result = await agent(project.brief, { mode: project.mode, model, baseUrl });
            Object.assign(project, result, { status: 'review', revision: project.revision + 1, approvedAt: null });
          } catch (error) {
            project.status = 'failed';
            project.error = error.name === 'TimeoutError' ? '模型生成超时，请重试' : error.message === 'fetch failed' ? '无法连接本地模型服务，请确认 Ollama 已启动' : error.message;
          }
        } else if (action === 'creative' && req.method === 'PATCH') {
          if (!project.creative) throw fail('请先生成草稿', 409);
          if (input.revision !== project.revision) throw fail('草稿已更新，请重新打开项目', 409);
          project.creative = validateCreative(input.creative);
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
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`一页创作已启动：http://127.0.0.1:${port}`));
}
