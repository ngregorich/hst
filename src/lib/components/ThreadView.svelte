<script lang="ts">
	import type { Comment } from '$lib/schema';

	interface Props {
		comments: Comment[];
		selectedId: number | null;
		idPrefix?: string;
		showCommentText?: boolean;
		showSummary?: boolean;
		showKeywords?: boolean;
		showSentiment?: boolean;
		showAuthor?: boolean;
		showTime?: boolean;
		analyzing?: boolean;
		onSelect: (id: number) => void;
		onKeywordClick?: (keyword: string) => void;
	}

	let { comments, selectedId, idPrefix = '', showCommentText = true, showSummary = true, showKeywords = true, showSentiment = true, showAuthor = true, showTime = true, analyzing = false, onSelect, onKeywordClick }: Props = $props();

	function sentimentBadge(sentiment?: string): { text: string; class: string } {
		switch (sentiment) {
			case 'promoter': return { text: 'Promoter', class: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' };
			case 'detractor': return { text: 'Detractor', class: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' };
			case 'neutral': return { text: 'Neutral', class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' };
			default: return { text: '', class: '' };
		}
	}

	function formatTime(unix: number): string {
		return new Date(unix * 1000).toLocaleString();
	}

	function commentNps(comment: Comment): number {
		if (typeof comment.analysis?.npsScore === 'number') {
			return Math.max(0, Math.min(10, Math.round(comment.analysis.npsScore)));
		}
		switch (comment.analysis?.sentiment) {
			case 'promoter': return 9;
			case 'neutral': return 7;
			case 'detractor': return 3;
			default: return 5;
		}
	}
</script>

<div class="space-y-4">
	{#snippet commentNode(comment: Comment, depth: number)}
		<div
			id={"comment-" + idPrefix + comment.id}
			class="border-l-2 pl-3 py-2 {selectedId === comment.id ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : 'border-gray-200 dark:border-gray-700'}"
			style="margin-left: {depth * 24}px"
		>
			<div
				class="w-full text-left"
				role="button"
				tabindex="0"
				onclick={() => onSelect(comment.id)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onSelect(comment.id);
					}
				}}
			>
				<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
					{#if showAuthor}
						<span class="font-medium text-gray-900 dark:text-gray-100">{comment.author}</span>
					{/if}
					{#if showTime}
						<span>{formatTime(comment.time)}</span>
					{/if}
					{#if showSentiment && comment.analysis}
						{@const badge = sentimentBadge(comment.analysis.sentiment)}
						<span class="px-2 py-0.5 rounded text-xs {badge.class}">{badge.text} · NPS {commentNps(comment)}</span>
					{/if}
				</div>

				{#if showCommentText}
					{#if comment.deleted}
						<p class="text-gray-400 italic mt-1">[deleted]</p>
					{:else if comment.dead}
						<p class="text-gray-400 italic mt-1">[dead]</p>
					{:else}
						<div class="mt-1 text-sm prose dark:prose-invert max-w-none">
							{@html comment.text}
						</div>
					{/if}
				{/if}

				{#if showSummary}
					<div class="mt-2">
						<span class="text-xs font-medium text-gray-500 dark:text-gray-400">Summary:</span>
						{#if analyzing && !comment.analysis?.summary}
							<span class="text-sm text-gray-400 italic ml-1">Analyzing...</span>
						{:else if comment.analysis?.summary}
							<p class="text-sm text-gray-600 dark:text-gray-400 italic">
								{comment.analysis.summary}
							</p>
						{:else}
							<span class="text-sm text-gray-400 ml-1">—</span>
						{/if}
					</div>
				{/if}

				{#if showKeywords}
					<div class="mt-2">
						<span class="text-xs font-medium text-gray-500 dark:text-gray-400">Keywords:</span>
						{#if comment.analysis?.keywords && comment.analysis.keywords.length > 0}
							<div class="inline-flex flex-wrap gap-1 ml-1">
								{#each comment.analysis.keywords as kw}
									<button
										type="button"
										class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs hover:bg-orange-100 dark:hover:bg-orange-900/40"
										onclick={(e) => {
											e.stopPropagation();
											onKeywordClick?.(kw);
										}}
									>{kw}</button>
								{/each}
							</div>
						{:else}
							<span class="text-sm text-gray-400 ml-1">—</span>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		{#each comment.children as child}
			{@render commentNode(child, depth + 1)}
		{/each}
	{/snippet}

	{#each comments as comment}
		{@render commentNode(comment, 0)}
	{/each}
</div>
