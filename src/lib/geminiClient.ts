// Shared Gemini API client
// Single place for all AI communication — used by AIPanel and MobileApp

import type { ChatMessage, GeminiTurn } from '../types';
import { getSystemPrompt } from './promptTemplates';
import { apiFetch } from './httpClient';

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
    const result = await apiFetch<{ text?: string; error?: string }>('/api/analyze', {
      body: {
        prompt: opts.prompt,
        imageBase64: opts.imageBase64,
        systemPrompt: opts.systemPrompt || getSystemPrompt(opts.modality),
        history: opts.history || [],
      },
    });

    if (result.data.text) return result.data.text;
    if (result.data.error) return `Hata: ${result.data.error}`;
    return 'Yanit alinamadi.';
  } catch (err) {
    const msg = (err as Error).message || '';
    // Common error patterns with user-friendly messages
    if (msg.includes('Request Entity Too Large') || msg.includes('413')) {
      return 'Hata: Goruntu cok buyuk. Daha kucuk bir goruntu deneyin.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return 'Hata: Internet baglantisi yok veya sunucuya ulasilamiyor.';
    }
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return 'Hata: Oturum suresi dolmus. Sayfayi yenileyin.';
    }
    return `Baglanti hatasi: ${msg}`;
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
