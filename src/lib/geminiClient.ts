// Shared Gemini API client
// Single place for all AI communication — used by AIPanel and MobileApp

import type { ChatMessage, GeminiTurn } from '../types';
import { getSystemPrompt } from './promptTemplates';

/** Build Gemini-compatible conversation history from ChatMessage[] */
export function buildConversationHistory(messages: ChatMessage[]): GeminiTurn[] {
  const history: GeminiTurn[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    history.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }
  return history;
}

/** Build Gemini-compatible history from simple {role, text} messages (MobileApp format) */
export function buildConversationHistorySimple(
  messages: { role: string; text: string }[]
): GeminiTurn[] {
  const history: GeminiTurn[] = [];
  for (const msg of messages) {
    history.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    });
  }
  return history;
}

/** Call the /api/analyze endpoint */
export async function analyzeWithGemini(opts: {
  prompt: string;
  imageBase64: string | null;
  systemPrompt?: string;
  modality?: string;
  history?: GeminiTurn[];
}): Promise<string> {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: opts.prompt,
        imageBase64: opts.imageBase64,
        systemPrompt: opts.systemPrompt || getSystemPrompt(opts.modality),
        history: opts.history || [],
      }),
    });

    const data = await res.json();

    if (data.text) return data.text;
    if (data.error) return `Hata: ${data.error}`;
    return 'Yanit alinamadi.';
  } catch (err) {
    return `Baglanti hatasi: ${(err as Error).message}`;
  }
}

/** Check if clinical context has any values */
export function hasClinicalContext(ctx: {
  age?: string;
  gender?: string;
  complaint?: string;
  history?: string;
  clinicalQuestion?: string;
}): boolean {
  return !!(ctx.age || ctx.gender || ctx.complaint || ctx.history || ctx.clinicalQuestion);
}
