import { useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { normalizeReference } from '../lib/media';
import type { ReferenceChoice } from '../lib/media';
import type { Notify, Project, Reference, Run } from '../types';
interface Props {
  project: Project; choices: ReferenceChoice[]; selected: string; blocked: boolean; run: Run; notify: Notify;
  onSelect: (value: string) => void; onUploaded: (project: Project, referenceId: string) => void;
}
export function ReferencePanel({ project, choices, selected, blocked, run, notify, onSelect, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null), preview = choices.find(c => c.value === selected);
  const [feedback, setFeedback] = useState({ text: '', error: false });
  function upload(file?: File) {
    if (!file || blocked) return;
    void run(async () => {
      setFeedback({ text: '正在整理并上传图片…', error: false });
      try {
        const payload = await normalizeReference(file);
        const result = await api<{ project: Project; reference: Reference }>('/api/projects/' + project.id + '/references', 'POST', { ...payload, revision: project.revision });
        onUploaded(result.project, result.reference.id);
        setFeedback({ text: '已保存并选中 · 上传不计生图费用', error: false });
        notify('参考图已保存并选中。生成图片时会传给万相；上传本身不调用生图接口。');
      } catch (error) { setFeedback({ text: errorMessage(error), error: true }); throw error; }
    });
  }
  return <div className="reference-panel">
    <div className="flex items-start justify-between gap-3"><div><p className="reference-kicker">CHARACTER / 角色参考</p><h4 className="m-0 text-[13px] min-[480px]:text-[15px] leading-relaxed">让熟悉的角色，走进新画面。</h4></div><span id="reference-count" className="tag shrink-0">{project.references?.length || 0} / 12</span></div>
    <p className="muted">上传清晰的单角色图片，帮助保留脸型、发型、服装和标志性配饰。</p>
    {preview?.asset ? <div id="reference-preview" className="flex items-center gap-3 border border-solid border-studio-line bg-studio-paper p-3">
      <a id="reference-original" className="block h-24 w-18 shrink-0 min-[480px]:h-28 min-[480px]:w-23" href={preview.asset} target="_blank" rel="noopener" title="查看参考原图"><img id="reference-thumbnail" className="block h-full w-full object-contain" src={preview.asset} alt={preview.text} /></a>
      <div className="min-w-0"><strong id="reference-name" className="block text-xs wrap-anywhere">{preview.text}</strong><p id="reference-meta" className="text-[10px] text-studio-muted">{preview.detail}</p><span className="inline-block border-0 border-b border-solid border-studio-accent pb-1 text-[10px] text-studio-accent">本次生图将使用这张参考</span></div>
    </div> : <div className="reference-empty" id="reference-empty"><span aria-hidden="true">↗</span><p>给想象，一个准确的起点。<small>角色立绘 · 正面照 · 设定图</small></p></div>}
    <div className="my-3 flex flex-wrap items-center gap-x-3 gap-y-2"><button id="reference-choose" type="button" className="secondary" disabled={blocked} onClick={() => input.current?.click()}>＋ 上传角色参考图</button><input ref={input} id="reference-file" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} /><p className="m-0 text-[9px] text-studio-muted">PNG / JPG / WebP · 最大 20 MB</p></div>
    <p id="reference-feedback" className={'reference-feedback text-xs ' + (feedback.error ? 'image-error' : 'text-studio-muted')} role="status" aria-live="polite">{feedback.text}</p>
    <label>这次生图使用<select id="reference-source" disabled={blocked} value={selected} onChange={e => onSelect(e.target.value)}>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.text}</option>)}</select></label>
    <details className="reference-help"><summary>图片会如何使用？</summary><p className="muted">图片会保存到当前项目；生成时把选中的一张传给万相。透明背景自动铺白，大图等比缩小，原文件保持不变。仅上传不计生图费用。清晰、无遮挡的单角色图通常更利于还原，模型仍可能出现细节偏差。提示词子 Agent 处理文字，不会识别这张图。</p></details>
  </div>;
}
