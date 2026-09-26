const $ = selector => document.querySelector(selector);
let current = null, busy = false, dirty = false;
const labels = { draft: '待生成', generating: '生成中', review: '待确认', approved: '已确认', failed: '生成失败' };
function notice(message, error = false) { $('#notice').textContent = message; $('#notice').classList.toggle('error', error); }
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作失败');
  return result;
}
function approvalState() {
  $('#approve').disabled = busy || dirty || !$('#checked').checked || !current?.creative || !['review', 'approved'].includes(current.status);
  $('#downloads').hidden = !current || current.status !== 'approved' || dirty;
}
function lock(value) {
  busy = value;
  document.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = value; });
  $('#create').textContent = value ? '正在处理，请稍候…' : '创建项目并生成草稿 ↗';
  approvalState();
}
async function work(fn) {
  if (busy) return;
  lock(true);
  try { await fn(); }
  catch (error) { notice(error.message, true); }
  finally { lock(false); }
}
async function history() {
  const projects = await api('/api/projects');
  const container = $('#history'); container.replaceChildren();
  if (!projects.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '还没有项目。'; container.append(p); }
  for (const project of projects) {
    const button = document.createElement('button'); button.className = 'history-item'; button.disabled = busy;
    const name = document.createElement('span'), state = document.createElement('small'); name.textContent = project.name; state.textContent = labels[project.status]; button.append(name, state);
    button.onclick = () => work(async () => { if (dirty && !confirm('有未保存的修改，确定离开吗？')) return; render(await api(`/api/projects/${project.id}`)); notice('已打开保存的项目。'); });
    container.append(button);
  }
}
function render(project) {
  current = project; dirty = false;
  $('#status').textContent = labels[project.status] || project.status;
  $('#empty').hidden = Boolean(project.creative);
  $('#result').hidden = !project.creative;
  $('#retry-box').hidden = !['failed', 'draft', 'generating'].includes(project.status);
  $('#checked').checked = project.status === 'approved';
  if (project.creative) {
    const form = $('#creative-form');
    form.elements.headline.value = project.creative.headline; form.elements.intro.value = project.creative.intro;
    project.creative.shots.forEach((shot, i) => { form.elements[`visual${i}`].value = shot.visual; form.elements[`narration${i}`].value = shot.narration; });
    $('#provenance').textContent = project.provider === 'demo' ? '规则演示产出 · 未调用大模型 · 请核对后使用' : `本地模型产出 · ${project.model} · 请核对后使用`;
    const b = project.brief;
    $('#facts').textContent = `活动：${b.name}\n时间：${b.time}\n地点：${b.location}\n面向：${b.audience}\n报名：${b.signup}\n风格：${b.style}`;
    for (const [id, format] of [['copy', 'txt'], ['poster', 'svg'], ['project', 'json']]) $('#download-' + id).href = `/api/projects/${project.id}/export?format=${format}`;
  }
  $('#trace-box').hidden = !project.trace.length;
  $('#trace').replaceChildren(...project.trace.map(event => { const li = document.createElement('li'); li.textContent = `${event.tool} — ${event.detail}`; return li; }));
  approvalState();
}
async function generate() {
  $('#status').textContent = '创作中';
  notice(current.mode === 'demo' ? '正在整理活动信息并生成演示草稿…' : '本地模型正在创作，最多等待 120 秒…');
  const project = await api(`/api/projects/${current.id}/generate`, 'POST', {});
  render(project); await history();
  notice(project.status === 'failed' ? project.error : '草稿已生成。请修改文案、核对分镜，再确认导出。', project.status === 'failed');
}
$('#example').onclick = () => {
  const example = { name: '秋日社团见面会', time: '2026 年 10 月 3 日 14:00', location: '学生活动中心一楼', audience: '想认识新朋友的大一同学', signup: '联系社团负责人报名', style: '清新自然' };
  for (const [key, value] of Object.entries(example)) $('#brief-form').elements[key].value = value;
  notice('已填入虚构活动示例，可修改后创建项目。');
};
$('#brief-form').onsubmit = event => {
  event.preventDefault();
  if (dirty && !confirm('有未保存的修改，确定创建新项目吗？')) return;
  const data = Object.fromEntries(new FormData(event.target));
  const { mode, ...brief } = data;
  work(async () => { const project = await api('/api/projects', 'POST', { brief, mode }); render(project); await history(); await generate(); });
};
$('#creative-form').oninput = () => { dirty = true; $('#checked').checked = false; approvalState(); notice('有未保存的修改。请先保存，再核对确认。'); };
$('#creative-form').onsubmit = event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  work(async () => {
    const creative = { headline: data.headline, intro: data.intro, shots: [0, 1].map(i => ({ visual: data[`visual${i}`], narration: data[`narration${i}`] })) };
    render(await api(`/api/projects/${current.id}/creative`, 'PATCH', { creative, revision: current.revision }));
    await history(); notice('修改已保存，请重新核对并确认当前版本。');
  });
};
$('#regenerate').onclick = () => { if (confirm('重新生成将替换当前文案和分镜，是否继续？')) work(generate); };
$('#retry').onclick = () => work(generate);
$('#checked').onchange = approvalState;
$('#approve').onclick = () => work(async () => { render(await api(`/api/projects/${current.id}/approve`, 'POST', { revision: current.revision })); await history(); notice('当前版本已确认，可以下载文案、海报和项目文件。'); });
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
try {
  const config = await api('/api/config');
  if (config.ollamaAvailable) { const option = $('#mode option[value="ollama"]'); option.disabled = false; option.textContent = `本地模型 · ${config.model}`; }
  await history();
} catch (error) { notice(`连接失败：${error.message}`, true); }
