<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		initialWidth?: number;
		minWidth?: number;
		maxWidth?: number;
		left: Snippet;
		right: Snippet;
	}

	let { initialWidth = 200, minWidth = 100, maxWidth = 600, left, right }: Props = $props();

	let width = $state(initialWidth);
	let dragging = $state(false);
	let container: HTMLDivElement;

	function handleMouseDown(e: MouseEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!dragging || !container) return;
		const rect = container.getBoundingClientRect();
		const newWidth = e.clientX - rect.left;
		width = Math.max(minWidth, Math.min(maxWidth, newWidth));
	}

	function handleMouseUp() {
		dragging = false;
	}

	onMount(() => {
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	});
</script>

<div bind:this={container} class="flex w-full {dragging ? 'select-none' : ''}">
	<div style="width: {width}px; flex-shrink: 0;">
		{@render left()}
	</div>
	<button
		class="w-1.5 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-orange-400 dark:hover:bg-orange-600 transition-colors flex-shrink-0 {dragging ? 'bg-orange-500' : ''}"
		onmousedown={handleMouseDown}
		aria-label="Resize panels"
	></button>
	<div class="flex-1 min-w-0">
		{@render right()}
	</div>
</div>
