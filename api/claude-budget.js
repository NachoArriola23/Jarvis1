export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured in Vercel env vars.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const { prompt = '', income = [], expenses = [], goals = [] } = body;
  const totalIncome   = income.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const incTxt  = income.length   ? income.map(i   => `  - ${i.name}: $${i.amount}/month`).join('\n')                              : '  (none)';
  const expTxt  = expenses.length ? expenses.map(e  => `  - ${e.name}: $${e.amount} [${e.category}, priority ${e.priority}/5]`).join('\n') : '  (none)';
  const goalTxt = goals.length    ? goals.map(g     => `  - "${g.name}" — target $${g.target}, saved $${g.current || 0}`).join('\n') : '  (none)';

  const userMsg = `Create a personalized monthly budget plan.

USER'S GOAL: "${prompt || 'balanced budget'}"

INCOME (total $${totalIncome}/month):
${incTxt}

PLANNED EXPENSES (total $${totalExpenses}):
${expTxt}

MONTHLY GOALS:
${goalTxt}

Return ONLY valid JSON — no markdown, no explanation outside the JSON — in this exact schema:
{
  "allocations": [
    { "category": "Housing",       "amount": 0, "reasoning": "one short sentence" },
    { "category": "Food",          "amount": 0, "reasoning": "one short sentence" },
    { "category": "Transport",     "amount": 0, "reasoning": "one short sentence" },
    { "category": "Health",        "amount": 0, "reasoning": "one short sentence" },
    { "category": "Entertainment", "amount": 0, "reasoning": "one short sentence" },
    { "category": "Other",         "amount": 0, "reasoning": "one short sentence" },
    { "category": "Savings",       "amount": 0, "reasoning": "one short sentence" }
  ],
  "summary": "2-3 sentence personalized summary",
  "tips": ["tip 1", "tip 2", "tip 3"],
  "goalInsights": [
    { "goalName": "exact goal name", "insight": "one sentence", "onTrack": true }
  ]
}

Rules:
- all 7 allocations must be present; amounts must sum to exactly $${totalIncome}
- base allocations on actual expense data where available; use user goal to guide priorities
- goalInsights must have one entry per goal (same order)
- reasoning ≤ 12 words; goal insight ≤ 20 words; summary 2-3 sentences, warm and personal`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1600,
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You are a sharp personal finance advisor. Always respond with valid JSON only — no markdown, no commentary outside the JSON object.' },
          { role: 'user',   content: userMsg },
        ],
      }),
    });

    const raw = await r.text();
    if (!r.ok) return res.status(500).json({ error: 'Groq error: ' + raw });

    const data = JSON.parse(raw);
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Could not parse JSON from Groq response', raw: text.slice(0, 400) });

    const plan = JSON.parse(match[0]);
    return res.status(200).json(plan);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
