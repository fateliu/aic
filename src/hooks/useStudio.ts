import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { api, downloadJson, errorMessage } from '../lib/api';
import { editorDirty, editorReducer, emptyEditor } from '../state/project';
import type { Config, Mode, NewBrief, Project, ProjectSummary, Skill } from '../types';
export function useStudio() {
  const [editor, dispatch] = useReducer(editorReducer, emptyEditor);
  const [config, setConfig] = useState<Config | null>(null);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [history, setHistory] = useState<ProjectSummary[]>([]);
  const [notice, setNotice] = useState({ message: '准备好了吗？写下想法，和创作助手一起把它变成下一帧。', error: false });
  const [busy, setBusy] = useState(false), working = useRef(false);
  const [stage, setStage] = useState<'refine' | 'generate'>();
  const { promptDirty, creativeDirty } = editorDirty(editor);
  const notify = useCallback((message: string, error = false) => setNotice({ message, error }), []);
  const refreshHistory = useCallback(async () => setHistory(await api<ProjectSummary[]>('/api/projects')), []);
  const run = useCallback(async (task: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true);
    try { await task(); } catch (error) { notify(errorMessage(error), true); }
    finally { working.current = false; setBusy(false); }
  }, [notify]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Config>('/api/config', 'GET', undefined, controller.signal),
      api<Skill[]>('/api/skills', 'GET', undefined, controller.signal),
      api<ProjectSummary[]>('/api/projects', 'GET', undefined, controller.signal),
    ]).then(([settings, skills, projects]) => {
      setConfig(settings); setCatalog(skills); setHistory(projects);
    }).catch(error => { if (!controller.signal.aborted) notify('连接失败：' + errorMessage(error), true); });
    return () => controller.abort();
  }, [notify]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (busy || promptDirty || creativeDirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [busy, promptDirty, creativeDirty]);
  const canLeave = () => !(promptDirty || creativeDirty) || window.confirm('有未保存的修改，确定离开吗？');
  async function executeStage(project: Project, operation: 'refine' | 'generate') {
    setStage(operation);
    notify(operation === 'refine' ? '正在细化提示词、角色与限制条件…' : '主创 Agent 正在组织文案和分镜…');
    try {
      const result = await api<Project>('/api/projects/' + project.id + '/' + operation, 'POST', { revision: project.revision });
      dispatch({ type: 'load', project: result }); await refreshHistory();
      notify(result.status === 'failed' ? result.error || '生成失败，请重试' : operation === 'refine' ? '提示词已整理。展开检查补充设定，可以编辑后保存。' : '草稿已完成。请检查文案与分镜，再确认导出。', result.status === 'failed');
    } finally { setStage(undefined); }
  }
  function create(brief: NewBrief, mode: Mode, skillIds: string[]) {
    if (!canLeave()) return;
    void run(async () => {
      const project = await api<Project>('/api/projects', 'POST', { brief, mode, skillIds });
      dispatch({ type: 'load', project }); await refreshHistory(); await executeStage(project, 'refine');
    });
  }
  function open(id: string) {
    if (!canLeave()) return;
    void run(async () => { dispatch({ type: 'load', project: await api<Project>('/api/projects/' + id) }); notify('已打开保存的项目。左侧输入用于创建新项目。'); });
  }
  function reset() {
    if (!canLeave() || working.current) return false;
    dispatch({ type: 'load', project: null }); notify('开始一份新的创作。'); return true;
  }
  function generate() {
    if (!editor.project || (editor.project.creative && !window.confirm('这会替换当前草稿。继续吗？'))) return;
    void run(() => executeStage(editor.project!, 'generate'));
  }
  function refineAgain() {
    if (!editor.project || !window.confirm('重新优化会替换优化提示词和已有草稿。继续吗？')) return;
    void run(() => executeStage(editor.project!, 'refine'));
  }
  function savePrompt() {
    const p = editor.project;
    if (!p || !editor.prompt || (p.creative && !window.confirm('保存提示词会使现有草稿失效，之后需要重新生成。继续吗？'))) return;
    void run(async () => {
      dispatch({ type: 'load', project: await api<Project>('/api/projects/' + p.id + '/refinement', 'PATCH', { revision: p.revision, refinement: editor.prompt }) });
      await refreshHistory(); notify('提示词已保存，请检查后交给主创 Agent。');
    });
  }
  function saveCreative() {
    const p = editor.project; if (!p || !editor.creative) return;
    void run(async () => {
      dispatch({ type: 'load', project: await api<Project>('/api/projects/' + p.id + '/creative', 'PATCH', { revision: p.revision, creative: editor.creative }) });
      await refreshHistory(); notify('草稿已保存，请重新确认。');
    });
  }
  function approve() {
    const p = editor.project; if (!p) return;
    void run(async () => {
      dispatch({ type: 'load', project: await api<Project>('/api/projects/' + p.id + '/approve', 'POST', { revision: p.revision }) });
      await refreshHistory(); notify('当前版本已确认，可以导出创作稿和完整项目。');
    });
  }
  function retry() {
    if (editor.project) void run(() => executeStage(editor.project!, editor.project!.schemaVersion !== 2 || editor.project!.lastOperation === 'generate' ? 'generate' : 'refine'));
  }
  function mediaRequest() {
    const p = editor.project; if (!p) return;
    void run(async () => {
      const result = await api<{ message: string }>('/api/projects/' + p.id + '/media-request', 'POST', {});
      downloadJson(result, 'media-request-' + p.id + '.json'); notify(result.message);
    });
  }
  const updateMedia = useCallback((project: Project) => dispatch({ type: 'media', project }), []);
  const updateReferences = useCallback((project: Project) => dispatch({ type: 'references', project }), []);
  return { editor, dispatch, config, catalog, history, notice, busy, stage, promptDirty, creativeDirty,
    notify, run, create, open, reset, generate, refineAgain, savePrompt, saveCreative, approve, retry, mediaRequest, updateMedia, updateReferences };
}
export type Studio = ReturnType<typeof useStudio>;
