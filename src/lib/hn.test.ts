import { describe, it, expect } from 'vitest';
import { parsePostId, generateSentimentQuestion, flattenComments } from './hn';
import type { Comment } from './schema';

describe('parsePostId', () => {
	it('parses numeric ID', () => {
		expect(parsePostId('12345')).toBe(12345);
		expect(parsePostId('  12345  ')).toBe(12345);
	});

	it('parses HN URL with id param', () => {
		expect(parsePostId('https://news.ycombinator.com/item?id=41780712')).toBe(41780712);
		expect(parsePostId('https://news.ycombinator.com/item?id=41780712&foo=bar')).toBe(41780712);
	});

	it('returns null for invalid input', () => {
		expect(parsePostId('')).toBe(null);
		expect(parsePostId('abc')).toBe(null);
		expect(parsePostId('https://example.com')).toBe(null);
	});
});

describe('generateSentimentQuestion', () => {
	it('wraps title in quotes with judgment', () => {
		expect(generateSentimentQuestion('A New Framework')).toBe('"A New Framework" is a good/positive thing');
	});

	it('strips Show HN prefix', () => {
		expect(generateSentimentQuestion('Show HN: My Project')).toBe('"My Project" is a good/positive thing');
	});

	it('keeps questions as-is', () => {
		expect(generateSentimentQuestion('Ask HN: What do you think?')).toBe('What do you think?');
	});
});

describe('flattenComments', () => {
	it('flattens nested structure', () => {
		const comments: Comment[] = [
			{
				id: 1, parentId: null, author: 'a', time: 1, text: 't1', children: [
					{ id: 2, parentId: 1, author: 'b', time: 2, text: 't2', children: [] }
				]
			},
			{ id: 3, parentId: null, author: 'c', time: 3, text: 't3', children: [] }
		];
		const flat = flattenComments(comments);
		expect(flat.map(c => c.id)).toEqual([1, 2, 3]);
	});
});
