<script lang="ts">
	import type { Comment, HNPost } from '$lib/schema';
	import { flattenComments } from '$lib/hn';

	interface Props {
		post: HNPost;
		comments: Comment[];
	}

	let { post, comments }: Props = $props();

	let stats = $derived.by(() => {
		const flat = flattenComments(comments);
		const analyzed = flat.filter((c) => c.analysis);
		const promoters = analyzed.filter((c) => c.analysis?.sentiment === 'promoter').length;
		const neutrals = analyzed.filter((c) => c.analysis?.sentiment === 'neutral').length;
		const detractors = analyzed.filter((c) => c.analysis?.sentiment === 'detractor').length;

		// Count keywords
		const keywordCounts = new Map<string, number>();
		for (const c of analyzed) {
			for (const kw of c.analysis?.keywords || []) {
				const lower = kw.toLowerCase();
				keywordCounts.set(lower, (keywordCounts.get(lower) || 0) + 1);
			}
		}
		const topKeywords = [...keywordCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10);

		return { total: flat.length, analyzed: analyzed.length, promoters, neutrals, detractors, topKeywords };
	});

	function pct(n: number) {
		return stats.analyzed > 0 ? Math.round((n / stats.analyzed) * 100) : 0;
	}
</script>

<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
	<div>
		<h2 class="text-lg font-semibold">{post.title}</h2>
		<p class="text-sm text-gray-600 dark:text-gray-400">
			{post.score} points by {post.author} | {stats.total} comments
		</p>
	</div>

	{#if stats.analyzed > 0}
		<div class="grid grid-cols-3 gap-4 text-center">
			<div class="p-3 bg-green-100 dark:bg-green-900/30 rounded">
				<div class="text-2xl font-bold text-green-700 dark:text-green-400">{pct(stats.promoters)}%</div>
				<div class="text-sm text-green-600 dark:text-green-500">Promoters ({stats.promoters})</div>
			</div>
			<div class="p-3 bg-gray-100 dark:bg-gray-800 rounded">
				<div class="text-2xl font-bold text-gray-700 dark:text-gray-300">{pct(stats.neutrals)}%</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">Neutral ({stats.neutrals})</div>
			</div>
			<div class="p-3 bg-red-100 dark:bg-red-900/30 rounded">
				<div class="text-2xl font-bold text-red-700 dark:text-red-400">{pct(stats.detractors)}%</div>
				<div class="text-sm text-red-600 dark:text-red-500">Detractors ({stats.detractors})</div>
			</div>
		</div>

		{#if stats.topKeywords.length > 0}
			<div>
				<h3 class="text-sm font-medium mb-2">Top Keywords</h3>
				<div class="flex flex-wrap gap-2">
					{#each stats.topKeywords as [kw, count]}
						<span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm">
							{kw} ({count})
						</span>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		<p class="text-sm text-gray-500">No analysis yet. Configure your API key and run analysis.</p>
	{/if}
</div>
