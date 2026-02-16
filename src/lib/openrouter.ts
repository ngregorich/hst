import type { Comment, CommentAnalysis, Sentiment } from './schema';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface AnalysisResult {
	sentiment: Sentiment;
	summary: string;
	keywords: string[];
}

function buildPrompt(sentimentQuestion: string, commentText: string): string {
	return `Analyze this Hacker News comment for sentiment regarding: "${sentimentQuestion}"

Comment:
"""
${commentText}
"""

Respond with JSON only, no markdown:
{
  "sentiment": "promoter" | "neutral" | "detractor",
  "summary": "1-2 sentence summary of the comment's main point",
  "keywords": ["up to 5", "key phrases", "from the comment"]
}

- promoter: agrees with/supports the statement
- neutral: neither supports nor opposes, or off-topic
- detractor: disagrees with/opposes the statement`;
}

function parseResponse(content: string): AnalysisResult | null {
	try {
		// Strip markdown code blocks if present
		const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
		const parsed = JSON.parse(cleaned);
		if (!['promoter', 'neutral', 'detractor'].includes(parsed.sentiment)) return null;
		return {
			sentiment: parsed.sentiment,
			summary: String(parsed.summary || ''),
			keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5).map(String) : []
		};
	} catch {
		return null;
	}
}

export async function analyzeComment(
	apiKey: string,
	model: string,
	sentimentQuestion: string,
	comment: Comment
): Promise<CommentAnalysis | null> {
	if (!comment.text || comment.deleted || comment.dead) return null;

	const res = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages: [{ role: 'user', content: buildPrompt(sentimentQuestion, comment.text) }],
			temperature: 0.3
		})
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`API error: ${res.status} ${err}`);
	}

	const data = await res.json();
	const content = data.choices?.[0]?.message?.content;
	if (!content) return null;

	return parseResponse(content);
}

export async function analyzeCommentsBatch(
	apiKey: string,
	model: string,
	sentimentQuestion: string,
	comments: Comment[],
	batchSize: number,
	onProgress: (done: number, total: number) => void
): Promise<void> {
	const flat = flattenForAnalysis(comments);
	const total = flat.length;
	let done = 0;

	for (let i = 0; i < flat.length; i += batchSize) {
		const batch = flat.slice(i, i + batchSize);
		await Promise.all(
			batch.map(async (comment) => {
				try {
					const analysis = await analyzeComment(apiKey, model, sentimentQuestion, comment);
					if (analysis) comment.analysis = analysis;
				} catch (e) {
					console.error(`Failed to analyze comment ${comment.id}:`, e);
				}
				done++;
				onProgress(done, total);
			})
		);
	}
}

function flattenForAnalysis(comments: Comment[]): Comment[] {
	const result: Comment[] = [];
	const walk = (list: Comment[]) => {
		for (const c of list) {
			if (c.text && !c.deleted && !c.dead) result.push(c);
			walk(c.children);
		}
	};
	walk(comments);
	return result;
}
