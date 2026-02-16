export const SCHEMA_VERSION = '1.0';

export type Sentiment = 'promoter' | 'neutral' | 'detractor';

export interface CommentAnalysis {
	sentiment: Sentiment;
	npsScore?: number; // 0-10, where 9-10 promoter, 7-8 neutral, 0-6 detractor
	summary: string;
	keywords: string[];
}

export interface Comment {
	id: number;
	parentId: number | null;
	author: string;
	time: number;
	text: string;
	deleted?: boolean;
	dead?: boolean;
	children: Comment[];
	analysis?: CommentAnalysis;
}

export interface HNPost {
	id: number;
	title: string;
	url?: string;
	text?: string;
	author: string;
	time: number;
	score: number;
	descendants: number;
}

export interface AnalysisExport {
	version: string;
	hnPostId: number;
	hnPostUrl: string;
	title: string;
	sentimentQuestion: string;
	model: string;
	analyzedAt: string;
	threadSummary?: string;
	post: HNPost;
	comments: Comment[];
}

export interface AnalysisState {
	post: HNPost | null;
	comments: Comment[];
	sentimentQuestion: string;
	model: string;
	progress: { done: number; total: number } | null;
}

export const MODELS = [
	'anthropic/claude-haiku-4.5',
	'anthropic/claude-sonnet-4.5',
	'deepseek/deepseek-v3.2',
	'google/gemini-3-flash-preview',
	'openai/gpt-4o-mini',
	'openai/gpt-5-mini',
	'openai/gpt-5.2',
	'x-ai/grok-4.1-fast'
] as const;

export const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
