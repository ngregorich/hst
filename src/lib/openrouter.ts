import type { Comment, CommentAnalysis, Sentiment, HNPost } from './schema';
import { DEFAULT_ANALYSIS_PROMPT_TEMPLATE, DEFAULT_QUESTION_PROMPT_TEMPLATE, renderPromptTemplate } from './prompts';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function generateSentimentQuestion(
	apiKey: string,
	model: string,
	post: HNPost,
	comments?: Comment[],
	questionPromptTemplate?: string
): Promise<string> {
	// Get top 3 parent comments for context
	const topComments = comments?.slice(0, 3).map(c => c.text?.slice(0, 300)).filter(Boolean) || [];
	const topCommentsSection = topComments.length > 0
		? `\n\nTop comments for context:\n${topComments.map((c, i) => `${i + 1}. "${c}${c && c.length >= 300 ? '...' : ''}"`).join('\n')}`
		: '';

	const prompt = renderPromptTemplate(
		questionPromptTemplate?.trim() || DEFAULT_QUESTION_PROMPT_TEMPLATE,
		{
			title: post.title,
			body: post.text || '',
			url: post.url || '',
			body_section: post.text ? `Body: ${post.text}\n` : '',
			url_section: post.url ? `URL: ${post.url}\n` : '',
			top_comments: topCommentsSection,
			top_comments_section: topCommentsSection
		}
	);

	const res = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': globalThis.location?.origin || 'https://hst.experimentarea.com',
			'X-Title': 'HN Sentiment Tool (HST)'
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

function buildPrompt(sentimentQuestion: string, commentText: string, analysisPromptTemplate?: string): string {
	return renderPromptTemplate(
		analysisPromptTemplate?.trim() || DEFAULT_ANALYSIS_PROMPT_TEMPLATE,
		{
			sentiment_question: sentimentQuestion,
			comment_text: commentText
		}
	);
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
	signal?: AbortSignal,
	analysisPromptTemplate?: string
): Promise<CommentAnalysis | null> {
	if (!comment.text || comment.deleted || comment.dead) return null;

	const res = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': globalThis.location?.origin || 'https://hst.experimentarea.com',
			'X-Title': 'HN Sentiment Tool (HST)'
		},
		body: JSON.stringify({
			model,
			messages: [{ role: 'user', content: buildPrompt(sentimentQuestion, comment.text, analysisPromptTemplate) }],
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
	signal?: AbortSignal,
	analysisPromptTemplate?: string
): Promise<void> {
	const total = countComments(comments);
	let done = 0;

	// Process a single thread (parent + children sequentially)
	async function processThread(comment: Comment): Promise<void> {
		if (signal?.aborted) return;
		if (comment.text && !comment.deleted && !comment.dead) {
			try {
				const analysis = await analyzeComment(apiKey, model, sentimentQuestion, comment, signal, analysisPromptTemplate);
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
