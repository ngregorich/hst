import { describe, it, expect } from 'vitest';
import { estimateTokens, formatCost, formatTokens } from './tokens';
import type { Comment } from './schema';

describe('estimateTokens', () => {
	it('calculates estimates for comments', () => {
		const comments: Comment[] = [
			{ id: 1, parentId: null, author: 'a', time: 1, text: 'This is a test comment with some text.', children: [] },
			{ id: 2, parentId: null, author: 'b', time: 2, text: 'Another comment here.', children: [] }
		];
		const estimate = estimateTokens(comments, 'openai/gpt-5-mini');
		expect(estimate.commentCount).toBe(2);
		expect(estimate.inputTokens).toBeGreaterThan(0);
		expect(estimate.outputTokens).toBeGreaterThan(0);
		expect(estimate.estimatedCost).toBeGreaterThan(0);
	});

	it('skips deleted comments', () => {
		const comments: Comment[] = [
			{ id: 1, parentId: null, author: 'a', time: 1, text: 'Valid', children: [] },
			{ id: 2, parentId: null, author: 'b', time: 2, text: '', deleted: true, children: [] }
		];
		const estimate = estimateTokens(comments, 'openai/gpt-5-mini');
		expect(estimate.commentCount).toBe(1);
	});
});

describe('formatCost', () => {
	it('shows < $0.01 for tiny costs', () => {
		expect(formatCost(0.001)).toBe('< $0.01');
	});

	it('formats larger costs with 2 decimals', () => {
		expect(formatCost(1.234)).toBe('~$1.23');
	});
});

describe('formatTokens', () => {
	it('formats small numbers as-is', () => {
		expect(formatTokens(500)).toBe('500');
	});

	it('formats thousands with k suffix', () => {
		expect(formatTokens(1500)).toBe('1.5k');
	});

	it('formats millions with M suffix', () => {
		expect(formatTokens(1500000)).toBe('1.50M');
	});
});
