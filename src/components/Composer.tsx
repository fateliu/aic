import { useEffect, useState } from 'react';
import type { Config, Kind, Mode, NewBrief, Skill } from '../types';
const samples: Record<Kind, [string, string]> = {
  comic: ['云端来信', '一只戴蓝色围巾的白猫住在云端，第一次收到来自地面的信。它原本不敢离开家，最后决定坐纸飞机出发。温暖治愈的四格漫画，无旁白，以简短对白推进。'],
  animation: ['夏日末班车', '一个背着黄色背包的短发女孩，在夏日傍晚追上最后一班开往海边的电车。三个镜头，15秒，日系动画风格。人物衣服和背包保持一致，结尾看到海。'],
  image: ['夜航书店', '一间开在鲸鱼背上的小书店漂浮在星空中。暖色窗光，深蓝夜空，安静梦幻，书店为视觉中心，不要文字和水印。'],
  text: ['写给明天的信', '写一段关于第一次离开家追逐梦想的短篇故事。主角是刚毕业的年轻人，语气真诚，有一个具体的小细节，结尾有希望但不说教。'],
};
interface Props { kind: Kind; mode: Mode; setMode: (mode: Mode) => void; config: Config | null; catalog: Skill[]; busy: boolean; onCreate: (brief: NewBrief, mode: Mode, skillIds: string[]) => void }
export function Composer({ kind, mode, setMode, config, catalog, busy, onCreate }: Props) {
  const [name, setName] = useState(''), [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('日系动画'), [ratio, setRatio] = useState<NewBrief['ratio']>('16:9');
  const [skills, setSkills] = useState<string[]>([]);
  useEffect(() => { setSkills(catalog.filter(s => s.kinds.includes(kind)).map(s => s.id)); }, [catalog, kind]);
  const disabled = busy || !config;
  const engine = config?.media.simulation ? '图片引擎：本机模拟 · 不计费' : config?.media.image ? '图片引擎：' + config.media.imageModel + ' · 已配置' : config ? '图片引擎：等待在 .env 配置 DASHSCOPE_API_KEY' : '正在检查图片引擎…';
  return <div className="composer-column">
    <section className="panel composer-panel">
      <div className="section-title"><h2><span className="step">01</span> 灵感起点</h2><button id="example" className="text-button" disabled={disabled} onClick={() => { const [n, p] = samples[kind]; setName(n); setPrompt(p); }}>试试示例 ↗</button></div>
      <form id="brief-form" onSubmit={e => { e.preventDefault(); onCreate({ name, prompt, kind, style, ratio }, mode, skills); }}>
        <fieldset disabled={disabled}>
          <label>脑海里，正在发生什么？<textarea name="prompt" rows={6} maxLength={3000} required value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="一只住在云端的猫，第一次收到来自地面的信。想画成温暖的四格漫画……" /></label>
          <label>为这个灵感命名 <span className="optional">选填</span><input name="name" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="比如：云端来信" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label>视觉风格<select name="style" value={style} onChange={e => setStyle(e.target.value)}>{['日系动画', '温暖水彩', '黑白漫画', '电影质感', '清新插画', '简洁叙事'].map(v => <option key={v}>{v}</option>)}</select></label>
            <label>画面比例<select name="ratio" value={ratio} onChange={e => setRatio(e.target.value as NewBrief['ratio'])}><option value="16:9">16:9 · 横屏</option><option value="9:16">9:16 · 竖屏</option><option value="1:1">1:1 · 方形</option></select></label>
          </div>
          <label>创作引擎<select id="mode" name="mode" value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="demo">规则演示 · 免费试流程</option><option value="deepseek" disabled={!config?.deepseekAvailable}>{config?.deepseekAvailable ? 'DeepSeek · ' + config.deepseekModel : 'DeepSeek · 待配置密钥'}</option><option value="ollama" disabled={!config?.ollamaAvailable}>{config?.ollamaAvailable ? 'Ollama · ' + config.model : 'Ollama · 待配置'}</option></select></label>
          <p id="engine-help" className="muted">{mode === 'demo' ? '演示模式使用模板，不调用大模型。' : mode === 'deepseek' ? '提示词优化与创作会调用你的 DeepSeek API，按账户计费。' : '使用你本机的 Ollama 模型。'}</p>
          <button className="primary" id="create" type="submit" disabled={disabled}>{busy ? '正在处理，请稍候…' : '让提示词更精准 ↗'}</button>
        </fieldset>
      </form>
      <p id="image-engine-status" className="engine-note">{engine}</p>
    </section>
    <section className="panel skills-panel"><div className="section-title"><h2>给灵感，多一点方法</h2><span className="tag">SKILLS</span></div><p className="muted">选择这次创作要带上的小帮手。</p>
      <div id="skills">{catalog.filter(s => s.kinds.includes(kind)).map(skill => <div className="skill-row" key={skill.id}>
        <label><input type="checkbox" name="skill" value={skill.id} disabled={disabled} checked={skills.includes(skill.id)} onChange={e => setSkills(e.target.checked ? [...skills, skill.id] : skills.filter(id => id !== skill.id))} /><span><strong>{skill.name}</strong><small>{skill.description}</small></span></label>
        {skill.source?.startsWith('https://') && <a href={skill.source} className="skill-source" target="_blank" rel="noreferrer">{skill.origin} · {skill.license} ↗</a>}
      </div>)}</div>
      <details><summary>扩展创作 Skill</summary><p className="muted">将审阅过的 SKILL.md 放入 creative-skills，在 registry.json 注册。支持本地文字指令包。</p></details>
    </section>
  </div>;
}
