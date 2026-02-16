<script lang="ts">
	import type { Comment, HNPost } from '$lib/schema';
	import { flattenComments } from '$lib/hn';

	interface Props {
		post: HNPost;
		comments: Comment[];
		analysisModel: string | null;
		analyzing?: boolean;
		threadSummary?: string;
		generatingThreadSummary?: boolean;
		sentimentQuestion?: string;
		onKeywordClick?: (keyword: string) => void;
	}

	let {
		post,
		comments,
		analysisModel,
		analyzing = false,
		threadSummary = '',
		generatingThreadSummary = false,
		sentimentQuestion = '',
		onKeywordClick
	}: Props = $props();

	let stats = $derived.by(() => {
		const flat = flattenComments(comments);
		const analyzable = flat.filter((c) => c.text && !c.deleted && !c.dead);
		const analyzed = analyzable.filter((c) => c.analysis);
		const promoters = analyzed.filter((c) => c.analysis?.sentiment === 'promoter').length;
		const neutrals = analyzed.filter((c) => c.analysis?.sentiment === 'neutral').length;
		const detractors = analyzed.filter((c) => c.analysis?.sentiment === 'detractor').length;
		const skippedDeleted = flat.filter((c) => c.deleted).length;
		const skippedDead = flat.filter((c) => c.dead).length;
		const skippedEmpty = flat.filter((c) => !c.text && !c.deleted && !c.dead).length;
		const skippedTotal = skippedDeleted + skippedDead + skippedEmpty;

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

		return {
			total: flat.length,
			analyzable: analyzable.length,
			analyzed: analyzed.length,
			promoters,
			neutrals,
			detractors,
			skippedTotal,
			skippedDeleted,
			skippedDead,
			skippedEmpty,
			topKeywords
		};
	});

	function pct(n: number) {
		return stats.analyzed > 0 ? Math.round((n / stats.analyzed) * 100) : 0;
	}

	// NPS-style score: % promoters - % detractors (-100 to +100)
	let nps = $derived(pct(stats.promoters) - pct(stats.detractors));

	// Color based on NPS score
	let npsColor = $derived.by(() => {
		if (nps >= 50) return 'text-green-600 dark:text-green-400';
		if (nps >= 0) return 'text-lime-600 dark:text-lime-400';
		if (nps >= -50) return 'text-orange-600 dark:text-orange-400';
		return 'text-red-600 dark:text-red-400';
	});

	let npsLabel = $derived.by(() => {
		if (nps >= 50) return 'Very Positive';
		if (nps >= 20) return 'Positive';
		if (nps >= 0) return 'Mixed-Positive';
		if (nps >= -20) return 'Mixed-Negative';
		if (nps >= -50) return 'Negative';
		return 'Very Negative';
	});

	let skippedBreakdown = $derived.by(() => {
		const parts: string[] = [];
		if (stats.skippedDeleted > 0) parts.push(`${stats.skippedDeleted} deleted`);
		if (stats.skippedDead > 0) parts.push(`${stats.skippedDead} dead`);
		if (stats.skippedEmpty > 0) parts.push(`${stats.skippedEmpty} empty`);
		return parts.join(', ');
	});
</script>

<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4 transition-opacity {analyzing ? 'opacity-70' : 'opacity-100'}">
	<div>
		<h2 class="text-lg font-semibold">{post.title}</h2>
		<p class="text-sm text-gray-600 dark:text-gray-400">
			{post.score} points by {post.author} | {stats.total} comments
		</p>
		{#if analysisModel}
			<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
				Model: {analysisModel}
			</p>
		{/if}
	</div>

		{#if stats.analyzed > 0}
			{#if sentimentQuestion}
				<p class="text-sm italic text-gray-600 dark:text-gray-400">{sentimentQuestion}</p>
			{/if}

			<!-- NPS Score -->
			<div class="flex items-center gap-4">
			<div class="flex-shrink-0">
				<div class="text-4xl font-bold {npsColor}">{nps > 0 ? '+' : ''}{nps}</div>
				<div class="text-sm text-gray-500 dark:text-gray-400">Sentiment Score</div>
			</div>
			<div class="flex-1">
				<div class="text-sm font-medium {npsColor}">{npsLabel}</div>
				<div class="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
					<!-- Scale: -100 to +100, so 0 is at 50% -->
					<div
						class="h-full transition-all duration-300"
						style="width: {Math.abs(nps) / 2}%; margin-left: {nps >= 0 ? 50 : 50 - Math.abs(nps) / 2}%; background: {nps >= 0 ? '#22c55e' : '#ef4444'};"
					></div>
				</div>
				<div class="flex justify-between text-xs text-gray-400 mt-0.5">
					<span>-100</span>
					<span>0</span>
					<span>+100</span>
				</div>
			</div>
			<div class="text-sm text-gray-500 dark:text-gray-400 text-right">
				<div>{stats.analyzed} of {stats.analyzable}</div>
				{#if stats.skippedTotal > 0}
					<div class="text-xs">
						{stats.skippedTotal} skipped ({skippedBreakdown})
					</div>
				{/if}
			</div>
		</div>

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

		<div>
			<h3 class="text-sm font-medium mb-1">Thread Summary</h3>
			{#if generatingThreadSummary}
				<p class="text-sm text-gray-500 dark:text-gray-400 italic">Generating top-level summary...</p>
			{:else if threadSummary}
				<p class="text-sm text-gray-700 dark:text-gray-300">{threadSummary}</p>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">Summary will appear after analysis completes.</p>
			{/if}
		</div>

		{#if stats.topKeywords.length > 0}
			<div>
				<h3 class="text-sm font-medium mb-2">Top Keywords</h3>
				<div class="flex flex-wrap gap-2">
					{#each stats.topKeywords as [kw, count]}
						<button
							type="button"
							class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
							onclick={() => onKeywordClick?.(kw)}
						>
							{kw} ({count})
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		<p class="text-sm text-gray-500">No analysis yet. Configure your API key and run analysis.</p>
	{/if}
</div>
