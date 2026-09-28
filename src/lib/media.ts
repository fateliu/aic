import type { Project } from '../types';
import { downloadBlob } from './api';
export interface ReferenceChoice { value: string; text: string; asset?: string; detail?: string }
export function referenceChoices(project: Project, unitIndex: number): ReferenceChoice[] {
  const choices: ReferenceChoice[] = [{ value: 'none', text: '不使用参考图 · 仅按文字生成' }];
  for (const ref of [...(project.references || [])].reverse()) choices.push({ value: 'upload:' + ref.id, text: ref.name, asset: ref.asset, detail: ref.width + ' × ' + ref.height + ' · 角色外观参考' });
  const first = project.brief.kind === 'comic' && unitIndex > 0 && project.imageJobs?.findLast(j => j.revision === project.revision && j.unitIndex === 0 && j.status === 'SUCCEEDED');
  if (first) choices.push({ value: 'job:' + first.id, text: '沿用已生成的第一格', asset: first.asset, detail: '沿用第一格的角色与服装' });
  return choices;
}
export function referenceSelection(value: string) {
  const [source, id] = value.split(':');
  return source === 'upload' ? { referenceUploadId: id } : source === 'job' ? { referenceJobId: id } : {};
}
export async function normalizeReference(file: File): Promise<{ name: string; dataUrl: string }> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的 PNG、JPG 或 WebP 图片。');
  const url = URL.createObjectURL(file), image = new Image(); image.src = url;
  try {
    await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (Math.min(width, height) < 240 || Math.max(width, height) > 8000 || Math.max(width / height, height / width) > 8) throw new Error('参考图宽高须在 240–8000 像素之间，宽高比不超过 8:1。请选择清晰的单角色图片。');
    const scale = Math.min(1, 2048 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法处理图片，请重试');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('转换后的图片超过 5 MB，请选择更小的参考图。');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
      reader.onerror = () => reject(new Error('图片读取失败，请重新选择。')); reader.readAsDataURL(blob);
    });
    return { name: file.name.slice(0, 120), dataUrl };
  } catch (error) {
    if (error instanceof Error && error.name === 'EncodingError') throw new Error('无法解码这张图片，请换一张 PNG、JPG 或 WebP。');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}
export async function exportComic(project: Project) {
  const images = await Promise.all([0, 1, 2, 3].map(async unitIndex => {
    const job = project.imageJobs?.findLast(j => j.revision === project.revision && j.unitIndex === unitIndex && j.status === 'SUCCEEDED');
    if (!job?.asset) throw new Error('请先生成当前版本的全部四格');
    const image = new Image(); image.src = job.asset; await image.decode(); return image;
  }));
  const width = 800, gap = 32, height = Math.round(width * images[0].height / images[0].width);
  const canvas = document.createElement('canvas'); canvas.width = width * 2 + gap * 3; canvas.height = height * 2 + gap * 3;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器无法合成漫画');
  ctx.fillStyle = '#f7f4fa'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((image, i) => {
    const scale = Math.min(width / image.width, height / image.height), w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, gap + i % 2 * (width + gap) + (width - w) / 2, gap + Math.floor(i / 2) * (height + gap) + (height - h) / 2, w, h);
  });
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('漫画合成失败，请重试');
  downloadBlob(blob, 'comic-' + project.id + '.png');
}
