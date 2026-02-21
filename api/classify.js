export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API Key not configured on the server.' });
    }

    const { commentText } = req.body;
    if (!commentText) {
        return res.status(400).json({ error: 'Comment text is required.' });
    }

    const systemPrompt = `You are an expert comment/content classifier. You always respond ONLY with a valid JSON object (no markdown, no code fences).`;
    const userPrompt = `Analyze the following comment and provide a detailed classification.

COMMENT:
"""
${commentText}
"""

Respond ONLY with a valid JSON object (no markdown, no code fences) with exactly these fields:
{
  "intent": "<primary intent: one of spam, question, feedback, complaint, appreciation, suggestion, request, opinion, informational, toxic, greeting, humor, promotion, support, other>",
  "confidence": <number 0-100 representing your confidence in the intent classification>,
  "sentiment": "<positive, negative, neutral, or mixed>",
  "sentiment_score": <number from -100 (very negative) to 100 (very positive)>,
  "toxicity_score": <number 0-100 where 0 is not toxic and 100 is very toxic>,
  "category": "<broad category like Technology, Entertainment, Business, Social, Education, Health, General, etc.>",
  "action_required": "<one of: None, Respond, Moderate, Flag, Escalate, Review>",
  "tags": ["<list of 2-5 relevant descriptive tags>"],
  "explanation": "<brief 1-3 sentence explanation of why you classified this comment this way>"
}`;

    const FREE_MODELS = [
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'openai/gpt-oss-120b:free',
        'google/gemma-3-27b-it:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
        'google/gemma-3-12b-it:free'
    ];

    let lastError = null;

    for (const model of FREE_MODELS) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://commentiq.vercel.app', // Usually requested by OpenRouter
                    'X-Title': 'CommentIQ Classifier'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 1024
                })
            });

            const data = await response.json();

            if (response.status === 429 || (response.status === 400 && data.error?.message?.includes('No endpoints'))) {
                lastError = data.error?.message || `Model ${model} rate-limited`;
                continue;
            }

            if (!response.ok) {
                lastError = data.error?.message || `API Error ${response.status}`;
                continue;
            }

            const responseText = data.choices?.[0]?.message?.content;
            if (!responseText) {
                lastError = 'No text in response';
                continue;
            }

            const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanJson);

            return res.status(200).json(parsed);
        } catch (e) {
            lastError = e.message;
        }
    }

    return res.status(502).json({ error: `All models unavailable right now. Last error: ${lastError}` });
}
