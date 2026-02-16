<script lang="ts">
	import type { Comment } from '$lib/schema';

	interface Props {
		comments: Comment[];
		selectedId: number | null;
		showSummary?: boolean;
		showKeywords?: boolean;
		showSentiment?: boolean;
		onSelect: (id: number) => void;
	}

	let { comments, selectedId, showSummary = true, showKeywords = true, showSentiment = true, onSelect }: Props = $props();

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
</script>

<div class="space-y-4">
	{#snippet commentNode(comment: Comment, depth: number)}
		<div
			id="comment-{comment.id}"
			class="border-l-2 pl-3 py-2 {selectedId === comment.id ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-700'}"
			style="margin-left: {depth * 24}px"
		>
			<button
				class="w-full text-left"
				onclick={() => onSelect(comment.id)}
			>
				<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
					<span class="font-medium text-gray-900 dark:text-gray-100">{comment.author}</span>
					<span>{formatTime(comment.time)}</span>
					{#if showSentiment && comment.analysis}
						{@const badge = sentimentBadge(comment.analysis.sentiment)}
						<span class="px-2 py-0.5 rounded text-xs {badge.class}">{badge.text}</span>
					{/if}
				</div>

				{#if comment.deleted}
					<p class="text-gray-400 italic mt-1">[deleted]</p>
				{:else if comment.dead}
					<p class="text-gray-400 italic mt-1">[dead]</p>
				{:else}
					<div class="mt-1 text-sm prose dark:prose-invert max-w-none">
						{@html comment.text}
					</div>
				{/if}

				{#if comment.analysis}
					{#if showSummary && comment.analysis.summary}
						<p class="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
							{comment.analysis.summary}
						</p>
					{/if}
					{#if showKeywords && comment.analysis.keywords.length > 0}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each comment.analysis.keywords as kw}
								<span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{kw}</span>
							{/each}
						</div>
					{/if}
				{/if}
			</button>
		</div>

		{#each comment.children as child}
			{@render commentNode(child, depth + 1)}
		{/each}
	{/snippet}

	{#each comments as comment}
		{@render commentNode(comment, 0)}
	{/each}
</div>
