import type { Creative, Project, Refinement } from '../types';
export interface EditorState {
  project: Project | null; prompt: Refinement | null; creative: Creative | null;
  promptChecked: boolean; approvedChecked: boolean;
}
export const emptyEditor: EditorState = { project: null, prompt: null, creative: null, promptChecked: false, approvedChecked: false };
export type EditorAction =
  | { type: 'load'; project: Project | null }
  | { type: 'prompt'; value: Refinement }
  | { type: 'creative'; value: Creative }
  | { type: 'promptChecked' | 'approvedChecked'; value: boolean }
  | { type: 'media' | 'references'; project: Project };
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load': return action.project ? {
      project: action.project, prompt: action.project.refinement, creative: action.project.creative,
      promptChecked: false, approvedChecked: action.project.status === 'approved',
    } : emptyEditor;
    case 'prompt': return { ...state, prompt: action.value, promptChecked: false, approvedChecked: false };
    case 'creative': return { ...state, creative: action.value, approvedChecked: false };
    case 'promptChecked': return { ...state, promptChecked: action.value };
    case 'approvedChecked': return { ...state, approvedChecked: action.value };
    case 'media':
      if (state.project?.id !== action.project.id || state.project.revision !== action.project.revision) return state;
      return { ...state, project: { ...state.project, imageJobs: action.project.imageJobs, trace: action.project.trace } };
    case 'references':
      if (state.project?.id !== action.project.id) return state;
      return { ...state, project: { ...state.project, references: action.project.references } };
  }
}
export function editorDirty(state: EditorState) {
  return {
    promptDirty: JSON.stringify(state.prompt) !== JSON.stringify(state.project?.refinement ?? null),
    creativeDirty: JSON.stringify(state.creative) !== JSON.stringify(state.project?.creative ?? null),
  };
}
