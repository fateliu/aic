import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export const REFERENCE_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_BODY_LIMIT = Math.ceil(REFERENCE_MAX_BYTES / 3) * 4 + 4096;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// The browser decodes and re-encodes uploads as opaque JPEG. Independently check
// the container and dimensions here; never trust the extension or client metadata.
export function inspectReference(dataUrl) {
  if (typeof dataUrl !== 'string') throw fail('请提供 JPEG 参考图数据');
  if (dataUrl.length > REFERENCE_BODY_LIMIT) throw fail('参考图超过 5 MB 上传上限', 413);
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[1].length % 4 !== 0) throw fail('参考图必须是经过转换的 JPEG 图片');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length > REFERENCE_MAX_BYTES) throw fail('参考图超过 5 MB 上传上限', 413);
  if (bytes.toString('base64') !== match[1] || bytes.length < 32 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw fail('参考图 JPEG 数据损坏');
  let offset = 2, width, height, scan = false, quantization = false, huffman = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) throw fail('参考图 JPEG 结构无效');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (offset + 2 > bytes.length) throw fail('参考图 JPEG 数据不完整');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) throw fail('参考图 JPEG 数据不完整');
    if (marker === 0xdb) quantization = true;
    if (marker === 0xc4) huffman = true;
    if (marker === 0xc0 || marker === 0xc2) {
      if (width || length < 11 || bytes[offset + 2] !== 8) throw fail('参考图 JPEG 编码不支持');
      height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5);
      const channels = bytes[offset + 7];
      if (![1, 3].includes(channels) || length !== 8 + 3 * channels) throw fail('参考图请使用灰度或 RGB JPEG');
    }
    if (marker === 0xda) { scan = true; break; }
    offset += length;
  }
  if (!width || !height || !scan || !quantization || !huffman) throw fail('参考图 JPEG 缺少必要的图像数据');
  if (Math.min(width, height) < 240 || Math.max(width, height) > 2048 || Math.max(width / height, height / width) > 8) throw fail('参考图转换后宽高须在 240–2048 像素，宽高比不超过 8:1');
  return { bytes, width, height };
}

export async function uploadReference(store, project, input) {
  if (project.schemaVersion !== 2 || !['image', 'comic'].includes(project.brief.kind)) throw fail('参考图目前用于图片和漫画项目');
  if (input.revision !== project.revision) throw fail('项目已更新，请重新打开后上传', 409);
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw fail('参考图名称须为 1–120 个字符');
  const { bytes, width, height } = inspectReference(input.dataUrl);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  project.references ||= [];
  const existing = project.references.find(ref => ref.sha256 === sha256);
  if (!existing && project.references.length >= 12) throw fail('本项目已保存 12 张参考图，请从已有图片中选择或新建项目');
  const id = existing?.id || randomUUID(), directory = join(store.directory, 'references', project.id);
  const reference = { id, name: input.name.trim(), mimeType: 'image/jpeg', width, height, bytes: bytes.length, sha256, createdAt: new Date().toISOString(), asset: `/api/projects/${project.id}/references/${id}/file` };
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${id}.jpg`), temp = `${path}.tmp`;
  await writeFile(temp, bytes); await rename(temp, path);
  // Re-uploading identical content also repairs a missing local file.
  if (existing) return { project, reference: existing };
  // Adding a library asset doesn't change the approved text. Each image task
  // explicitly records its selected reference; old tasks keep their provenance.
  project.references.push(reference); project.updatedAt = reference.createdAt;
  await store.save(project);
  return { project, reference };
}

export async function readReference(store, project, referenceId) {
  const reference = project.references?.find(ref => ref.id === referenceId);
  if (!reference || !/^[a-f0-9-]{36}$/.test(reference.id)) throw fail('本项目中没有这张参考图', 404);
  try { return await readFile(join(store.directory, 'references', project.id, `${reference.id}.jpg`)); }
  catch (error) { if (error.code === 'ENOENT') throw fail('参考图本地文件不存在，请重新上传', 404); throw error; }
}
