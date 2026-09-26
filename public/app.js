const $ = selector => document.querySelector(selector);
const kindNames = { text: '文字', image: '图片', comic: '漫画', animation: '动画', legacy: '旧版活动' };
const labels = { draft: '待优化', refining: '优化中', prompt_review: '待确认提示词', generating: '创作中', review: '待确认草稿', approved: '已确认', failed: '执行失败' };
let current = null, kind = 'comic', config = {}, catalog = [], busy = false, dirty = false, promptDirty = false, backgroundUrl = null;
function notice(message, error = false) { $('#notice').textContent = message; $('#notice').classList.toggle('error', error); }
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作失败');
  return result;
}
function setControls() {
  document.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = busy; });
  $('#creative-form').querySelectorAll('button,input,textarea').forEach(el => { el.disabled = busy || promptDirty; });
  $('#refinement-form').querySelectorAll('button,input,textarea').forEach(el => { el.disabled = busy || dirty; });
  $('#generate').disabled = busy || dirty || promptDirty || !current?.refinement || !$('#prompt-checked').checked;
  $('#approve').disabled = busy || dirty || promptDirty || !$('#checked').checked || !current?.creative || !['review', 'approved'].includes(current.status);
  $('#downloads').hidden = !current || current.status !== 'approved' || dirty || promptDirty;
  $('#mode option[value="deepseek"]').disabled = !config.deepseekAvailable;
  $('#mode option[value="ollama"]').disabled = !config.ollamaAvailable;
  $('#create').textContent = busy ? '正在处理，请稍候…' : '让提示词更精准 ✦';
}
async function work(fn) {
  if (busy) return;
  busy = true; setControls();
  try { await fn(); } catch (error) { notice(error.message, true); }
  finally { busy = false; setControls(); }
}
function canLeave() { return !(dirty || promptDirty) || confirm('有未保存的修改，确定离开吗？'); }
function selectKind(value) {
  kind = value;
  document.querySelectorAll('[data-kind]').forEach(el => { el.classList.toggle('active', el.dataset.kind === kind); el.setAttribute('aria-pressed', String(el.dataset.kind === kind)); });
  renderSkills();
}
function renderSkills() {
  const container = $('#skills'); container.replaceChildren();
  for (const skill of catalog.filter(item => item.kinds.includes(kind))) {
    const row = document.createElement('div'); row.className = 'skill-row';
    const label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span'), title = document.createElement('strong'), desc = document.createElement('small');
    input.type = 'checkbox'; input.value = skill.id; input.name = 'skill'; input.checked = true; input.disabled = busy;
    title.textContent = skill.name; desc.textContent = skill.description; text.append(title, desc); label.append(input, text); row.append(label);
    if (skill.source?.startsWith('https://')) { const link = document.createElement('a'); link.href = skill.source; link.target = '_blank'; link.rel = 'noreferrer'; link.className = 'skill-source'; link.textContent = `${skill.origin} · ${skill.license} ↗`; row.append(link); }
    container.append(row);
  }
  if (!container.childElementCount) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '当前类型使用基础创作流程。'; container.append(p); }
}
async function history() {
  const projects = await api('/api/projects');
  $('#history').replaceChildren();
  for (const project of projects) {
    const button = document.createElement('button'); button.className = 'history-item'; button.disabled = busy;
    const name = document.createElement('span'), meta = document.createElement('small'); name.textContent = project.name; meta.textContent = `${kindNames[project.kind] || '创作'} · ${labels[project.status] || project.status}`; button.append(name, meta);
    button.onclick = () => { if (canLeave()) work(async () => { const p = await api(`/api/projects/${project.id}`); render(p); notice('已打开保存的项目。左侧输入用于创建新项目。'); }); };
    $('#history').append(button);
  }
}
function renderList(selector, values, empty) {
  $(selector).replaceChildren(...(values.length ? values : [empty]).map(value => { const li = document.createElement('li'); li.textContent = value; return li; }));
}
function render(project) {
  current = project; dirty = false; promptDirty = false;
  const modern = project.schemaVersion === 2;
  $('#status').textContent = labels[project.status] || project.status;
  $('#empty').hidden = true; $('#project-view').hidden = false;
  $('#refinement-section').hidden = !project.refinement; $('#result').hidden = !project.creative;
  $('#retry-box').hidden = !['draft', 'refining', 'generating', 'failed'].includes(project.status);
  $('#prompt-checked').checked = false; $('#checked').checked = project.status === 'approved';
  $('#provenance').textContent = project.provider === 'demo' ? '规则演示 · 未调用模型 · 图片与动画尚未生成' : `${project.provider === 'deepseek' ? 'DeepSeek' : 'Ollama'} · ${project.model || '待调用'} · 请核对模型输出`;
  const b = project.brief;
  $('#facts').textContent = modern ? `${b.prompt}\n\n${kindNames[b.kind]} / ${b.style} / ${b.ratio}` : `活动：${b.name}\n时间：${b.time}\n地点：${b.location}\n面向：${b.audience}\n报名：${b.signup}`;
  if (project.refinement) {
    const form = $('#refinement-form');
    for (const key of ['refinedPrompt', 'negativePrompt', 'characterAnchor']) form.elements[key].value = project.refinement[key];
    renderList('#assumptions', project.refinement.assumptions, '没有额外补充设定。');
    renderList('#questions', project.refinement.questions, '没有待确认问题。');
  }
  if (project.creative) {
    const form = $('#creative-form'); form.elements.headline.value = project.creative.headline; form.elements.intro.value = project.creative.intro;
    $('#result-title').textContent = modern ? `${kindNames[b.kind]}创作草稿` : '旧版活动草稿';
    $('#shots').replaceChildren();
    project.creative.shots.forEach((shot, i) => {
      const article = document.createElement('article'); article.className = 'shot';
      const index = document.createElement('div'); index.className = 'shot-index'; index.textContent = `${b.kind === 'comic' ? '分格' : b.kind === 'animation' ? '镜头' : '内容单元'} ${String(i + 1).padStart(2, '0')}${shot.duration ? ` / ${shot.duration} SEC` : ''}`; article.append(index);
      for (const [key, title, max] of [['visual', '画面 / 段落描述', modern ? 1500 : 240], ['narration', '对白 / 旁白', modern ? 400 : 100]]) {
        const label = document.createElement('label'); label.textContent = title;
        const field = document.createElement('textarea'); field.name = `${key}${i}`; field.rows = key === 'visual' ? 5 : 2; field.maxLength = max; field.required = key === 'visual' || !modern; field.value = shot[key]; label.append(field); article.append(label);
      }
      $('#shots').append(article);
    });
    for (const [id, format] of [['copy', 'txt'], ['project', 'json'], ['poster', 'svg']]) $('#download-' + id).href = `/api/projects/${project.id}/export?format=${format}`;
    $('#download-poster').hidden = modern;
    $('#media-request').hidden = !modern || b.kind === 'text';
  }
  $('#trace-box').hidden = !project.trace.length;
  $('#trace').replaceChildren(...project.trace.map(event => { const li = document.createElement('li'); li.textContent = `${event.agent === 'prompt_subagent' ? '提示词子 Agent' : event.agent === 'director' ? '主创 Agent' : event.agent || '工作流'} / ${event.tool}：${event.detail}`; return li; }));
  $('#used-skills').textContent = (project.skills || []).map(s => `${s.name} · ${s.origin} · SHA256 ${s.sha256.slice(0, 12)}`).join('\n');
  setControls();
}
async function runStage(stage) {
  $('#status').textContent = stage === 'refine' ? '子 Agent 优化中' : '主 Agent 创作中';
  notice(stage === 'refine' ? '正在细化提示词、角色与限制条件…' : '主创 Agent 正在组织文案和分镜…');
  const project = await api(`/api/projects/${current.id}/${stage}`, 'POST', { revision: current.revision });
  render(project); await history();
  notice(project.status === 'failed' ? project.error : stage === 'refine' ? '提示词已整理。请检查补充设定，可以直接编辑后保存。' : '草稿已完成。请检查文案与分镜，再确认导出。', project.status === 'failed');
}
document.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => { selectKind(button.dataset.kind); notice(`已切换新项目类型为${kindNames[kind]}，右侧已保存项目保持不变。`); });
$('#example').onclick = () => {
  const samples = { comic: ['云端来信', '一只戴蓝色围巾的白猫住在云端，第一次收到来自地面的信。它原本不敢离开家，最后决定坐纸飞机出发。温暖治愈的四格漫画，无旁白，以简短对白推进。'], animation: ['夏日末班车', '一个背着黄色背包的短发女孩，在夏日傍晚追上最后一班开往海边的电车。三个镜头，15秒，日系动画风格。人物衣服和背包保持一致，结尾看到海。'], image: ['夜航书店', '一间开在鲸鱼背上的小书店漂浮在星空中。暖色窗光，蓝紫色夜空，安静梦幻，书店为视觉中心，不要文字和水印。'], text: ['写给明天的信', '写一段关于第一次离开家追逐梦想的短篇故事。主角是刚毕业的年轻人，语气真诚，有一个具体的小细节，结尾有希望但不说教。'] };
  const [name, prompt] = samples[kind]; const f = $('#brief-form'); f.elements.name.value = name; f.elements.prompt.value = prompt; notice('示例已填入，可以按你的想法修改。');
};
$('#brief-form').onsubmit = event => {
  event.preventDefault(); if (!canLeave()) return;
  const { mode, ...brief } = Object.fromEntries(new FormData(event.target)); brief.kind = kind;
  const skillIds = [...document.querySelectorAll('[name=skill]:checked')].map(el => el.value);
  work(async () => { render(await api('/api/projects', 'POST', { brief, mode, skillIds })); await history(); await runStage('refine'); });
};
$('#refinement-form').oninput = () => { promptDirty = true; $('#prompt-checked').checked = false; $('#checked').checked = false; setControls(); notice('提示词已修改，请保存。保存后需要重新生成草稿。'); };
$('#refinement-form').onsubmit = event => {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(event.target));
  if (current.creative && !confirm('保存提示词会使现有草稿失效，之后需要重新生成。继续吗？')) return;
  work(async () => { render(await api(`/api/projects/${current.id}/refinement`, 'PATCH', { refinement: { ...current.refinement, ...fields }, revision: current.revision })); await history(); notice('提示词已保存，请检查后交给主创 Agent。'); });
};
$('#generate').onclick = () => { if (current.creative && !confirm('这会替换当前草稿。继续吗？')) return; work(() => runStage('generate')); };
$('#refine-again').onclick = () => { if (confirm('重新优化会使用原始输入，并替换优化提示词和已有草稿。继续吗？')) work(() => runStage('refine')); };
$('#creative-form').oninput = () => { dirty = true; $('#checked').checked = false; setControls(); notice('草稿有未保存的修改，请保存后重新确认。'); };
$('#creative-form').onsubmit = event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  work(async () => { const creative = { headline: data.headline, intro: data.intro, shots: current.creative.shots.map((_, i) => ({ visual: data[`visual${i}`], narration: data[`narration${i}`] })) }; render(await api(`/api/projects/${current.id}/creative`, 'PATCH', { creative, revision: current.revision })); await history(); notice('草稿已保存，请重新确认。'); });
};
$('#checked').onchange = setControls; $('#prompt-checked').onchange = setControls;
$('#approve').onclick = () => work(async () => { render(await api(`/api/projects/${current.id}/approve`, 'POST', { revision: current.revision })); await history(); notice('当前版本已确认，可以导出创作稿和完整项目。'); });
$('#retry').onclick = () => work(() => runStage(current.schemaVersion !== 2 || current.lastOperation === 'generate' ? 'generate' : 'refine'));
$('#new-project').onclick = () => { if (!canLeave()) return; current = null; dirty = false; promptDirty = false; $('#brief-form').reset(); $('#project-view').hidden = true; $('#empty').hidden = false; $('#retry-box').hidden = true; $('#trace-box').hidden = true; $('#status').textContent = '等待灵感'; if (config.deepseekAvailable) $('#mode').value = 'deepseek'; updateEngine(); setControls(); $('#brief-form textarea').focus(); notice('开始一份新的创作。'); };
function downloadJson(value, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('#media-request').onclick = () => work(async () => { const result = await api(`/api/projects/${current.id}/media-request`, 'POST', {}); downloadJson(result, `media-request-${current.id}.json`); notice(result.message); });
function updateEngine() { const mode = $('#mode').value; $('#provider-badge').textContent = mode === 'deepseek' ? 'DeepSeek 已配置' : mode === 'ollama' ? 'Ollama 已配置' : '规则演示'; $('#engine-help').textContent = mode === 'demo' ? '演示模式使用模板，不调用大模型。' : mode === 'deepseek' ? '提示词优化与创作会调用你的 DeepSeek API，按账户计费。' : '使用你本机的 Ollama 模型。'; }
$('#mode').onchange = updateEngine;
function applyTheme(theme = {}) {
  const path = /^\/assets\/[\w-]+\.(png|jpe?g|webp|avif)$/.test(theme.backgroundImage || '') ? theme.backgroundImage : null;
  $('#background-layer').style.backgroundImage = path ? `url("${path}")` : 'none';
  $('#background-layer').style.backgroundPosition = ['center', 'top', 'bottom'].includes(theme.backgroundPosition) ? theme.backgroundPosition : 'center';
  const opacity = Number.isFinite(theme.backgroundOpacity) ? Math.min(.65, Math.max(0, theme.backgroundOpacity)) : .28;
  document.documentElement.style.setProperty('--bg-opacity', opacity); $('#background-opacity').value = opacity;
}
$('#background-open').onclick = () => $('#background-dialog').showModal(); $('#background-close').onclick = () => $('#background-dialog').close();
$('#background-opacity').oninput = event => document.documentElement.style.setProperty('--bg-opacity', event.target.value);
$('#background-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type) || file.size > 15 * 1024 * 1024) { notice('请选择 15 MB 以内的 PNG、JPG、WebP 或 AVIF 图片。', true); return; }
  const url = URL.createObjectURL(file); const img = new Image(); img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); notice('这张图片无法读取，请选择其他图片。', true); return; }
  if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); backgroundUrl = url; $('#background-layer').style.backgroundImage = `url("${url}")`; notice('已应用本机背景预览，图片没有上传；刷新后恢复默认。');
};
$('#background-reset').onclick = () => { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); backgroundUrl = null; $('#background-file').value = ''; applyTheme(config.theme); };
window.addEventListener('beforeunload', event => { if (dirty || promptDirty || busy) { event.preventDefault(); event.returnValue = ''; } });
try {
  [config, catalog] = await Promise.all([api('/api/config'), api('/api/skills')]);
  if (config.deepseekAvailable) { $('#mode option[value="deepseek"]').textContent = `DeepSeek · ${config.deepseekModel}`; $('#mode').value = 'deepseek'; }
  if (config.ollamaAvailable) $('#mode option[value="ollama"]').textContent = `Ollama · ${config.model}`;
  applyTheme(config.theme); renderSkills(); updateEngine(); setControls(); await history();
} catch (error) { notice(`连接失败：${error.message}`, true); }
