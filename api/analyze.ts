// Vercel Serverless Function — proxies requests to Gemini API
// API key is stored as GEMINI_API_KEY environment variable in Vercel

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  try {
    const { prompt, imageBase64, systemPrompt, history } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Build current message parts
    const currentParts: any[] = [];
    if (imageBase64) {
      currentParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      });
    }
    currentParts.push({ text: prompt });

    // Build contents array with conversation history
    const contents: any[] = [];

    // Add previous conversation turns (if any)
    if (Array.isArray(history) && history.length > 0) {
      // Keep last 10 turns to stay within token limits
      const recentHistory = history.slice(-10);
      for (const turn of recentHistory) {
        contents.push({
          role: turn.role,
          parts: turn.parts,
        });
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const body: any = {
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    };

    if (systemPrompt) {
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
      return res.status(500).json({ error: data.error.message });
    }

    return res.status(500).json({ error: 'No response from Gemini' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
