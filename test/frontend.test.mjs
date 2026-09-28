import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'manxiang-static-'));
  const frontendDirectory = join(directory, 'dist');
  const server = createApp({ directory: join(directory, 'data'), frontendDirectory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return { frontendDirectory, get: path => fetch('http://127.0.0.1:' + server.address().port + path) };
}
test('React 构建资源使用正确 MIME，并保持文件访问白名单', async t => {
  const { frontendDirectory, get } = await fixture(t);
  await mkdir(join(frontendDirectory, 'build'), { recursive: true });
  await writeFile(join(frontendDirectory, 'index.html'), '<div id="root"></div>');
  await writeFile(join(frontendDirectory, 'build', 'index-test.js'), 'export const ready = true;');
  await writeFile(join(frontendDirectory, 'build', 'index-test.css'), 'body { color: black; }');
  const html = await get('/'); assert.equal(html.status, 200); assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /id="root"/); assert.match(html.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match((await get('/build/index-test.js')).headers.get('content-type'), /javascript/);
  assert.match((await get('/build/index-test.css')).headers.get('content-type'), /text\/css/);
  for (const path of ['/.env', '/src/App.tsx', '/app.js', '/references.js', '/dist/index.html', '/build/index-test.js.map', '/build/missing.js']) assert.equal((await get(path)).status, 404, path);
});
test('尚未构建时提示启动步骤，API 仍可独立提供服务', async t => {
  const { get } = await fixture(t);
  const root = await get('/'); assert.equal(root.status, 503); assert.match((await root.json()).error, /npm run build/);
  assert.equal((await get('/api/config')).status, 200);
});
