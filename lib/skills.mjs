import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'creative-skills');

export async function loadSkills(ids, kind) {
  if (!Array.isArray(ids) || ids.length > 3 || ids.some(id => typeof id !== 'string')) throw new Error('最多选择三个 Skill');
  const registry = JSON.parse(await readFile(resolve(root, 'registry.json'), 'utf8'));
  const selected = [];
  for (const id of new Set(ids)) {
    const item = registry.find(skill => skill.id === id && skill.enabled);
    if (!item || !item.kinds.includes(kind)) throw new Error(`Skill 不存在或不适用于当前创作：${id}`);
    const path = resolve(root, item.path);
    if (!path.startsWith(root + sep) || !path.endsWith('SKILL.md')) throw new Error('Skill 路径必须位于 creative-skills 内');
    const instructions = await readFile(path, 'utf8');
    if (instructions.length > 6000) throw new Error('Skill 内容超过 6000 字符');
    selected.push({ ...item, instructions, sha256: createHash('sha256').update(instructions).digest('hex') });
  }
  return selected;
}
export async function listSkills() {
  const registry = JSON.parse(await readFile(resolve(root, 'registry.json'), 'utf8'));
  return registry.filter(skill => skill.enabled).map(({ path, ...metadata }) => metadata);
}
