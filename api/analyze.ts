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
    const { prompt, imageBase64, systemPrompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Build Gemini request parts
    const parts: any[] = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      });
    }
    parts.push({ text: prompt });

    const body: any = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    };

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
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
