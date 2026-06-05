// Vercel serverless function — WHOOP OAuth token proxy
// Needed because WHOOP's token endpoint blocks direct browser calls (CORS).
// Environment variables required in Vercel dashboard:
//   WHOOP_CLIENT_ID     — your WHOOP app Client ID
//   WHOOP_CLIENT_SECRET — your WHOOP app Client Secret
//   WHOOP_REDIRECT_URI  — must match exactly: https://jarvis1-sigma.vercel.app/health.html

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://jarvis1-sigma.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { grant_type, code, redirect_uri, refresh_token } = req.body || {};

  const CLIENT_ID     = process.env.WHOOP_CLIENT_ID;
  const CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.WHOOP_REDIRECT_URI || redirect_uri;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'WHOOP credentials not configured in Vercel env vars.' });
  }

  const params = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type });
  if (grant_type === 'authorization_code') { params.set('code', code); params.set('redirect_uri', REDIRECT_URI); }
  if (grant_type === 'refresh_token')      { params.set('refresh_token', refresh_token); }

  try {
    const upstream = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream WHOOP request failed', detail: err.message });
  }
}
