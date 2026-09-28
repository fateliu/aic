import { useEffect, useRef, useState } from 'react';
import { useStudio } from './hooks/useStudio';
import { useAppearance } from './hooks/useAppearance';
import { Header, Sidebar, Hero, FormatTabs, BackgroundDialog, EmptyCanvas, AgentStrip } from './components/Shell';
import { Composer } from './components/Composer';
import { ProjectEditor } from './components/ProjectEditor';
import { kindNames, statusNames } from './types';
import type { Kind, Mode } from './types';
export function App() {
  const studio = useStudio(), appearance = useAppearance(studio.config?.theme, studio.notify);
  const [kind, setKind] = useState<Kind>('comic'), [mode, setMode] = useState<Mode>('demo'), [composerKey, setComposerKey] = useState(0);
  const initializedMode = useRef(false);
  useEffect(() => {
    if (studio.config && !initializedMode.current) { initializedMode.current = true; if (studio.config.deepseekAvailable) setMode('deepseek'); }
  }, [studio.config]);
  const project = studio.editor.project;
  function newProject() { if (studio.reset()) { setComposerKey(v => v + 1); setMode(studio.config?.deepseekAvailable ? 'deepseek' : 'demo'); } }
  return <>
    <a className="skip-link" href="#brief-form">跳到创作表单</a>
    <div id="background-layer" aria-hidden="true" style={appearance.backgroundStyle} />
    <Header appearance={appearance} mode={mode} />
    <div className="app-shell">
      <Sidebar projects={studio.history} currentId={project?.id} busy={studio.busy} onNew={newProject} onOpen={studio.open} />
      <main>
        <Hero appearance={appearance} />
        <FormatTabs kind={kind} busy={studio.busy} onChange={value => { setKind(value); studio.notify('已切换新项目类型为' + kindNames[value] + '，右侧已保存项目保持不变。'); }} />
        <div id="notice" role="status" aria-live="polite" className={studio.notice.error ? 'error' : ''}>{studio.notice.message}</div>
        <div className="workspace">
          <Composer key={composerKey} kind={kind} mode={mode} setMode={setMode} config={studio.config} catalog={studio.catalog} busy={studio.busy} onCreate={studio.create} />
          <div className="result-column">
            <AgentStrip />
            <section className="panel canvas">
              <div className="section-title"><h2><span className="step">02</span> 下一帧，创作现场</h2><span id="status" className="tag">{studio.stage ? studio.stage === 'refine' ? '子 Agent 优化中' : '主 Agent 创作中' : project ? statusNames[project.status] : '等待灵感'}</span></div>
              {project ? <ProjectEditor key={project.id + ':' + project.revision} studio={studio} /> : <EmptyCanvas />}
            </section>
          </div>
        </div>
        <footer><strong>KEEP YOUR IMAGINATION IN MOTION. <span>↗</span></strong><span>漫想工坊 / 每一帧，由你决定。</span></footer>
      </main>
    </div>
    <BackgroundDialog appearance={appearance} />
  </>;
}
