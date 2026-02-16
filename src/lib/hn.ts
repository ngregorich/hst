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

	// Link children to parents
	const roots: Comment[] = [];
	for (const comment of itemMap.values()) {
		if (comment.parentId === null) {
			roots.push(comment);
		} else {
			const parent = itemMap.get(comment.parentId);
			if (parent) parent.children.push(comment);
		}
	}

	// Sort by time
	const sortByTime = (a: Comment, b: Comment) => a.time - b.time;
	const sortTree = (comments: Comment[]) => {
		comments.sort(sortByTime);
		for (const c of comments) sortTree(c.children);
	};
	sortTree(roots);

	return roots;
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
