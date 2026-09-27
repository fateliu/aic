const $ = s => document.querySelector(s);
const names = { SUBMITTING: '提交中', PENDING: '排队中', RUNNING: '生成中', SUCCEEDED: '已生成', FAILED: '生成失败', CANCELED: '已取消', UNKNOWN: '任务结果未知', SUBMIT_UNKNOWN: '提交结果待核对', DOWNLOAD_FAILED: '已生成，待保存' };
const pending = ['SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOAD_FAILED'];
export function createImagePanel({ project, config, blocked, request, run, notify, update }) {
  let timer, renderedId, failures = 0;
  const selectedJob = () => project()?.imageJobs?.findLast(j => j.revision === project().revision && j.unitIndex === Number($('#image-unit').value));
  function sync() {
    const p = project(), ready = Boolean(config().media?.image), previous = selectedJob(), simulation = config().media?.simulation === true;
    $('#image-engine-status').textContent = simulation ? '图片引擎：本机模拟 · 不计费' : ready ? `图片引擎：${config().media.imageModel} · 已配置` : '图片引擎：等待在 .env 配置 DASHSCOPE_API_KEY';
    $('#image-cost-label').textContent = simulation ? '确认生成模拟图片：使用示例素材，不调用付费接口。' : '确认本次生成 1 张图片，可能产生百炼 API 费用。';
    $('#image-submit').disabled = blocked() || !ready || p?.status !== 'approved' || !p?.creative || !$('#image-cost').checked || Boolean(previous && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(previous.status));
    $('#image-unit').disabled = blocked() || !p?.creative; $('#image-cost').disabled = blocked() || !ready;
    $('#image-reference').disabled = blocked() || !p?.imageJobs?.some(j => j.revision === p.revision && j.unitIndex === 0 && j.status === 'SUCCEEDED') || Number($('#image-unit').value) === 0;
    $('#image-submit').textContent = previous?.status === 'SUCCEEDED' ? simulation ? '重新生成模拟图片' : '重新生成这张图片（再次计费）' : previous && ['FAILED', 'CANCELED'].includes(previous.status) ? '重试生成这张图片' : simulation ? '生成模拟图片 ↗' : '生成这张图片 ↗';
    $('#image-hint').textContent = simulation ? '本机练习模式：所有图片使用相同的示例素材，用于练习操作，不代表模型生成效果。' : !ready ? '填写百炼密钥后重启服务即可使用。DeepSeek 与图片服务使用不同的密钥。' : p?.status !== 'approved' ? '先完成上方创作稿并确认当前版本，再生成图片。' : '本次提交 1 张图片，按百炼账户实际计费。文案使用规则演示时，生图仍是真实 API 调用。';
    $('#comic-export').disabled = blocked() || !p?.creative || ![0, 1, 2, 3].every(i => p.imageJobs?.some(j => j.revision === p.revision && j.unitIndex === i && j.status === 'SUCCEEDED'));
  }
  function renderJobs() {
    const p = project(); $('#image-gallery').replaceChildren();
    for (const job of [...(p?.imageJobs || [])].reverse()) {
      const card = document.createElement('article'); card.className = 'image-card';
      const title = document.createElement('h4'); title.textContent = `画面 ${job.unitIndex + 1} · ${names[job.status] || job.status}${job.revision !== p.revision ? ' · 旧版本' : ''}`; card.append(title);
      if (job.asset && job.status === 'SUCCEEDED') {
        const img = document.createElement('img'); img.src = job.asset; img.alt = `${p.brief.name}，画面 ${job.unitIndex + 1}`; img.loading = 'lazy'; card.append(img);
        const actions = document.createElement('div'); actions.className = 'actions';
        const download = document.createElement('a'); download.href = job.asset + '?download=1'; download.textContent = '下载 PNG ↗';
        const view = document.createElement('a'); view.href = job.asset; view.target = '_blank'; view.rel = 'noopener'; view.textContent = '查看原图 ↗'; actions.append(download, view); card.append(actions);
      }
      const meta = document.createElement('p'); meta.className = 'muted'; meta.textContent = `${job.model} · ${job.size}${job.referenceJobId ? ' · 使用角色参考图' : ''}${job.taskId ? `\n任务编号 ${job.taskId}` : ''}`; card.append(meta);
      if (job.error || job.lastPollError) { const error = document.createElement('p'); error.className = 'image-error'; error.textContent = job.lastPollError || job.error; card.append(error); }
      if (pending.includes(job.status)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = job.status === 'DOWNLOAD_FAILED' ? '重试保存图片（不重新计费）' : '刷新任务状态'; button.disabled = blocked(); button.onclick = () => run(async () => { failures = 0; await poll(job.id); }); card.append(button);
      }
      if (['SUBMIT_UNKNOWN', 'UNKNOWN'].includes(job.status)) {
        const label = document.createElement('label'); label.textContent = '从百炼控制台找回任务编号'; const input = document.createElement('input'); input.placeholder = '粘贴 task_id，不是 API Key'; input.maxLength = 120; label.append(input);
        const recover = document.createElement('button'); recover.className = 'secondary'; recover.textContent = '恢复已有任务（不创建新任务）'; recover.disabled = blocked();
        recover.onclick = () => run(async () => { const result = await request(`/api/projects/${p.id}/images/${job.id}/recover`, 'POST', { taskId: input.value.trim() }); if (project()?.id === p.id) { update(result); failures = 0; renderJobs(); schedule(); } });
        card.append(label, recover);
      }
      const details = document.createElement('details'), summary = document.createElement('summary'), prompt = document.createElement('p'); summary.textContent = '查看实际生图提示词'; prompt.textContent = job.prompt; details.append(summary, prompt); card.append(details);
      $('#image-gallery').append(card);
    }
    $('#comic-export').hidden = p?.brief.kind !== 'comic'; sync();
  }
  function schedule() {
    clearTimeout(timer); if (failures >= 3) return;
    const job = project()?.imageJobs?.find(j => pending.includes(j.status)); if (!job) return;
    timer = setTimeout(async () => { if (blocked()) { schedule(); return; } await poll(job.id); }, 4000);
  }
  async function poll(id) {
    const p = project(); if (!p) return;
    try {
      const result = await request(`/api/projects/${p.id}/images/${id}/refresh`, 'POST', {});
      if (project()?.id !== p.id) return;
      update(result); const job = result.imageJobs.find(j => j.id === id);
      failures = job?.lastPollError ? failures + 1 : 0; renderJobs();
      if (failures >= 3) notify('图片状态自动刷新已暂停，请手动刷新或重试保存图片。不会重新提交生图。', true);
    } catch (error) { failures++; notify(`图片状态查询失败：${error.message}`, true); }
    finally { schedule(); }
  }
  function render() {
    const p = project(); clearTimeout(timer);
    $('#image-section').hidden = !p || p.schemaVersion !== 2 || !['image', 'comic'].includes(p.brief.kind);
    if ($('#image-section').hidden) return;
    const selected = renderedId === p.id ? $('#image-unit').value : '0'; renderedId = p.id;
    $('#image-unit').replaceChildren(...(p.creative?.shots || []).map((_, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = p.brief.kind === 'comic' ? `漫画第 ${i + 1} 格` : '当前图片'; return option; }));
    $('#image-unit').value = selected; if ($('#image-unit').selectedIndex < 0) $('#image-unit').selectedIndex = 0;
    $('#image-reference-label').hidden = p.brief.kind !== 'comic'; $('#image-cost').checked = false; failures = 0; renderJobs(); schedule();
  }
  $('#image-unit').onchange = sync; $('#image-cost').onchange = sync;
  $('#image-submit').onclick = () => run(async () => {
    const p = project(), old = selectedJob(), index = Number($('#image-unit').value), reference = p.imageJobs?.findLast(j => j.revision === p.revision && j.unitIndex === 0 && j.status === 'SUCCEEDED');
    notify(config().media?.simulation ? '正在创建本机模拟图片任务…' : '正在向百炼提交一张图片，收到任务编号后将显示进度…');
    const result = await request(`/api/projects/${p.id}/images`, 'POST', { revision: p.revision, unitIndex: index, confirmCost: $('#image-cost').checked, ...(old ? { replaceJobId: old.id } : {}), ...($('#image-reference').checked && index > 0 && reference ? { referenceJobId: reference.id } : {}) });
    if (project()?.id !== p.id) return;
    update(result); render(); const job = result.imageJobs.at(-1);
    notify(job.error || `图片任务已提交：${names[job.status] || job.status}。可以离开页面，稍后从项目记录中继续查看。`, Boolean(job.error));
  });
  $('#comic-export').onclick = () => run(async () => {
    const p = project(), images = await Promise.all([0, 1, 2, 3].map(async index => {
      const job = p.imageJobs.findLast(j => j.revision === p.revision && j.unitIndex === index && j.status === 'SUCCEEDED');
      const img = new Image(); img.src = job.asset; await img.decode(); return img;
    }));
    const width = 800, gap = 32, height = Math.round(width * images[0].height / images[0].width);
    const canvas = document.createElement('canvas'); canvas.width = width * 2 + gap * 3; canvas.height = height * 2 + gap * 3;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f7f4fa'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    images.forEach((img, i) => { const scale = Math.min(width / img.width, height / img.height), w = img.width * scale, h = img.height * scale; ctx.drawImage(img, gap + i % 2 * (width + gap) + (width - w) / 2, gap + Math.floor(i / 2) * (height + gap) + (height - h) / 2, w, h); });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('漫画合成失败，请重试');
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `comic-${p.id}.png`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
    notify('四格漫画已合成为 PNG，开始下载；对白仍保留在创作稿中。');
  });
  return { render, sync, clear() { clearTimeout(timer); $('#image-section').hidden = true; } };
}
