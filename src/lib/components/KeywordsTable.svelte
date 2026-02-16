<script lang="ts">
	import type { Comment, Sentiment } from '$lib/schema';
	import { flattenComments } from '$lib/hn';

	interface Props {
		comments: Comment[];
		highlightedKeyword?: string | null;
	}

	let { comments, highlightedKeyword = null }: Props = $props();

	let disabledKeywords = $state(new Set<string>());
	let sortBy = $state<'keyword' | 'total' | 'promoter' | 'neutral' | 'detractor'>('total');
	let sortAsc = $state(false);

	interface KeywordStats {
		keyword: string;
		total: number;
		promoter: number;
		neutral: number;
		detractor: number;
	}

	let keywordStats = $derived.by(() => {
		const flat = flattenComments(comments).filter((c) => c.analysis);
		const stats = new Map<string, KeywordStats>();

		for (const c of flat) {
			const sentiment = c.analysis!.sentiment;
			for (const kw of c.analysis!.keywords) {
				const lower = kw.toLowerCase();
				if (!stats.has(lower)) {
					stats.set(lower, { keyword: lower, total: 0, promoter: 0, neutral: 0, detractor: 0 });
				}
				const s = stats.get(lower)!;
				s.total++;
				s[sentiment]++;
			}
		}

		return [...stats.values()];
	});

	let sortedEnabled = $derived.by(() => {
		const enabled = keywordStats.filter((s) => !disabledKeywords.has(s.keyword));
		enabled.sort((a, b) => {
			const av = sortBy === 'keyword' ? a.keyword : a[sortBy];
			const bv = sortBy === 'keyword' ? b.keyword : b[sortBy];
			if (av < bv) return sortAsc ? -1 : 1;
			if (av > bv) return sortAsc ? 1 : -1;
			return 0;
		});
		return enabled;
	});

	let sortedDisabled = $derived(keywordStats.filter((s) => disabledKeywords.has(s.keyword)));

	function toggleSort(col: typeof sortBy) {
		if (sortBy === col) {
			sortAsc = !sortAsc;
		} else {
			sortBy = col;
			sortAsc = col === 'keyword';
		}
	}

	function toggleKeyword(kw: string) {
		if (disabledKeywords.has(kw)) {
			disabledKeywords.delete(kw);
		} else {
			disabledKeywords.add(kw);
		}
		disabledKeywords = new Set(disabledKeywords);
	}

	function keywordElementId(kw: string): string {
		return `keyword-${encodeURIComponent(kw)}`;
	}

	$effect(() => {
		if (!highlightedKeyword) return;
		requestAnimationFrame(() => {
			const el = document.getElementById(keywordElementId(highlightedKeyword));
			el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	});
</script>

<div class="space-y-6">
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-gray-200 dark:border-gray-700">
					<th class="text-left py-2 px-2">
						<button onclick={() => toggleSort('keyword')} class="font-medium hover:text-orange-600">
							Keyword {sortBy === 'keyword' ? (sortAsc ? '↑' : '↓') : ''}
						</button>
					</th>
					<th class="text-right py-2 px-2">
						<button onclick={() => toggleSort('total')} class="font-medium hover:text-orange-600">
							Total {sortBy === 'total' ? (sortAsc ? '↑' : '↓') : ''}
						</button>
					</th>
					<th class="text-right py-2 px-2">
						<button onclick={() => toggleSort('promoter')} class="font-medium hover:text-orange-600 text-green-600 dark:text-green-400">
							Promoter {sortBy === 'promoter' ? (sortAsc ? '↑' : '↓') : ''}
						</button>
					</th>
					<th class="text-right py-2 px-2">
						<button onclick={() => toggleSort('neutral')} class="font-medium hover:text-orange-600 text-gray-600 dark:text-gray-400">
							Neutral {sortBy === 'neutral' ? (sortAsc ? '↑' : '↓') : ''}
						</button>
					</th>
					<th class="text-right py-2 px-2">
						<button onclick={() => toggleSort('detractor')} class="font-medium hover:text-orange-600 text-red-600 dark:text-red-400">
							Detractor {sortBy === 'detractor' ? (sortAsc ? '↑' : '↓') : ''}
						</button>
					</th>
					<th class="py-2 px-2"></th>
				</tr>
			</thead>
			<tbody>
				{#each sortedEnabled as stat}
					<tr
						id={keywordElementId(stat.keyword)}
						class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 {highlightedKeyword === stat.keyword ? 'bg-yellow-100 dark:bg-yellow-900/30 ring-1 ring-yellow-400' : ''}"
					>
						<td class="py-2 px-2">{stat.keyword}</td>
						<td class="text-right py-2 px-2">{stat.total}</td>
						<td class="text-right py-2 px-2 text-green-600 dark:text-green-400">{stat.promoter}</td>
						<td class="text-right py-2 px-2 text-gray-600 dark:text-gray-400">{stat.neutral}</td>
						<td class="text-right py-2 px-2 text-red-600 dark:text-red-400">{stat.detractor}</td>
						<td class="py-2 px-2">
							<button
								onclick={() => toggleKeyword(stat.keyword)}
								class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
								title="Hide keyword"
							>
								&times;
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if sortedDisabled.length > 0}
		<div>
			<h3 class="text-sm font-medium text-gray-500 mb-2">Hidden Keywords</h3>
			<div class="flex flex-wrap gap-2">
				{#each sortedDisabled as stat}
					<button
						id={keywordElementId(stat.keyword)}
						onclick={() => toggleKeyword(stat.keyword)}
						class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-700 {highlightedKeyword === stat.keyword ? 'ring-1 ring-yellow-400 bg-yellow-100 dark:bg-yellow-900/30' : ''}"
					>
						{stat.keyword} ({stat.total}) +
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
