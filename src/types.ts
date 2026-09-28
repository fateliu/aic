export type Kind = 'text' | 'image' | 'comic' | 'animation';
export type Mode = 'demo' | 'deepseek' | 'ollama';
export type Palette = 'sky' | 'flare';
export type ProjectStatus = 'draft' | 'refining' | 'prompt_review' | 'generating' | 'review' | 'approved' | 'failed';
export interface Brief {
  name: string; kind?: Kind; prompt?: string; ratio?: '16:9' | '9:16' | '1:1'; style?: string;
  time?: string; location?: string; audience?: string; signup?: string;
}
export interface NewBrief { name: string; prompt: string; kind: Kind; ratio: '16:9' | '9:16' | '1:1'; style: string }
export interface Refinement { refinedPrompt: string; characterAnchor: string; negativePrompt: string; assumptions: string[]; questions: string[] }
export interface Shot { visual: string; narration: string; duration?: number }
export interface Creative { headline: string; intro: string; shots: Shot[] }
export interface Skill { id: string; name: string; description: string; kinds: Kind[]; origin: string; source?: string; license: string; sha256?: string }
export interface TraceEvent { agent?: string; tool: string; detail: string; at: string }
export interface Reference { id: string; name: string; mimeType: 'image/jpeg'; width: number; height: number; bytes: number; sha256: string; asset: string; createdAt: string }
export type ImageStatus = 'SUBMITTING' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN' | 'SUBMIT_UNKNOWN' | 'DOWNLOAD_FAILED';
export interface ImageJob {
  id: string; revision: number; unitIndex: number; model: string; prompt: string; size: string; status: ImageStatus;
  taskId?: string; asset?: string; error?: string; lastPollError?: string;
  referenceUploadId?: string; referenceJobId?: string; referenceName?: string; replaces?: string;
}
export interface Project {
  id: string; schemaVersion: 1 | 2; brief: Brief; revision: number; status: ProjectStatus;
  mode: Mode; provider: Mode; model?: string; refinement: Refinement | null; creative: Creative | null;
  imageJobs?: ImageJob[]; references?: Reference[]; skills?: Skill[]; trace: TraceEvent[];
  error?: string; lastOperation?: 'refine' | 'generate'; updatedAt: string;
}
export interface ProjectSummary { id: string; name: string; kind: Kind | 'legacy'; status: ProjectStatus; updatedAt: string; provider: Mode }
export interface Theme { palette?: Palette; heroSkyImage?: string; heroFlareImage?: string; backgroundImage?: string; backgroundPosition?: string; backgroundOpacity?: number }
export interface Config { brand: string; deepseekAvailable: boolean; deepseekModel: string; ollamaAvailable: boolean; model?: string; theme: Theme; media: { image: boolean; imageModel: string; simulation: boolean; animation: boolean } }
export type Notify = (message: string, error?: boolean) => void;
export type Run = (task: () => Promise<void>) => Promise<void>;
export const kindNames = { text: '文字', image: '图片', comic: '漫画', animation: '动画', legacy: '旧版活动' };
export const statusNames: Record<ProjectStatus, string> = { draft: '待优化', refining: '优化中', prompt_review: '待确认提示词', generating: '创作中', review: '待确认草稿', approved: '已确认', failed: '执行失败' };
export const imageNames: Record<ImageStatus, string> = { SUBMITTING: '提交中', PENDING: '排队中', RUNNING: '生成中', SUCCEEDED: '已生成', FAILED: '生成失败', CANCELED: '已取消', UNKNOWN: '任务结果未知', SUBMIT_UNKNOWN: '提交结果待核对', DOWNLOAD_FAILED: '已生成，待保存' };
export const pendingImages: ImageStatus[] = ['SUBMITTING', 'PENDING', 'RUNNING', 'DOWNLOAD_FAILED'];
