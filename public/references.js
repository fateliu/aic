const $ = selector => document.querySelector(selector);

export async function normalizeReference(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的 PNG、JPG 或 WebP 图片。');
  const url = URL.createObjectURL(file), image = new Image(); image.src = url;
  try {
    await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (Math.min(width, height) < 240 || Math.max(width, height) > 8000 || Math.max(width / height, height / width) > 8) throw new Error('参考图宽高须在 240–8000 像素之间，宽高比不超过 8:1。请选择清晰的单角色图片。');
    const scale = Math.min(1, 2048 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('转换后的图片超过 5 MB，请选择更小的参考图。');
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败，请重新选择。')); reader.readAsDataURL(blob); });
    return { name: file.name.slice(0, 120), dataUrl };
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('无法解码这张图片，请换一张 PNG、JPG 或 WebP。');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}

export function createReferencePanel({ project, blocked, request, run, notify, changed, resetCost }) {
  let renderedId, manuallySelected = false, preferred;
  function sync() {
    const p = project(), select = $('#reference-source');
    $('#reference-choose').disabled = blocked() || !p;
    select.disabled = blocked() || !p;
    if (!p) return;
    if (renderedId !== p.id) { renderedId = p.id; manuallySelected = false; preferred = undefined; $('#reference-feedback').textContent = ''; }
    const previous = select.value;
    const options = [{ value: 'none', text: '不使用参考图 · 仅按文字生成' }];
    for (const ref of [...(p.references || [])].reverse()) options.push({ value: `upload:${ref.id}`, text: ref.name, asset: ref.asset, detail: `${ref.width} × ${ref.height} · 角色外观参考` });
    const first = p.brief.kind === 'comic' && Number($('#image-unit').value) > 0 && p.imageJobs?.findLast(job => job.revision === p.revision && job.unitIndex === 0 && job.status === 'SUCCEEDED');
    if (first) options.push({ value: `job:${first.id}`, text: '沿用已生成的第一格', asset: first.asset, detail: '沿用第一格的角色与服装' });
    const choice = preferred || (manuallySelected && options.some(option => option.value === previous) ? previous : options[1]?.value || 'none');
    select.replaceChildren(...options.map(item => { const option = document.createElement('option'); option.value = item.value; option.textContent = item.text; return option; }));
    select.value = choice; preferred = undefined;
    if (select.selectedIndex < 0) select.value = 'none';
    if (select.value !== previous) $('#image-cost').checked = false;
    const selected = options.find(option => option.value === select.value);
    $('#reference-preview').hidden = !selected?.asset;
    if (selected?.asset) {
      const image = $('#reference-thumbnail');
      if (image.getAttribute('src') !== selected.asset) image.src = selected.asset;
      image.alt = selected.text; $('#reference-name').textContent = selected.text; $('#reference-meta').textContent = selected.detail;
      $('#reference-original').href = selected.asset;
    } else $('#reference-thumbnail').removeAttribute('src');
    $('#reference-empty').hidden = Boolean(selected?.asset);
    $('#reference-count').textContent = `${p.references?.length || 0} / 12`;
  }
  $('#reference-source').onchange = () => { manuallySelected = true; resetCost(); sync(); };
  $('#reference-choose').onclick = () => $('#reference-file').click();
  $('#reference-file').onchange = event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    run(async () => {
      const p = project(); if (!p) return;
      notify('正在整理角色参考图…');
      const feedback = $('#reference-feedback'); feedback.textContent = '正在整理并上传图片…'; feedback.classList.remove('image-error');
      try {
        const payload = await normalizeReference(file);
        const result = await request(`/api/projects/${p.id}/references`, 'POST', { ...payload, revision: p.revision });
        if (project()?.id !== p.id) return;
        changed(result.project); preferred = `upload:${result.reference.id}`; manuallySelected = true;
        sync(); resetCost();
        feedback.textContent = '已保存并选中 · 上传不计生图费用';
        notify('参考图已保存并选中。生成图片时会传给万相；上传本身不调用生图接口。');
      } catch (error) { feedback.textContent = error.message; feedback.classList.add('image-error'); throw error; }
    });
  };
  return {
    sync,
    selection() {
      const [source, id] = $('#reference-source').value.split(':');
      return source === 'upload' ? { referenceUploadId: id } : source === 'job' ? { referenceJobId: id } : {};
    },
  };
}
