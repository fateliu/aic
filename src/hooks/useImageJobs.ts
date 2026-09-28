import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { pendingImages } from '../types';
import type { Notify, Project } from '../types';
export function useImageJobs(project: Project, blocked: boolean, update: (project: Project) => void, notify: Notify) {
  const [failures, setFailures] = useState(0);
  const pending = project.imageJobs?.find(job => pendingImages.includes(job.status));
  useEffect(() => {
    if (!pending || blocked || failures >= 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await api<Project>('/api/projects/' + project.id + '/images/' + pending.id + '/refresh', 'POST', {}, controller.signal);
        if (controller.signal.aborted) return;
        update(result);
        const next = result.imageJobs?.find(j => j.id === pending.id)?.lastPollError ? failures + 1 : 0;
        setFailures(next);
        if (next >= 3) notify('图片状态自动刷新已暂停，请手动刷新或重试保存图片。不会重新提交生图。', true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setFailures(failures + 1);
        notify(failures + 1 >= 3 ? '图片状态自动刷新已暂停，请手动刷新；不会重新提交生图。' : '图片状态查询失败：' + errorMessage(error), true);
      }
    }, 4000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [project.id, pending, blocked, failures, notify, update]);
  const refresh = useCallback(async (jobId: string) => {
    setFailures(0);
    const result = await api<Project>('/api/projects/' + project.id + '/images/' + jobId + '/refresh', 'POST', {});
    update(result);
    const error = result.imageJobs?.find(j => j.id === jobId)?.lastPollError;
    if (error) notify(error, true);
  }, [project.id, update, notify]);
  const recover = useCallback(async (jobId: string, taskId: string) => {
    const result = await api<Project>('/api/projects/' + project.id + '/images/' + jobId + '/recover', 'POST', { taskId });
    setFailures(0); update(result);
  }, [project.id, update]);
  const resetFailures = useCallback(() => setFailures(0), []);
  return { refresh, recover, resetFailures };
}
