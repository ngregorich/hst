<script lang="ts">
	interface Props {
		done: number;
		total: number;
		label?: string;
	}

	let { done, total, label = 'Processing' }: Props = $props();

	let percent = $derived(total > 0 ? Math.round((done / total) * 100) : 0);
</script>

<div class="space-y-1">
	<div class="flex justify-between text-sm text-gray-600 dark:text-gray-400">
		<span>{label}</span>
		<span>{done} / {total} ({percent}%)</span>
	</div>
	<div class="h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
		<div
			class="h-full bg-orange-600 transition-all duration-200"
			style="width: {percent}%"
		></div>
	</div>
</div>
