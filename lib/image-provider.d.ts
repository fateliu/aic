/** Provider boundary. Billing confirmation, project revisions and files belong to the orchestrator. */
export interface ImageProvider {
  available: boolean;
  model: string;
  baseUrl: string;
  /** Development fixtures only. Never enable this on a billable provider. */
  simulation?: boolean;
  submit(input: {
    prompt: string;
    size: string;
    /** Optional data URL: uploaded opaque JPEG or a saved generated PNG. Never persist it in job JSON. */
    referenceImage?: string;
  }): Promise<{ taskId: string; status: 'PENDING' | 'RUNNING'; requestId?: string }>;
  query(taskId: string, expectedBase: string): Promise<{
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';
    imageUrl?: string;
    requestId?: string;
    code?: string | null;
  }>;
  download(imageUrl: string): Promise<Uint8Array>;
}

/** Set uncertain=true if a failed submission might have reached the remote provider. */
export interface ImageProviderError extends Error {
  uncertain?: boolean;
  status?: number;
}
