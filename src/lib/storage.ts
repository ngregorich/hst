import { get, set, del, keys } from 'idb-keyval';
import type { AnalysisExport } from './schema';

const STORAGE_KEY_PREFIX = 'hn-analysis-';
const PREFS_KEY = 'hn-sentiment-prefs';

export interface Preferences {
	theme: 'light' | 'dark' | 'system';
	apiKey: string;
	model: string;
	showSummary: boolean;
	showKeywords: boolean;
	showSentiment: boolean;
}

const defaultPrefs: Preferences = {
	theme: 'system',
	apiKey: '',
	model: 'openai/gpt-5-mini',
	showSummary: true,
	showKeywords: true,
	showSentiment: true
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
export async function saveAnalysis(data: AnalysisExport): Promise<{ ok: boolean; error?: string }> {
	try {
		await set(`${STORAGE_KEY_PREFIX}${data.hnPostId}`, data);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Storage error' };
	}
}

export async function loadAnalysis(postId: number): Promise<AnalysisExport | null> {
	try {
		return (await get(`${STORAGE_KEY_PREFIX}${postId}`)) || null;
	} catch {
		return null;
	}
}

export async function deleteAnalysis(postId: number): Promise<void> {
	try {
		await del(`${STORAGE_KEY_PREFIX}${postId}`);
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
