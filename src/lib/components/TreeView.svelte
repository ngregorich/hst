	<script lang="ts">
		import type { Comment } from '$lib/schema';

	interface Props {
		comments: Comment[];
		selectedId: number | null;
		onSelect: (id: number) => void;
	}

	let { comments, selectedId, onSelect }: Props = $props();

	function sentimentColor(sentiment?: string): string {
		switch (sentiment) {
			case 'promoter': return 'bg-green-500';
			case 'detractor': return 'bg-red-500';
			case 'neutral': return 'bg-slate-500';
			default: return 'bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-500';
		}
	}
</script>

<div class="text-sm space-y-2">
	{#snippet node(comment: Comment, depth: number)}
		<div class="flex items-start gap-2" style="padding-left: {depth * 8}px;">
				<button
					id="tree-node-{comment.id}"
					class="w-2.5 h-2.5 mt-[2px] rounded-sm flex-shrink-0 {sentimentColor(comment.analysis?.sentiment)} {selectedId === comment.id ? 'ring-2 ring-yellow-400' : ''} focus:outline-none focus:ring-2 focus:ring-yellow-500"
					onclick={() => onSelect(comment.id)}
					title="{comment.author}: {comment.analysis?.sentiment || 'not analyzed yet'}"
				></button>
			{#if comment.children.length > 0}
				<div class="space-y-2">
					{#each comment.children as child}
						{@render node(child, depth + 1)}
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}

	{#each comments as comment}
		{@render node(comment, 0)}
	{/each}
</div>
