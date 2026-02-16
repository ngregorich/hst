<script lang="ts">
	import type { Comment, Sentiment } from '$lib/schema';
	import { flattenComments } from '$lib/hn';

	interface Props {
		comments: Comment[];
		highlightedKeyword?: string | null;
		expandedKeywordsState?: string[];
		onExpandedKeywordsChange?: (keywords: string[]) => void;
		onCommentJump?: (commentId: number, keyword: string) => void;
	}

	let {
		comments,
		highlightedKeyword = null,
		expandedKeywordsState = [],
		onExpandedKeywordsChange,
		onCommentJump
	}: Props = $props();

	let disabledKeywords = $state(new Set<string>());
	let expandedKeywords = $state(new Set<string>());
	let sortBy = $state<'keyword' | 'total' | 'promoter' | 'neutral' | 'detractor'>('total');
	let sortAsc = $state(false);

	interface KeywordStats {
		keyword: string;
		total: number;
		promoter: number;
		neutral: number;
		detractor: number;
	}

	interface KeywordCommentHit {
		id: number;
		author: string;
		time: number;
		sentiment?: Sentiment;
		summary: string;
		snippet: string;
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

	let commentsByKeyword = $derived.by(() => {
		const flat = flattenComments(comments).filter((c) => c.analysis && !c.deleted && !c.dead);
		const map = new Map<string, KeywordCommentHit[]>();

		for (const c of flat) {
			const seen = new Set<string>();
			for (const kw of c.analysis!.keywords) {
				const lower = kw.toLowerCase();
				if (seen.has(lower)) continue;
				seen.add(lower);
				if (!map.has(lower)) map.set(lower, []);
				map.get(lower)!.push({
					id: c.id,
					author: c.author,
					time: c.time,
					sentiment: c.analysis?.sentiment,
					summary: c.analysis?.summary ?? '',
					snippet: commentSnippet(c.text)
				});
			}
		}

		for (const list of map.values()) {
			list.sort((a, b) => a.time - b.time);
		}

		return map;
	});

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
			expandedKeywords.delete(kw);
		} else {
			disabledKeywords.add(kw);
			expandedKeywords.delete(kw);
		}
		disabledKeywords = new Set(disabledKeywords);
		expandedKeywords = new Set(expandedKeywords);
		onExpandedKeywordsChange?.([...expandedKeywords]);
	}

	function keywordElementId(kw: string): string {
		return `keyword-${encodeURIComponent(kw)}`;
	}

	function toggleExpanded(kw: string) {
		if (expandedKeywords.has(kw)) {
			expandedKeywords.delete(kw);
		} else {
			expandedKeywords.add(kw);
		}
		expandedKeywords = new Set(expandedKeywords);
		onExpandedKeywordsChange?.([...expandedKeywords]);
	}

	function sentimentToneClass(sentiment?: Sentiment): string {
		switch (sentiment) {
			case 'promoter':
				return 'text-green-600 dark:text-green-400';
			case 'detractor':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	}

	function formatTime(unix: number): string {
		return new Date(unix * 1000).toLocaleString();
	}

	function commentSnippet(text: string): string {
		return text
			.replace(/<[^>]*>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 220);
	}

	function keywordHits(keyword: string): KeywordCommentHit[] {
		return commentsByKeyword.get(keyword) || [];
	}

	$effect(() => {
		expandedKeywords = new Set(expandedKeywordsState.map((k) => k.toLowerCase()));
	});

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
						class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer {highlightedKeyword === stat.keyword ? 'bg-yellow-100 dark:bg-yellow-900/30 ring-1 ring-yellow-400' : ''}"
						onclick={() => toggleExpanded(stat.keyword)}
					>
						<td class="py-2 px-2">
							<div class="flex items-center gap-2">
								<button
									onclick={(e) => {
										e.stopPropagation();
										toggleExpanded(stat.keyword);
									}}
									class="w-4 text-gray-500"
									aria-label={expandedKeywords.has(stat.keyword) ? 'Collapse keyword comments' : 'Expand keyword comments'}
									title={expandedKeywords.has(stat.keyword) ? 'Collapse' : 'Expand'}
								>
									{expandedKeywords.has(stat.keyword) ? '▾' : '▸'}
								</button>
								<span>{stat.keyword}</span>
							</div>
						</td>
						<td class="text-right py-2 px-2">{stat.total}</td>
						<td class="text-right py-2 px-2 text-green-600 dark:text-green-400">{stat.promoter}</td>
						<td class="text-right py-2 px-2 text-gray-600 dark:text-gray-400">{stat.neutral}</td>
						<td class="text-right py-2 px-2 text-red-600 dark:text-red-400">{stat.detractor}</td>
						<td class="py-2 px-2">
							<button
								onclick={(e) => {
									e.stopPropagation();
									toggleKeyword(stat.keyword);
								}}
								class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
								title="Hide keyword"
							>
								&times;
							</button>
						</td>
					</tr>
					{#if expandedKeywords.has(stat.keyword)}
						<tr class="border-b border-gray-100 dark:border-gray-800">
							<td colspan="6" class="px-3 py-2 bg-gray-50/60 dark:bg-gray-900/30">
								{#if keywordHits(stat.keyword).length === 0}
									<div class="text-xs text-gray-500">No matching comments.</div>
								{:else}
									<div class="space-y-2">
										{#each keywordHits(stat.keyword) as hit}
											<div class="rounded border border-gray-200 dark:border-gray-700 p-2">
												<div class="flex flex-wrap gap-x-3 gap-y-1 items-center text-xs">
													<button
														class="text-orange-600 dark:text-orange-400 hover:underline"
														onclick={() => onCommentJump?.(hit.id, stat.keyword)}
													>
														Open comment #{hit.id}
													</button>
													<span class="text-gray-700 dark:text-gray-300 font-medium">{hit.author}</span>
													<span class="text-gray-500">{formatTime(hit.time)}</span>
													<span class={sentimentToneClass(hit.sentiment)}>{hit.sentiment ?? 'unlabeled'}</span>
												</div>
												{#if hit.summary}
													<p class="mt-1 text-xs text-gray-600 dark:text-gray-300 italic">{hit.summary}</p>
												{/if}
												{#if hit.snippet}
													<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{hit.snippet}{hit.snippet.length >= 220 ? '…' : ''}</p>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</td>
						</tr>
					{/if}
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
