// Vercel Serverless Function — proxies requests to Gemini API
// API key is stored as GEMINI_API_KEY environment variable in Vercel

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,
};

// Input limits — Vercel body limit is ~4.5MB, images should be compressed client-side
const MAX_PROMPT_LENGTH = 10_000;
const MAX_HISTORY_TURNS = 10;
const MAX_IMAGE_SIZE_BYTES = 4_000_000; // ~4MB base64 (after client-side compression)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-RA-Auth');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check — accept any request (login gate removed)
  // Token still sent by client for backwards compat but not enforced

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  try {
    const { prompt, imageBase64, systemPrompt, history } = req.body;

    // Input validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required and must be a string' });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({ error: `prompt too long (max ${MAX_PROMPT_LENGTH} chars)` });
    }

    if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > MAX_IMAGE_SIZE_BYTES) {
      return res.status(400).json({ error: `Goruntu cok buyuk (${(imageBase64.length / 1_000_000).toFixed(1)}MB). Maksimum ~3MB.` });
    }

    // Build current message parts
    const currentParts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
    if (imageBase64 && typeof imageBase64 === 'string') {
      currentParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      });
    }
    currentParts.push({ text: prompt });

    // Build contents array with conversation history
    const contents: Array<{ role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];

    // Add previous conversation turns (if any)
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-MAX_HISTORY_TURNS);
      for (const turn of recentHistory) {
        if (turn.role && Array.isArray(turn.parts)) {
          contents.push({
            role: String(turn.role),
            parts: turn.parts,
          });
        }
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const body: {
      contents: typeof contents;
      generationConfig: { temperature: number; maxOutputTokens: number };
      systemInstruction?: { parts: Array<{ text: string }> };
    } = {
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    };

    if (systemPrompt && typeof systemPrompt === 'string') {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const data = await geminiRes.json();

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return res.status(200).json({
        text: data.candidates[0].content.parts[0].text,
      });
    }

    if (data.error) {
      const geminiMsg = data.error.message || JSON.stringify(data.error);
      console.error('Gemini API error:', geminiMsg);
      return res.status(500).json({ error: `AI servisi hatasi: ${geminiMsg}` });
    }

    return res.status(500).json({ error: 'No response from Gemini' });
  } catch {
    return res.status(500).json({ error: 'Sunucu hatasi — tekrar deneyin' });
  }
}
