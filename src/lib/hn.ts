import type { Comment, HNPost } from './schema';

const API_BASE = 'https://hacker-news.firebaseio.com/v0';

interface HNItem {
	id: number;
	type: string;
	by?: string;
	time: number;
	text?: string;
	title?: string;
	url?: string;
	score?: number;
	descendants?: number;
	kids?: number[];
	parent?: number;
	deleted?: boolean;
	dead?: boolean;
}

const cache = new Map<number, HNItem>();

async function fetchItem(id: number): Promise<HNItem | null> {
	if (cache.has(id)) return cache.get(id)!;
	const res = await fetch(`${API_BASE}/item/${id}.json`);
	if (!res.ok) return null;
	const item = await res.json();
	if (item) cache.set(id, item);
	return item;
}

export function parsePostId(input: string): number | null {
	const trimmed = input.trim();
	// Direct ID
	if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
	// URL with id param
	const match = trimmed.match(/[?&]id=(\d+)/);
	if (match) return parseInt(match[1], 10);
	return null;
}

export async function fetchPost(id: number): Promise<HNPost | null> {
	const item = await fetchItem(id);
	if (!item || item.type !== 'story') return null;
	return {
		id: item.id,
		title: item.title || '',
		url: item.url,
		text: item.text,
		author: item.by || '[deleted]',
		time: item.time,
		score: item.score || 0,
		descendants: item.descendants || 0
	};
}

export async function fetchComments(
	postId: number,
	onProgress?: (discovered: number) => void
): Promise<Comment[]> {
	const post = await fetchItem(postId);
	if (!post?.kids) return [];

	const allIds: number[] = [];
	const queue = [...post.kids];

	// First pass: collect all comment IDs (total unknown until done)
	while (queue.length > 0) {
		const id = queue.shift()!;
		allIds.push(id);
		const item = await fetchItem(id);
		if (item?.kids) queue.push(...item.kids);
		onProgress?.(allIds.length);
	}

	// Build tree from cached items
	const itemMap = new Map<number, Comment>();
	for (const id of allIds) {
		const item = cache.get(id);
		if (!item) continue;
		itemMap.set(id, {
			id: item.id,
			parentId: item.parent === postId ? null : (item.parent ?? null),
			author: item.by || '[deleted]',
			time: item.time,
			text: item.text || '',
			deleted: item.deleted,
			dead: item.dead,
			children: []
		});
	}

	// Link children preserving HN's default order from each item's kids[] array.
	for (const [id, comment] of itemMap) {
		const item = cache.get(id);
		if (!item?.kids || item.kids.length === 0) continue;
		comment.children = item.kids
			.map((kidId) => itemMap.get(kidId))
			.filter((child): child is Comment => Boolean(child));
	}

	const roots = (post.kids || [])
		.map((kidId) => itemMap.get(kidId))
		.filter((comment): comment is Comment => Boolean(comment));

	return roots;
}

export type CommentSortMode = 'default' | 'time-asc' | 'time-desc' | 'sentiment-asc' | 'sentiment-desc';

function sentimentScore(c: Comment): number {
	if (typeof c.analysis?.npsScore === 'number') return c.analysis.npsScore;
	switch (c.analysis?.sentiment) {
		case 'promoter': return 9;
		case 'neutral': return 7;
		case 'detractor': return 3;
		default: return 5;
	}
}

export function sortCommentsTree(comments: Comment[], mode: CommentSortMode): Comment[] {
	const cloneAndSort = (list: Comment[]): Comment[] => {
		const cloned = list.map((c) => ({
			...c,
			children: cloneAndSort(c.children)
		}));
		switch (mode) {
			case 'time-asc':
				cloned.sort((a, b) => a.time - b.time);
				break;
			case 'time-desc':
				cloned.sort((a, b) => b.time - a.time);
				break;
			case 'sentiment-asc':
				cloned.sort((a, b) => sentimentScore(a) - sentimentScore(b));
				break;
			case 'sentiment-desc':
				cloned.sort((a, b) => sentimentScore(b) - sentimentScore(a));
				break;
			case 'default':
			default:
				break;
		}
		return cloned;
	};

	return cloneAndSort(comments);
}

export function flattenComments(comments: Comment[]): Comment[] {
	const result: Comment[] = [];
	const walk = (list: Comment[]) => {
		for (const c of list) {
			result.push(c);
			walk(c.children);
		}
	};
	walk(comments);
	return result;
}

export function generateSentimentQuestion(title: string): string {
	// Remove common prefixes and clean up
	let q = title.replace(/^(Show HN|Ask HN|Tell HN|Launch HN):\s*/i, '').trim();
	// If it's a question, keep it; otherwise frame as statement
	if (!q.endsWith('?')) {
		q = `"${q}" is a good/positive thing`;
	}
	return q;
}
