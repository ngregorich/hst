<script lang="ts">
	import { tick, onMount } from 'svelte';
	import type { Comment } from '$lib/schema';

	interface Props {
		comments: Comment[];
		selectedId: number | null;
		onSelect: (id: number) => void;
	}

	let { comments, selectedId, onSelect }: Props = $props();

	// Flatten comments for linear navigation (depth-first order)
	let flatList = $derived.by(() => {
		const result: Comment[] = [];
		function walk(list: Comment[]) {
			for (const c of list) {
				result.push(c);
				walk(c.children);
			}
		}
		walk(comments);
		return result;
	});

	// Auto-focus first comment on mount so arrow keys work immediately
	onMount(() => {
		if (comments.length > 0 && selectedId === null) {
			selectAndFocus(comments[0].id);
		}
	});

	function sentimentColor(sentiment?: string): string {
		switch (sentiment) {
			case 'promoter': return 'bg-green-500';
			case 'detractor': return 'bg-red-500';
			case 'neutral': return 'bg-gray-400';
			default: return 'bg-gray-300 dark:bg-gray-600';
		}
	}

	async function selectAndFocus(id: number) {
		onSelect(id);
		await tick();
		const el = document.getElementById(`tree-node-${id}`);
		el?.focus();
	}

	function handleKeydown(e: KeyboardEvent, comment: Comment) {
		const currentIndex = flatList.findIndex(c => c.id === comment.id);
		if (currentIndex === -1) return;

		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowRight':
				e.preventDefault();
				if (currentIndex < flatList.length - 1) {
					selectAndFocus(flatList[currentIndex + 1].id);
				}
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
				e.preventDefault();
				if (currentIndex > 0) {
					selectAndFocus(flatList[currentIndex - 1].id);
				}
				break;
		}
	}
</script>

<div class="text-sm" style="line-height: 11px;">
	{#snippet node(comment: Comment, depth: number)}
		<div class="flex items-start" style="padding-left: {depth * 3}px;">
			<button
				id="tree-node-{comment.id}"
				class="w-2 h-2 rounded-sm flex-shrink-0 {sentimentColor(comment.analysis?.sentiment)} {selectedId === comment.id ? 'ring-2 ring-orange-500' : ''} focus:outline-none focus:ring-2 focus:ring-orange-500"
				onclick={() => selectAndFocus(comment.id)}
				onkeydown={(e) => handleKeydown(e, comment)}
				title="{comment.author}: {comment.analysis?.sentiment || 'not analyzed'}"
			></button>
			{#if comment.children.length > 0}
				<div>
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
