// Usage tracking — sends events to /api/log
// All logs visible in Vercel Dashboard → Logs

let currentUser = '';

export function setUser(name: string) {
  currentUser = name;
}

export function getUser() {
  return currentUser;
}

export async function logEvent(event: string, details?: Record<string, any>) {
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        user: currentUser,
        details,
      }),
    });
  } catch {
    // Fail silently — logging shouldn't break the app
  }
}

// Pre-built event helpers
export const logLogin = () => logEvent('login');
export const logFileUpload = (type: string, count: number) =>
  logEvent('file_upload', { type, count });
export const logAnalyze = (mode: string, organ?: string) =>
  logEvent('ai_analyze', { mode, organ });
export const logToolUse = (tool: string) =>
  logEvent('tool_use', { tool });
export const logServerConnect = (server: string) =>
  logEvent('server_connect', { server });
