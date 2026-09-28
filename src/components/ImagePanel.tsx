import { useState } from 'react';
import { api } from '../lib/api';
import { exportComic, referenceChoices, referenceSelection } from '../lib/media';
import { useImageJobs } from '../hooks/useImageJobs';
import { imageNames, pendingImages } from '../types';
import type { Config, ImageJob, Notify, Project, Run } from '../types';
import { ReferencePanel } from './ReferencePanel';
interface Props { project: Project; config: Config; blocked: boolean; run: Run; notify: Notify; update: (project: Project) => void; updateReferences: (project: Project) => void }
function ImageCard({ job, project, blocked, run, refresh, recover }: { job: ImageJob; project: Project; blocked: boolean; run: Run; refresh: (id: string) => Promise<void>; recover: (id: string, taskId: string) => Promise<void> }) {
  const [taskId, setTaskId] = useState('');
  return <article className="image-card">
    <h4>画面 {job.unitIndex + 1} · {imageNames[job.status]}{job.revision !== project.revision ? ' · 旧版本' : ''}</h4>
    {job.asset && job.status === 'SUCCEEDED' && <><img src={job.asset} alt={project.brief.name + '，画面 ' + (job.unitIndex + 1)} loading="lazy" /><div className="actions"><a href={job.asset + '?download=1'}>下载 PNG ↗</a><a href={job.asset} target="_blank" rel="noopener">查看原图 ↗</a></div></>}
    <p className="muted wrap-anywhere">{job.model} · {job.size}{job.referenceUploadId ? ' · 参考：' + (job.referenceName || '上传的角色图') : job.referenceJobId ? ' · 参考已生成漫画' : ' · 纯文字生图'}{job.taskId ? '\n任务编号 ' + job.taskId : ''}</p>
    {(job.error || job.lastPollError) && <p className="image-error">{job.lastPollError || job.error}</p>}
    {pendingImages.includes(job.status) && <button className="secondary" disabled={blocked} onClick={() => void run(() => refresh(job.id))}>{job.status === 'DOWNLOAD_FAILED' ? '重试保存图片（不重新计费）' : '刷新任务状态'}</button>}
    {['SUBMIT_UNKNOWN', 'UNKNOWN'].includes(job.status) && <div className="grid gap-2">
      <label>从百炼控制台找回任务编号<input placeholder="粘贴 task_id，不是 API Key" maxLength={120} value={taskId} disabled={blocked} onChange={e => setTaskId(e.target.value)} /></label>
      <button className="secondary" disabled={blocked || !taskId.trim()} onClick={() => void run(() => recover(job.id, taskId.trim()))}>恢复已有任务（不创建新任务）</button>
    </div>}
    <details><summary>查看实际生图提示词</summary><p>{job.prompt}</p></details>
  </article>;
}
export function ImagePanel({ project, config, blocked, run, notify, update, updateReferences }: Props) {
  const [unitIndex, setUnitIndex] = useState(0), [manualReference, setManualReference] = useState<string | null>(null);
  const [consent, setConsent] = useState<string | null>(null);
  const jobs = useImageJobs(project, blocked, update, notify);
  const choices = referenceChoices(project, unitIndex);
  const selected = manualReference !== null && choices.some(c => c.value === manualReference) ? manualReference : choices[1]?.value || 'none';
  const old = project.imageJobs?.findLast(j => j.revision === project.revision && j.unitIndex === unitIndex);
  // A confirmation authorizes exactly this reference, unit, revision and prior task state.
  const confirmation = [project.id, project.revision, unitIndex, selected, old?.id, old?.status].join(':');
  const confirmed = consent === confirmation;
  const ready = config.media.image, simulation = config.media.simulation, approved = project.status === 'approved' && Boolean(project.creative);
  const pending = Boolean(old && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(old.status));
  const complete = [0, 1, 2, 3].every(i => project.imageJobs?.some(j => j.revision === project.revision && j.unitIndex === i && j.status === 'SUCCEEDED'));
  const hint = simulation ? '本机练习模式：所有图片使用相同的示例素材，用于练习操作，不代表模型生成效果。' : !ready ? '填写百炼密钥后重启服务即可使用。DeepSeek 与图片服务使用不同的密钥。' : !approved ? '先完成上方创作稿并确认当前版本，再生成图片。' : '本次提交 1 张图片，按百炼账户实际计费。文案使用规则演示时，生图仍是真实 API 调用。';
  function submit() {
    if (blocked || !approved || !ready || !confirmed || pending) return;
    const input = { revision: project.revision, unitIndex, confirmCost: true, ...(old ? { replaceJobId: old.id } : {}), ...referenceSelection(selected) };
    void run(async () => {
      setConsent(null); notify(simulation ? '正在创建本机模拟图片任务…' : '正在向百炼提交一张图片，收到任务编号后将显示进度…');
      const result = await api<Project>('/api/projects/' + project.id + '/images', 'POST', input);
      update(result);
      jobs.resetFailures();
      const job = result.imageJobs?.findLast(j => j.revision === project.revision && j.unitIndex === unitIndex);
      if (job) notify(job.error || '图片任务已提交：' + imageNames[job.status] + '。稍后可从项目记录中继续查看。', Boolean(job.error));
    });
  }
  const buttonText = old?.status === 'SUCCEEDED' ? simulation ? '重新生成模拟图片' : '重新生成这张图片（再次计费）' : old && ['FAILED', 'CANCELED'].includes(old.status) ? '重试生成这张图片' : simulation ? '生成模拟图片 ↗' : '生成这张图片 ↗';
  return <section id="image-section">
    <div className="subheading"><h3><span className="step">03</span> 让画面真正出现</h3><span className="tag accent">万相生图</span></div>
    <p id="image-hint" className="muted">{hint}</p>
    <label>选择要生成的画面<select id="image-unit" value={unitIndex} disabled={blocked || !project.creative} onChange={e => { setUnitIndex(Number(e.target.value)); setConsent(null); }}>{project.creative?.shots.map((_, i) => <option key={i} value={i}>{project.brief.kind === 'comic' ? '漫画第 ' + (i + 1) + ' 格' : '当前图片'}</option>)}</select></label>
    <ReferencePanel project={project} choices={choices} selected={selected} blocked={blocked} run={run} notify={notify} onSelect={value => { setManualReference(value); setConsent(null); }} onUploaded={(p, id) => { updateReferences(p); setManualReference('upload:' + id); setConsent(null); }} />
    <label className="check"><input id="image-cost" type="checkbox" checked={confirmed} disabled={blocked || !ready || !approved} onChange={e => setConsent(e.target.checked ? confirmation : null)} /><span id="image-cost-label">{simulation ? '确认生成模拟图片：使用示例素材，不调用付费接口。' : '确认本次生成 1 张图片，可能产生百炼 API 费用。'}</span></label>
    <button id="image-submit" className="primary" disabled={blocked || !ready || !approved || !confirmed || pending} onClick={submit}>{buttonText}</button>
    <div id="image-gallery" aria-live="polite">{[...(project.imageJobs || [])].reverse().map(job => <ImageCard key={job.id} job={job} project={project} blocked={blocked} run={run} refresh={jobs.refresh} recover={jobs.recover} />)}</div>
    {project.brief.kind === 'comic' && <button id="comic-export" className="secondary" disabled={blocked || !complete} onClick={() => void run(async () => { await exportComic(project); notify('四格漫画已合成为 PNG，开始下载；对白仍保留在创作稿中。'); })}>四格齐全后下载漫画 PNG</button>}
    <p className="muted">图片保存到本地。修改画稿后，旧图片会保留并标注版本。</p>
  </section>;
}
