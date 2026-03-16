// Usage tracking — sends events to /api/log
// All logs visible in Vercel Dashboard -> Logs

import { apiPost } from './httpClient';

let currentUser = '';

export function setUser(name: string) {
  currentUser = name;
}

export function getUser() {
  return currentUser;
}

export async function logEvent(event: string, details?: Record<string, string | number>) {
  await apiPost('/api/log', { event, user: currentUser, details });
}

// Pre-built event helpers
export const logLogin = () => logEvent('login');
export const logFileUpload = (type: string, count: number) =>
  logEvent('file_upload', { type, count });
export const logAnalyze = (mode: string, organ?: string) =>
  logEvent('ai_analyze', { mode, organ: organ || '' });
export const logToolUse = (tool: string) =>
  logEvent('tool_use', { tool });
export const logServerConnect = (server: string) =>
  logEvent('server_connect', { server });
