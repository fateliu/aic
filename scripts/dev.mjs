import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mock = process.argv.includes('--mock'), port = mock ? 3100 : 3000;
const services = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of services) child.kill();
  process.exitCode = code;
}
function launch(args, env = process.env) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  services.add(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { services.delete(child); if (!stopping) stop(code || 0); });
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
// Fail explicitly instead of silently attaching to another running real/mock service.
try {
  await fetch('http://127.0.0.1:' + port + '/api/config', { signal: AbortSignal.timeout(700) });
  console.error('端口 ' + port + ' 已在使用，请先停止对应工作台，再运行开发命令。');
  process.exitCode = 1;
} catch {
  launch([mock ? 'scripts/dev-mock.mjs' : 'server.mjs']);
  let ready = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try { const response = await fetch('http://127.0.0.1:' + port + '/api/config'); if (response.ok) { ready = true; break; } } catch { /* Wait for backend readiness. */ }
    await delay(200);
  }
  if (!ready) stop(1);
  else launch(['node_modules/vite/bin/vite.js'], { ...process.env, MANXIANG_MOCK: mock ? '1' : '0' });
}
