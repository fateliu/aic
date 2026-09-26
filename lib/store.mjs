import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export class Store {
  constructor(directory) { this.directory = directory; }
  path(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error('项目不存在'), { status: 404 });
    return join(this.directory, `${id}.json`);
  }
  async save(project) {
    await mkdir(this.directory, { recursive: true });
    const path = this.path(project.id), temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(project, null, 2), 'utf8');
    await rename(temp, path);
    return project;
  }
  async get(id) {
    try { return JSON.parse(await readFile(this.path(id), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') throw Object.assign(new Error('项目不存在'), { status: 404 }); throw e; }
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const files = (await readdir(this.directory)).filter(f => /^[a-f0-9-]{36}\.json$/.test(f));
    const projects = await Promise.all(files.map(file => this.get(file.slice(0, -5))));
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, brief, status, updatedAt, provider }) => ({ id, name: brief.name, kind: brief.kind || 'legacy', status, updatedAt, provider }));
  }
}
