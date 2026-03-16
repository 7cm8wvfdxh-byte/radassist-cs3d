// Password protection - checks against APP_PASSWORD env variable

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body;
  const correctPassword = process.env.APP_PASSWORD;

  if (!correctPassword) {
    // No password set = allow everyone
    return res.status(200).json({ ok: true });
  }

  if (password === correctPassword) {
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ ok: false, error: 'Yanlış şifre' });
}
