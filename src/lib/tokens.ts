import type { Comment } from './schema';
import { flattenComments } from './hn';

// Rough token estimation: ~4 chars per token for English text
const CHARS_PER_TOKEN = 4;

// Approximate prompt overhead per comment (the system prompt template)
const PROMPT_OVERHEAD_TOKENS = 150;

// Approximate output tokens per response
const OUTPUT_TOKENS_PER_COMMENT = 100;

// Buffer applied to the final estimate to account for prompt template variability,
// tokenizer differences between models, and other overhead not captured above.
const ESTIMATE_BUFFER = 1.2;

// Fallback pricing per million tokens (input/output) used when live data is unavailable.
// These will get stale — prefer the live cache populated by fetchLivePricing().
const FALLBACK_PRICING: Record<string, { input: number; output: number }> = {
	'anthropic/claude-haiku-4.5': { input: 1, output: 5 },
	'anthropic/claude-sonnet-4.5': { input: 3, output: 15 },
	'deepseek/deepseek-v3.2': { input: 0.5, output: 2 },
	'google/gemini-3-flash-preview': { input: 0.1, output: 0.4 },
	'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
	'openai/gpt-5-mini': { input: 0.25, output: 2 },
	'openai/gpt-5.2': { input: 1.75, output: 14 },
	'x-ai/grok-4.1-fast': { input: 1, output: 4 }
};

// Live pricing fetched from OpenRouter's /models endpoint (per-million tokens).
// Null until fetchLivePricing() succeeds.
let livePricing: Record<string, { input: number; output: number }> | null = null;
let livePricingFetchedAt = 0;
const PRICING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Fetches current model pricing from the OpenRouter API and caches it in memory.
// Safe to call repeatedly — re-fetches at most once per hour.
// Falls back to FALLBACK_PRICING silently if the request fails.
export async function fetchLivePricing(apiKey: string): Promise<void> {
	const now = Date.now();
	if (livePricing && now - livePricingFetchedAt < PRICING_CACHE_TTL_MS) return;

	try {
		const res = await fetch('https://openrouter.ai/api/v1/models', {
			headers: { Authorization: `Bearer ${apiKey}` }
		});
		if (!res.ok) return;
		const data = await res.json();
		const cache: Record<string, { input: number; output: number }> = {};
		for (const model of data.data ?? []) {
			// API returns USD per token; convert to per-million to match our unit
			const input = parseFloat(model.pricing?.prompt ?? '0') * 1_000_000;
			const output = parseFloat(model.pricing?.completion ?? '0') * 1_000_000;
			cache[model.id] = { input, output };
		}
		livePricing = cache;
		livePricingFetchedAt = now;
	} catch {
		// Silently ignore — estimateTokens will use FALLBACK_PRICING
	}
}

export interface TokenEstimate {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	estimatedCost: number;
	commentCount: number;
}

export function estimateTokens(comments: Comment[], model: string): TokenEstimate {
	const flat = flattenComments(comments).filter((c) => c.text && !c.deleted && !c.dead);
	const commentCount = flat.length;

	const textTokens = flat.reduce((sum, c) => sum + Math.ceil((c.text?.length || 0) / CHARS_PER_TOKEN), 0);
	const inputTokens = Math.ceil((textTokens + commentCount * PROMPT_OVERHEAD_TOKENS) * ESTIMATE_BUFFER);
	const outputTokens = Math.ceil(commentCount * OUTPUT_TOKENS_PER_COMMENT * ESTIMATE_BUFFER);

	const pricing = livePricing?.[model] ?? FALLBACK_PRICING[model] ?? { input: 1, output: 5 };
	const estimatedCost =
		(inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens + outputTokens,
		estimatedCost,
		commentCount
	};
}

export function formatCost(cost: number): string {
	if (cost < 0.01) return `< $0.01`;
	return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(2)}M`;
}
