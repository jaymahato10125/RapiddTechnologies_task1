// Proxy to avoid CORS and hide the function code in client bundle
const SOURCE_URL = (process.env['SOURCE_URL'] as string) || 'https://rc-vault-fap-live-1.azurewebsites.net/api/gettimeentries?code=vO17RnE8vuzXzPJo5eaLLjXjmRW07law99QTD90zat9FfOQJKKUcgQ==';

export default async function handler(req: any, res: any) {
  try {
    const resp = await fetch(SOURCE_URL, { headers: { 'accept': 'application/json' } });
    if (!resp.ok) {
      return res.status(resp.status).send(await resp.text());
    }
    const data = await resp.json();
    res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('Proxy error', err);
    return res.status(500).json({ error: 'Failed to fetch entries' });
  }
}
