import { useEffect, useRef } from 'react';
import type { Appearance } from '../hooks/useAppearance';
import { kindNames, statusNames } from '../types';
import type { Kind, Mode, ProjectSummary } from '../types';
export function Header({ appearance, mode }: { appearance: Appearance; mode: Mode }) {
  return <header className="topbar">
    <a className="brand" href="/" aria-label="漫想工坊首页"><span className="brand-icon" aria-hidden="true">m<span>↗</span></span><span>漫想工坊<small>MANXIANG / CREATIVE STUDIO</small></span></a>
    <div className="header-right">
      <span id="provider-badge" className="engine-badge">{mode === 'deepseek' ? 'DeepSeek 已配置' : mode === 'ollama' ? 'Ollama 已配置' : '规则演示'}</span>
      <div className="palette-switch" role="group" aria-label="界面配色">
        {(['sky', 'flare'] as const).map(palette => <button type="button" key={palette} data-palette-option={palette} aria-pressed={appearance.palette === palette} onClick={() => appearance.selectPalette(palette)}>
          <i className={'swatch ' + palette} />{palette === 'sky' ? '晴空' : '赤日'}<span>{palette === 'sky' ? 'BLUE' : 'RED'}</span>
        </button>)}
      </div>
      <button id="background-open" className="background-button" title="使用自己的图片装饰工作台" onClick={() => appearance.setDialogOpen(true)}>背景 <span aria-hidden="true">↗</span></button>
    </div>
  </header>;
}
export function Sidebar({ projects, currentId, busy, onNew, onOpen }: { projects: ProjectSummary[]; currentId?: string; busy: boolean; onNew: () => void; onOpen: (id: string) => void }) {
  return <aside className="sidebar" aria-label="项目记录">
    <div className="rail-heading"><span>YOUR SPACE</span><b>01 /</b></div>
    <button id="new-project" className="new-project" disabled={busy} onClick={onNew}><span>＋ 新的灵感</span><span aria-hidden="true">↗</span></button>
    <div className="nav-label"><span>创作档案</span><small>ARCHIVE</small></div>
    <div id="history">{projects.length ? projects.map(p => <button key={p.id} className={'history-item' + (p.id === currentId ? ' is-current' : '')} data-project-id={p.id} aria-current={p.id === currentId} disabled={busy} onClick={() => onOpen(p.id)}>
      <span>{p.name}</span><small>{kindNames[p.kind]} · {statusNames[p.status]}</small>
    </button>) : <p className="muted">灵感会在这里留下记录。</p>}</div>
    <div className="sidebar-note" aria-hidden="true"><div className="orbit-stamp"><span>MAKE<br />SOMETHING<br />YOURS.</span><b>✳</b></div><p>不必等灵感落地。<br />现在，就让它起飞。</p><div className="rail-stripes" /><small>IMAGINATION IN MOTION / MX</small></div>
  </aside>;
}
export function Hero({ appearance }: { appearance: Appearance }) {
  return <section className="hero" data-variation={appearance.variation} aria-labelledby="hero-title">
    <div className="hero-grid" aria-hidden="true" /><div className="hero-slash" aria-hidden="true" />
    <div className="hero-copy"><p className="eyebrow"><span className="live-dot" /> A CLEAR MIND. AN OPEN SKY.</p><h1 id="hero-title">让想象，<br /><em>自由发生。</em><span aria-hidden="true">↗</span></h1><p className="hero-description">一句想法，一整个世界。<br />文字、画面与故事，从这里出发。</p><div className="hero-caption"><span>IDEA → STORY → FRAME</span><b>CREATE YOUR NEXT SCENE.</b></div></div>
    <div className="sky-art" aria-hidden="true"><div className="character-window"><img className="hero-character character-sky" src={appearance.skyImage} alt="" fetchPriority="high" /><img className="hero-character character-flare" src={appearance.flareImage} alt="" loading="lazy" /></div><span className="character-label">THE NEXT CHAPTER<br />BEGINS WITH YOU.</span><span className="art-word">FLY<br />HIGH.</span></div>
    <button id="scene-shuffle" type="button" className="scene-shuffle" aria-label="随机变换装饰构图" title="换一个灵感构图" onClick={appearance.shuffle}>↻ <span>ANOTHER SKY</span></button>
    <span className="hero-corner" aria-hidden="true">MX—03 / <span id="palette-label">{appearance.palette === 'sky' ? 'SKY EDITION' : 'FLARE EDITION'}</span></span>
  </section>;
}
const formats: { kind: Kind; name: string; english: string }[] = [
  { kind: 'text', name: '文字创作', english: 'STORY' }, { kind: 'image', name: '图片创作', english: 'IMAGE' },
  { kind: 'comic', name: '漫画分格', english: 'COMIC' }, { kind: 'animation', name: '动画分镜', english: 'MOTION' },
];
export function FormatTabs({ kind, busy, onChange }: { kind: Kind; busy: boolean; onChange: (kind: Kind) => void }) {
  return <section className="creation-nav" aria-label="新项目类型"><div className="nav-caption"><b>选择你的表达</b><span>CHOOSE A FORMAT</span></div><div className="mode-tabs" role="group" aria-label="创作类型">
    {formats.map((f, i) => <button key={f.kind} data-kind={f.kind} aria-pressed={kind === f.kind} className={kind === f.kind ? 'active' : ''} disabled={busy} onClick={() => onChange(f.kind)}><span className="mode-number">0{i + 1}</span><span className="mode-name">{f.name}<small>{f.english}</small></span><span className="mode-arrow">↗</span></button>)}
  </div></section>;
}
export function BackgroundDialog({ appearance }: { appearance: Appearance }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (appearance.dialogOpen && !dialog.current?.open) dialog.current?.showModal(); else if (!appearance.dialogOpen && dialog.current?.open) dialog.current.close(); }, [appearance.dialogOpen]);
  return <dialog id="background-dialog" ref={dialog} onClose={() => appearance.setDialogOpen(false)}>
    <div className="section-title"><h2>把喜欢的风景，带进工坊。</h2><button id="background-close" className="secondary" aria-label="关闭背景设置" onClick={() => appearance.setDialogOpen(false)}>✕</button></div>
    <p className="muted">选一张喜欢的动漫图片，调整到舒服的可见度。图片仅在本机预览。</p>
    <label>选择图片<input id="background-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => { void appearance.chooseBackground(e.target.files?.[0]); e.target.value = ''; }} /></label>
    <label>背景可见度<input id="background-opacity" type="range" min="0" max="0.65" step="0.01" value={appearance.opacity} onChange={e => appearance.setOpacity(Number(e.target.value))} /></label>
    <button id="background-reset" className="secondary" onClick={appearance.resetBackground}>恢复默认背景</button>
    <details><summary>保存为默认背景</summary><p className="muted">将图片放入 public/assets，再修改 public/theme.json 的 backgroundImage。主题配色会自动记住你的选择。</p></details>
  </dialog>;
}
export function EmptyCanvas() {
  return <div id="empty"><div className="empty-art" aria-hidden="true"><span className="empty-orbit" /><span className="empty-spark">✳</span><b>YOUR<br />NEXT<br /><em>SCENE.</em></b><span className="empty-arrow">↗</span><span className="empty-label">STORY NO. 001 / STILL UNWRITTEN</span></div><h3>好故事，从一个小念头开始。</h3><p>在左侧写下想法，或者试试示例。<br />一起把还没说清的灵感，变成看得见的故事。</p><div className="empty-tags"><span>细化设定</span><i>→</i><span>编排故事</span><i>→</i><span>画面成真</span></div></div>;
}
export function AgentStrip() {
  return <section className="agent-strip" aria-label="创作流程"><div><span className="agent-avatar">P</span><p>提示词子 Agent<small>细化你的设定</small></p></div><span className="connector">↗</span><div><span className="agent-avatar director">D</span><p>主创 Agent<small>编排你的故事</small></p></div><span className="connector">↗</span><div><span className="agent-avatar human">你</span><p>最后一笔，交给你<small>修改 · 确认 · 导出</small></p></div></section>;
}
