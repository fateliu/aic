// Offline rehearsal server. No .env loading, no remote model calls, separate project data.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await readFile(join(root, 'docs', 'examples', 'campus-demo.png'));
/** @type {import('../lib/image-provider').ImageProvider} */
const imageProvider = {
  available: true, simulation: true, model: 'MOCK-NO-API-COST', baseUrl: 'mock://local',
  submit: async () => ({ taskId: randomUUID(), status: 'PENDING' }),
  query: async () => ({ status: 'SUCCEEDED', imageUrl: 'mock://local/campus-demo.png' }),
  download: async () => fixture,
};
const server = createApp({ directory: join(root, 'data-mock'), deepseekKey: '', model: '', imageProvider });
server.on('error', error => { console.error(`练习服务启动失败：${error.message}`); process.exitCode = 1; });
server.listen(3100, '127.0.0.1', () => {
  console.log('漫想工坊练习模式：http://127.0.0.1:3100');
  console.log('不读取 .env，不调用付费接口；所有图片使用同一张示例素材，数据保存在 data-mock/。');
});
