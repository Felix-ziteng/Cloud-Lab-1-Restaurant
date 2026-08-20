import type { PrintJob } from '@restaurant/shared-types';
import { config } from './config';

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${config.backendUrl}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Print-Agent-Token': config.printAgentToken,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`打印队列接口报错 ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  listPending: () => request<PrintJob[]>('/print-jobs/pending'),
  markPrinted: (id: string) => request(`/print-jobs/${id}`, { method: 'PATCH', body: { status: 'printed' } }),
  markFailed: (id: string, errorMessage: string) =>
    request(`/print-jobs/${id}`, { method: 'PATCH', body: { status: 'failed', errorMessage } }),
};
