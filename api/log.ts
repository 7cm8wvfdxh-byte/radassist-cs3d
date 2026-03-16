// Usage logging — all logs visible in Vercel Dashboard → Logs

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { event, user, details } = req.body;

  // These appear in Vercel Dashboard → Logs → Function Logs
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: event || 'unknown',
    user: user || 'anonymous',
    details: details || {},
    ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
    ua: req.headers['user-agent'] || 'unknown',
  }));

  return res.status(200).json({ ok: true });
}
