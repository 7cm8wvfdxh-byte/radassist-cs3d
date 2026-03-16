// Bug report endpoint — visible in Vercel Dashboard → Logs

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, description, category, screenshot } = req.body;

  console.log(JSON.stringify({
    type: '🐛 BUG_REPORT',
    timestamp: new Date().toISOString(),
    user: user || 'anonymous',
    category: category || 'general',
    description: description || '',
    hasScreenshot: !!screenshot,
    ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
    ua: req.headers['user-agent'] || 'unknown',
  }));

  return res.status(200).json({ ok: true });
}
