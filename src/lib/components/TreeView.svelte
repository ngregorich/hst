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
			case 'neutral': return 'bg-gray-400';
			default: return 'bg-gray-300 dark:bg-gray-600';
		}
	}

	function handleKeydown(e: KeyboardEvent, comment: Comment, siblings: Comment[], index: number) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				if (comment.children.length > 0) {
					onSelect(comment.children[0].id);
				} else if (index < siblings.length - 1) {
					onSelect(siblings[index + 1].id);
				}
				break;
			case 'ArrowUp':
				e.preventDefault();
				if (index > 0) {
					onSelect(siblings[index - 1].id);
				} else if (comment.parentId) {
					onSelect(comment.parentId);
				}
				break;
			case 'ArrowRight':
				e.preventDefault();
				if (index < siblings.length - 1) {
					onSelect(siblings[index + 1].id);
				}
				break;
			case 'ArrowLeft':
				e.preventDefault();
				if (comment.parentId) {
					onSelect(comment.parentId);
				}
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				onSelect(comment.id);
				break;
		}
	}
</script>

<div class="text-sm">
	{#snippet node(comment: Comment, siblings: Comment[], index: number, depth: number)}
		<div class="flex items-start gap-1" style="padding-left: {depth * 16}px">
			<button
				class="w-4 h-4 rounded-sm flex-shrink-0 {sentimentColor(comment.analysis?.sentiment)} {selectedId === comment.id ? 'ring-2 ring-orange-500 ring-offset-1 dark:ring-offset-gray-900' : ''}"
				onclick={() => onSelect(comment.id)}
				onkeydown={(e) => handleKeydown(e, comment, siblings, index)}
				title="{comment.author}: {comment.analysis?.sentiment || 'not analyzed'}"
			></button>
			{#if comment.children.length > 0}
				<div class="flex-1">
					{#each comment.children as child, i}
						{@render node(child, comment.children, i, depth + 1)}
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}

	{#each comments as comment, i}
		{@render node(comment, comments, i, 0)}
	{/each}
</div>
