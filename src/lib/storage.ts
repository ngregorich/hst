import { get, set, del, keys } from 'idb-keyval';
import type { AnalysisExport, Comment, HNPost } from './schema';
import { DEFAULT_ANALYSIS_PROMPT_TEMPLATE, DEFAULT_QUESTION_PROMPT_TEMPLATE } from './prompts';

const STORAGE_KEY_PREFIX = 'hn-analysis-';
const CACHE_KEY_PREFIX = 'hn-cache-';

// Cached HN data (post + comments, no analysis)
export interface CachedHNData {
	post: HNPost;
	comments: Comment[];
	fetchedAt: string;
}

export async function cacheHNData(postId: number, post: HNPost, comments: Comment[]): Promise<void> {
	const key = `${CACHE_KEY_PREFIX}${postId}`;
	try {
		await set(key, {
			post,
			comments,
			fetchedAt: new Date().toISOString()
		});
	} catch {
		// ignore cache failures
	}
}

export async function getCachedHNData(postId: number): Promise<CachedHNData | null> {
	const key = `${CACHE_KEY_PREFIX}${postId}`;
	try {
		return (await get(key)) || null;
	} catch {
		return null;
	}
}
const PREFS_KEY = 'hn-sentiment-prefs';

export interface Preferences {
	theme: 'light' | 'dark' | 'system';
	apiKey: string;
	model: string;
	sortMode: 'default' | 'time-asc' | 'time-desc' | 'sentiment-asc' | 'sentiment-desc';
	showSummary: boolean;
	showKeywords: boolean;
	showSentiment: boolean;
	showCommentText: boolean;
	showAuthor: boolean;
	showTime: boolean;
	questionPromptTemplate: string;
	analysisPromptTemplate: string;
}

const defaultPrefs: Preferences = {
	theme: 'system',
	apiKey: '',
	model: 'openai/gpt-4o-mini',
	sortMode: 'default',
	showSummary: true,
	showKeywords: true,
	showSentiment: true,
	showCommentText: true,
	showAuthor: true,
	showTime: true,
	questionPromptTemplate: DEFAULT_QUESTION_PROMPT_TEMPLATE,
	analysisPromptTemplate: DEFAULT_ANALYSIS_PROMPT_TEMPLATE
};

// Preferences use localStorage (small, sync access needed)
export function loadPrefs(): Preferences {
	try {
		const stored = localStorage.getItem(PREFS_KEY);
		if (stored) return { ...defaultPrefs, ...JSON.parse(stored) };
	} catch {
		// localStorage unavailable or parse error
	}
	return defaultPrefs;
}

export function savePrefs(prefs: Preferences): void {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		// localStorage full or unavailable
	}
}

// Analysis data uses IndexedDB (larger storage)
// Key format: hn-analysis-{postId}-{model} for per-model caching
function analysisKey(postId: number, model: string): string {
	// Sanitize model name for key (replace / with -)
	const safeModel = model.replace(/\//g, '-');
	return `${STORAGE_KEY_PREFIX}${postId}-${safeModel}`;
}

export async function saveAnalysis(data: AnalysisExport): Promise<{ ok: boolean; error?: string }> {
	try {
		await set(analysisKey(data.hnPostId, data.model), data);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Storage error' };
	}
}

export async function loadAnalysis(postId: number, model: string): Promise<AnalysisExport | null> {
	try {
		return (await get(analysisKey(postId, model))) || null;
	} catch {
		return null;
	}
}

export async function loadAnyAnalysis(postId: number): Promise<AnalysisExport | null> {
	// Load any cached analysis for this post (first one found)
	try {
		const allKeys = await keys();
		const prefix = `${STORAGE_KEY_PREFIX}${postId}-`;
		const matchingKey = allKeys.find((k): k is string =>
			typeof k === 'string' && k.startsWith(prefix)
		);
		if (matchingKey) {
			return (await get(matchingKey)) || null;
		}
		return null;
	} catch {
		return null;
	}
}

export async function deleteAnalysis(postId: number, model: string): Promise<void> {
	try {
		await del(analysisKey(postId, model));
	} catch {
		// ignore
	}
}

export async function listSavedAnalyses(): Promise<number[]> {
	try {
		const allKeys = await keys();
		return allKeys
			.filter((k): k is string => typeof k === 'string' && k.startsWith(STORAGE_KEY_PREFIX))
			.map((k) => parseInt(k.slice(STORAGE_KEY_PREFIX.length), 10))
			.filter((n) => !isNaN(n));
	} catch {
		return [];
	}
}

// Export/import as JSON file
export function exportToFile(data: AnalysisExport): void {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `hn-${data.hnPostId}-analysis.json`;
	a.click();
	URL.revokeObjectURL(url);
}

export function importFromFile(file: File): Promise<AnalysisExport> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const data = JSON.parse(reader.result as string);
				if (!data.version || !data.hnPostId) {
					reject(new Error('Invalid analysis file'));
					return;
				}
				resolve(data);
			} catch {
				reject(new Error('Failed to parse JSON'));
			}
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsText(file);
	});
}
