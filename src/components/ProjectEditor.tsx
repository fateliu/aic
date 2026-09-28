import { useRef, useState } from 'react';
import type { Studio } from '../hooks/useStudio';
import type { Creative, Refinement, Shot } from '../types';
import { kindNames } from '../types';
import { ImagePanel } from './ImagePanel';
function PromptEditor({ studio, open, setOpen }: { studio: Studio; open: boolean; setOpen: (open: boolean) => void }) {
  const { editor, busy, creativeDirty, promptDirty } = studio, value = editor.prompt;
  if (!value) return null;
  const edit = (key: keyof Pick<Refinement, 'refinedPrompt' | 'characterAnchor' | 'negativePrompt'>, text: string) => {
    studio.dispatch({ type: 'prompt', value: { ...value, [key]: text } });
    studio.notify('提示词已修改，请保存。保存后需要重新生成草稿。');
  };
  return <section id="refinement-section">
    <details id="prompt-details" className="prompt-fold" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary><span><small>PROMPT / 角色与画面设定</small><strong>提示词子 Agent 的建议</strong></span><span className="fold-action"><span className="fold-closed">展开编辑 ＋</span><span className="fold-open">收起 −</span></span></summary>
      <p className="muted">展开核对完整提示词、角色特征与补充设定；修改后请保存。</p>
      <form id="refinement-form" onSubmit={e => { e.preventDefault(); studio.savePrompt(); }} onInvalidCapture={e => { setOpen(true); const details = (e.target as HTMLElement).closest('details'); if (details) details.open = true; }}>
        <fieldset disabled={busy || creativeDirty}>
          <label>优化后的完整提示词<textarea name="refinedPrompt" rows={7} maxLength={6000} required value={value.refinedPrompt} onChange={e => edit('refinedPrompt', e.target.value)} /></label>
          <details><summary>角色与限制条件</summary>
            <label>固定角色特征<textarea name="characterAnchor" rows={2} maxLength={1500} value={value.characterAnchor} onChange={e => edit('characterAnchor', e.target.value)} /></label>
            <label>避免出现的内容<textarea name="negativePrompt" rows={2} maxLength={1500} value={value.negativePrompt} onChange={e => edit('negativePrompt', e.target.value)} /></label>
          </details>
          <div className="suggestions">{([['assumptions', '补充建议', '没有额外补充设定。'], ['questions', '待确认问题', '没有待确认问题。']] as const).map(([key, title, empty]) => <div key={key}><h4>{title}</h4><ul id={key}>{(value[key].length ? value[key] : [empty]).map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}</div>
          <div className="actions"><button id="save-prompt" className="secondary" type="submit">保存提示词修改</button><button id="refine-again" className="text-button" type="button" onClick={studio.refineAgain}>重新优化</button></div>
        </fieldset>
      </form>
    </details>
    <div className="approval"><label className="check"><input type="checkbox" id="prompt-checked" checked={editor.promptChecked} disabled={busy || promptDirty || creativeDirty} onChange={e => studio.dispatch({ type: 'promptChecked', value: e.target.checked })} />我已检查补充设定，使用当前提示词创作。</label><button id="generate" className="primary" disabled={busy || promptDirty || creativeDirty || !editor.promptChecked} onClick={studio.generate}>交给主创 Agent ↗</button></div>
  </section>;
}
function ShotEditor({ shot, index, label, modern, onChange }: { shot: Shot; index: number; label: string; modern: boolean; onChange: (value: Shot) => void }) {
  const [open, setOpen] = useState(false);
  return <details className="shot shot-fold" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary><span className="shot-index">{label} {String(index + 1).padStart(2, '0')}{shot.duration ? ' / ' + shot.duration + ' SEC' : ''}</span><span className="shot-preview">{shot.visual}</span><span className="shot-fold-action">查看 / 编辑 ↗</span></summary>
    <label>画面 / 段落描述<textarea name={'visual' + index} rows={5} maxLength={modern ? 1500 : 240} required value={shot.visual} onInvalid={() => setOpen(true)} onChange={e => onChange({ ...shot, visual: e.target.value })} /></label>
    <label>对白 / 旁白<textarea name={'narration' + index} rows={2} maxLength={modern ? 400 : 100} required={!modern} value={shot.narration} onInvalid={() => setOpen(true)} onChange={e => onChange({ ...shot, narration: e.target.value })} /></label>
  </details>;
}
function CreativeEditor({ studio }: { studio: Studio }) {
  const { editor, busy, promptDirty, creativeDirty } = studio, p = editor.project!, creative = editor.creative;
  if (!creative) return null;
  const modern = p.schemaVersion === 2;
  const update = (value: Creative) => { studio.dispatch({ type: 'creative', value }); studio.notify('草稿有未保存的修改，请保存后重新确认。'); };
  return <section id="result">
    <div className="subheading"><h3 id="result-title">{modern ? kindNames[p.brief.kind!] + '创作草稿' : '旧版活动草稿'}</h3><span className="tag">YOUR FINAL TOUCH</span></div>
    <form id="creative-form" onSubmit={e => { e.preventDefault(); studio.saveCreative(); }}>
      <fieldset disabled={busy || promptDirty}>
        <label>作品标题<input name="headline" maxLength={60} required value={creative.headline} onChange={e => update({ ...creative, headline: e.target.value })} /></label>
        <label>正文 / 故事梗概<textarea name="intro" rows={5} maxLength={3000} required value={creative.intro} onChange={e => update({ ...creative, intro: e.target.value })} /></label>
        <div id="shots" className="shots">{creative.shots.map((shot, i) => <ShotEditor key={i} shot={shot} index={i} label={p.brief.kind === 'comic' ? '分格' : p.brief.kind === 'animation' ? '镜头' : '内容单元'} modern={modern} onChange={value => update({ ...creative, shots: creative.shots.map((s, j) => j === i ? value : s) })} />)}</div>
        <div className="actions"><button type="submit" className="secondary" id="save">保存草稿修改</button></div>
      </fieldset>
    </form>
    <div className="approval"><label className="check"><input type="checkbox" id="checked" disabled={busy || promptDirty || creativeDirty} checked={editor.approvedChecked} onChange={e => studio.dispatch({ type: 'approvedChecked', value: e.target.checked })} />我已检查内容与设定，确认当前版本。</label><button id="approve" className="primary" disabled={busy || promptDirty || creativeDirty || !editor.approvedChecked || !['review', 'approved'].includes(p.status)} onClick={studio.approve}>确认作品草稿 ↗</button></div>
    <div id="downloads" hidden={p.status !== 'approved' || promptDirty || creativeDirty}><h3>带走这份灵感</h3><div className="download-links">
      <a id="download-copy" href={'/api/projects/' + p.id + '/export?format=txt'}>创作稿 TXT ↗</a>
      <a id="download-project" href={'/api/projects/' + p.id + '/export?format=json'}>完整项目 JSON ↗</a>
      {!modern && <a id="download-poster" href={'/api/projects/' + p.id + '/export?format=svg'}>旧版海报 SVG ↗</a>}
      {modern && p.brief.kind !== 'text' && <button id="media-request" className="secondary" disabled={busy} onClick={studio.mediaRequest}>媒体任务说明</button>}
    </div><p className="muted">实际生成的图片可在下方下载。动画当前提供分镜脚本。</p></div>
  </section>;
}
export function ProjectEditor({ studio }: { studio: Studio }) {
  const [promptOpen, setPromptOpen] = useState(false), promptSection = useRef<HTMLDivElement>(null);
  const p = studio.editor.project!, b = p.brief, modern = p.schemaVersion === 2;
  const supportsImages = modern && ['image', 'comic'].includes(b.kind || '');
  const completed = new Set(p.imageJobs?.filter(j => j.revision === p.revision && j.status === 'SUCCEEDED').map(j => j.unitIndex)).size;
  const provenance = p.provider === 'demo' ? studio.config?.media.simulation ? '本机练习 · 规则文案与模拟素材，不调用付费接口' : '文案使用规则演示 · 图片生成是独立的真实 API 调用' : (p.provider === 'deepseek' ? 'DeepSeek' : 'Ollama') + ' · ' + (p.model || '待调用') + ' · 请核对模型输出';
  return <div id="project-view">
    <div className="project-heading"><div><p className="project-kicker">NOW CREATING / <span id="project-kind">{kindNames[b.kind || 'legacy']}</span></p><h3 id="project-title">{b.name}</h3></div><span id="project-version" className="project-version">第 {p.revision + 1} 版</span></div>
    <nav className="project-jumps" aria-label="当前项目阶段">
      {p.refinement && <a id="jump-prompt" href="#refinement-section" onClick={() => { setPromptOpen(true); promptSection.current?.scrollIntoView(); }}>01 <span>提示词设定</span> ↗</a>}
      {p.creative && <a id="jump-draft" href="#result">02 <span>创作稿</span> ↗</a>}
      {supportsImages && <a id="jump-media" href="#image-section">03 <span id="jump-media-label">{completed ? '图片 · ' + completed + ' 张' : '图片生成'}</span> ↗</a>}
    </nav>
    <p id="provenance" className="muted">{provenance}</p>
    <details className="original"><summary>原始输入与创作设置</summary><p id="facts">{modern ? b.prompt + '\n\n' + kindNames[b.kind!] + ' / ' + b.style + ' / ' + b.ratio : '活动：' + b.name + '\n时间：' + b.time + '\n地点：' + b.location + '\n面向：' + b.audience + '\n报名：' + b.signup}</p></details>
    <div ref={promptSection}><PromptEditor studio={studio} open={promptOpen} setOpen={setPromptOpen} /></div>
    <CreativeEditor studio={studio} />
    {supportsImages && studio.config && <ImagePanel project={p} config={studio.config} blocked={studio.busy || studio.promptDirty || studio.creativeDirty} run={studio.run} notify={studio.notify} update={studio.updateMedia} updateReferences={studio.updateReferences} />}
    {['draft', 'refining', 'generating', 'failed'].includes(p.status) && !studio.stage && <div id="retry-box"><p>这一步没有完成，已有资料已保存。</p><button id="retry" className="secondary" disabled={studio.busy} onClick={studio.retry}>重试这一步 ↗</button></div>}
    {p.trace.length > 0 && <details id="trace-box"><summary>Agent 执行记录与 Skill 来源</summary><div id="used-skills">{p.skills?.map(s => s.name + ' · ' + s.origin + ' · SHA256 ' + (s.sha256?.slice(0, 12) || '')).join('\n')}</div><ol id="trace">{p.trace.map((event, i) => <li key={i}>{(event.agent === 'prompt_subagent' ? '提示词子 Agent' : event.agent === 'director' ? '主创 Agent' : event.agent || '工作流') + ' / ' + event.tool + '：' + event.detail}</li>)}</ol></details>}
  </div>;
}
