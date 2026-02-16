import type { Comment, CommentAnalysis, Sentiment, HNPost } from './schema';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function generateSentimentQuestion(
	apiKey: string,
	model: string,
	post: HNPost,
	comments?: Comment[]
): Promise<string> {
	// Get top 3 parent comments for context
	const topComments = comments?.slice(0, 3).map(c => c.text?.slice(0, 300)).filter(Boolean) || [];
	const commentsContext = topComments.length > 0
		? `\n\nTop comments for context:\n${topComments.map((c, i) => `${i + 1}. "${c}${c && c.length >= 300 ? '...' : ''}"`).join('\n')}`
		: '';

	const prompt = `Given this Hacker News post title and context, generate a clear statement that commenters might agree or disagree with. The statement should capture the main claim or topic being discussed.

Title: ${post.title}
${post.text ? `Body: ${post.text}` : ''}
${post.url ? `URL: ${post.url}` : ''}${commentsContext}

Respond with ONLY the statement, no quotes, no explanation. Make it a declarative statement that can be evaluated as agree/disagree.

Examples of good statements:
- "Remote work is more productive than office work"
- "This new JavaScript framework solves real problems"
- "The author's approach to database design is sound"`;

	const res = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': globalThis.location?.origin || 'https://hnsentiment.experimentarea.com',
			'X-Title': 'HN Sentiment'
		},
		body: JSON.stringify({
			model,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.3,
			max_tokens: 200,
			reasoning: { effort: 'low' }
		})
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`API error: ${res.status} ${err}`);
	}

	const data = await res.json();

	// Handle error responses that still return 200
	if (data.error) {
		throw new Error(data.error.message || JSON.stringify(data.error));
	}

	const choice = data.choices?.[0];
	if (!choice) {
		throw new Error('No choices in API response');
	}

	const content = choice?.message?.content;
	if (!content) {
		const finishReason = choice?.finish_reason || choice?.native_finish_reason;
		if (finishReason === 'length' || finishReason === 'max_output_tokens') {
			throw new Error('Model ran out of tokens - try a non-reasoning model like anthropic/claude-haiku-4.5');
		}
		throw new Error(`Model returned no content (model: ${data.model}) - try anthropic/claude-haiku-4.5`);
	}

	return content.trim().replace(/^["']|["']$/g, '');
}

interface AnalysisResult {
	sentiment: Sentiment;
	npsScore: number;
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
  "npsScore": 0-10 integer,
  "summary": "1-2 sentence summary of the comment's main point",
  "keywords": []
}

Guidelines:
- sentiment: promoter (agrees/supports), neutral (neither/off-topic), detractor (disagrees/opposes)
- npsScore: integer 0-10 reflecting sentiment intensity about the statement
  - 9-10 = promoter, 7-8 = neutral, 0-6 = detractor
- summary: Brief factual summary of the main point
- keywords: 0-5 unique key phrases that provide insight into the commenter's perspective. Only include meaningful phrases, not generic words.`;
}

function fallbackNps(sentiment: Sentiment): number {
	switch (sentiment) {
		case 'promoter': return 9;
		case 'neutral': return 7;
		case 'detractor': return 3;
	}
}

function parseResponse(content: string): AnalysisResult | null {
	try {
		// Strip markdown code blocks if present
		const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
		const parsed = JSON.parse(cleaned);
		if (!['promoter', 'neutral', 'detractor'].includes(parsed.sentiment)) return null;
		const sentiment = parsed.sentiment as Sentiment;
		const parsedNps = Number(parsed.npsScore);
		const npsScore = Number.isFinite(parsedNps)
			? Math.max(0, Math.min(10, Math.round(parsedNps)))
			: fallbackNps(sentiment);
		return {
			sentiment,
			npsScore,
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
	comment: Comment,
	signal?: AbortSignal
): Promise<CommentAnalysis | null> {
	if (!comment.text || comment.deleted || comment.dead) return null;

	const res = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': globalThis.location?.origin || 'https://hnsentiment.experimentarea.com',
			'X-Title': 'HN Sentiment'
		},
		body: JSON.stringify({
			model,
			messages: [{ role: 'user', content: buildPrompt(sentimentQuestion, comment.text) }],
			temperature: 0.3
		}),
		signal
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

const MAX_PARALLEL = 8;

export async function analyzeCommentsBatch(
	apiKey: string,
	model: string,
	sentimentQuestion: string,
	comments: Comment[],
	_batchSize: number, // deprecated, kept for API compat
	onProgress: (done: number, total: number) => void,
	signal?: AbortSignal
): Promise<void> {
	const total = countComments(comments);
	let done = 0;

	// Process a single thread (parent + children sequentially)
	async function processThread(comment: Comment): Promise<void> {
		if (signal?.aborted) return;
		if (comment.text && !comment.deleted && !comment.dead) {
			try {
				const analysis = await analyzeComment(apiKey, model, sentimentQuestion, comment, signal);
				if (analysis) comment.analysis = analysis;
			} catch (e) {
				if (e instanceof Error && e.name === 'AbortError') throw e;
				console.error(`Failed to analyze comment ${comment.id}:`, e);
			}
			done++;
			onProgress(done, total);
		}
		// Process children sequentially
		for (const child of comment.children) {
			await processThread(child);
		}
	}

	// Process top-level comments in parallel, max 8 at a time
	for (let i = 0; i < comments.length; i += MAX_PARALLEL) {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
		const batch = comments.slice(i, i + MAX_PARALLEL);
		await Promise.all(batch.map(processThread));
	}
}

function countComments(comments: Comment[]): number {
	let count = 0;
	const walk = (list: Comment[]) => {
		for (const c of list) {
			if (c.text && !c.deleted && !c.dead) count++;
			walk(c.children);
		}
	};
	walk(comments);
	return count;
}
