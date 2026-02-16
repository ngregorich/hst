<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import InputPanel from '$lib/components/InputPanel.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import Dashboard from '$lib/components/Dashboard.svelte';
	import TreeView from '$lib/components/TreeView.svelte';
	import ThreadView from '$lib/components/ThreadView.svelte';
	import KeywordsTable from '$lib/components/KeywordsTable.svelte';
	import { parsePostId, fetchPost, fetchComments, generateSentimentQuestion } from '$lib/hn';
	import { analyzeCommentsBatch } from '$lib/openrouter';
	import { loadPrefs, savePrefs, saveAnalysis, loadAnalysis, exportToFile, importFromFile, type Preferences } from '$lib/storage';
	import { estimateTokens, formatCost, formatTokens } from '$lib/tokens';
	import { DEFAULT_MODEL, SCHEMA_VERSION, type Comment, type HNPost, type AnalysisExport } from '$lib/schema';

	// Example loading
	async function loadExample() {
		try {
			const res = await fetch('/examples/example-thread.json');
			const data: AnalysisExport = await res.json();
			post = data.post;
			comments = data.comments;
			sentimentQuestion = data.sentimentQuestion;
			if (data.model) prefs.model = data.model;
		} catch (e) {
			error = 'Failed to load example';
		}
	}

	// State
	let prefs = $state<Preferences>(loadPrefs());
	let postInput = $state('');
	let post = $state<HNPost | null>(null);
	let comments = $state<Comment[]>([]);
	let sentimentQuestion = $state('');
	let selectedId = $state<number | null>(null);
	let activeTab = $state<'analysis' | 'keywords'>('analysis');

	// Loading states
	let loadingPost = $state(false);
	let fetchProgress = $state<{ done: number; total: number } | null>(null);
	let analyzing = $state(false);
	let analyzeProgress = $state<{ done: number; total: number } | null>(null);
	let error = $state('');

	// Derived
	let tokenEstimate = $derived(comments.length > 0 ? estimateTokens(comments, prefs.model) : null);

	// Load from URL param on mount
	onMount(async () => {
		const postParam = $page.url.searchParams.get('post');
		if (postParam) {
			postInput = postParam;
			await loadPost();
		}
	});

	// Save prefs when they change
	$effect(() => {
		savePrefs(prefs);
	});

	async function loadPost() {
		error = '';
		const id = parsePostId(postInput);
		if (!id) {
			error = 'Invalid HN URL or post ID';
			return;
		}

		// Check for cached analysis first
		const cached = await loadAnalysis(id);
		if (cached) {
			post = cached.post;
			comments = cached.comments;
			sentimentQuestion = cached.sentimentQuestion;
			// Update URL
			goto(`?post=${id}`, { replaceState: true });
			return;
		}

		loadingPost = true;
		fetchProgress = { done: 0, total: 0 };

		try {
			const fetchedPost = await fetchPost(id);
			if (!fetchedPost) {
				error = 'Post not found';
				return;
			}
			post = fetchedPost;
			sentimentQuestion = generateSentimentQuestion(post.title);

			comments = await fetchComments(id, (done, total) => {
				fetchProgress = { done, total };
			});

			// Update URL
			goto(`?post=${id}`, { replaceState: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load post';
		} finally {
			loadingPost = false;
			fetchProgress = null;
		}
	}

	async function runAnalysis() {
		if (!prefs.apiKey) {
			error = 'Please enter your OpenRouter API key';
			return;
		}
		if (!post || comments.length === 0) return;

		error = '';
		analyzing = true;
		analyzeProgress = { done: 0, total: 0 };

		try {
			await analyzeCommentsBatch(
				prefs.apiKey,
				prefs.model,
				sentimentQuestion,
				comments,
				5, // batch size
				(done, total) => {
					analyzeProgress = { done, total };
				}
			);

			// Save to IndexedDB
			const exportData = buildExport();
			const result = await saveAnalysis(exportData);
			if (!result.ok) {
				console.warn('Failed to save analysis:', result.error);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Analysis failed';
		} finally {
			analyzing = false;
			analyzeProgress = null;
		}
	}

	function buildExport(): AnalysisExport {
		return {
			version: SCHEMA_VERSION,
			hnPostId: post!.id,
			hnPostUrl: `https://news.ycombinator.com/item?id=${post!.id}`,
			title: post!.title,
			sentimentQuestion,
			model: prefs.model,
			analyzedAt: new Date().toISOString(),
			post: post!,
			comments
		};
	}

	function handleExport() {
		if (!post) return;
		exportToFile(buildExport());
	}

	async function handleImport(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const data = await importFromFile(file);
			post = data.post;
			comments = data.comments;
			sentimentQuestion = data.sentimentQuestion;
			if (data.model) prefs.model = data.model;
			goto(`?post=${data.hnPostId}`, { replaceState: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Import failed';
		}
		input.value = '';
	}

	function selectComment(id: number) {
		selectedId = id;
		// Scroll to comment in thread view
		const el = document.getElementById(`comment-${id}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<InputPanel
		bind:postInput
		bind:apiKey={prefs.apiKey}
		bind:model={prefs.model}
		onLoad={loadPost}
		loading={loadingPost}
	/>

	{#if error}
		<div class="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200">
			{error}
		</div>
	{/if}

	{#if fetchProgress}
		<ProgressBar done={fetchProgress.done} total={fetchProgress.total} label="Fetching comments" />
	{/if}

	{#if !post && !loadingPost}
		<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center space-y-4">
			<h2 class="text-lg font-medium">Analyze sentiment in Hacker News threads</h2>
			<p class="text-gray-600 dark:text-gray-400">
				Paste an HN URL or post ID above, or try an example to see how it works.
			</p>
			<button
				onclick={loadExample}
				class="px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
			>
				Load Example
			</button>
		</div>
	{/if}

	{#if post}
		<Dashboard {post} {comments} />

		<div class="space-y-4">
			<div>
				<label for="sentiment-q" class="block text-sm font-medium mb-1">Sentiment Question</label>
				<input
					id="sentiment-q"
					type="text"
					bind:value={sentimentQuestion}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
				/>
			</div>

			{#if tokenEstimate}
				<div class="text-sm text-gray-600 dark:text-gray-400">
					Estimated: {formatTokens(tokenEstimate.totalTokens)} tokens ({tokenEstimate.commentCount} comments) &middot; {formatCost(tokenEstimate.estimatedCost)}
				</div>
			{/if}

			<div class="flex gap-2 flex-wrap">
				<button
					onclick={runAnalysis}
					disabled={analyzing || !prefs.apiKey}
					class="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{analyzing ? 'Analyzing...' : 'Run Analysis'}
				</button>
				<button
					onclick={handleExport}
					class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
				>
					Export JSON
				</button>
				<label class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
					Import JSON
					<input type="file" accept=".json" class="hidden" onchange={handleImport} />
				</label>
			</div>
		</div>

		{#if analyzeProgress}
			<ProgressBar done={analyzeProgress.done} total={analyzeProgress.total} label="Analyzing comments" />
		{/if}

		<!-- Tabs -->
		<div class="border-b border-gray-200 dark:border-gray-700">
			<nav class="flex gap-4">
				<button
					onclick={() => activeTab = 'analysis'}
					class="py-2 px-1 border-b-2 {activeTab === 'analysis' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent hover:border-gray-300'}"
				>
					Analysis
				</button>
				<button
					onclick={() => activeTab = 'keywords'}
					class="py-2 px-1 border-b-2 {activeTab === 'keywords' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent hover:border-gray-300'}"
				>
					Keywords
				</button>
			</nav>
		</div>

		<!-- Display toggles -->
		{#if activeTab === 'analysis'}
			<div class="flex gap-4 text-sm">
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={prefs.showSentiment} class="rounded" />
					Sentiment
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={prefs.showSummary} class="rounded" />
					Summary
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={prefs.showKeywords} class="rounded" />
					Keywords
				</label>
			</div>
		{/if}

		{#if activeTab === 'analysis'}
			<div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
				<div class="border border-gray-200 dark:border-gray-700 rounded p-4 overflow-auto max-h-[600px]">
					<h3 class="text-sm font-medium mb-3">Comment Tree</h3>
					<TreeView {comments} {selectedId} onSelect={selectComment} />
				</div>
				<div class="overflow-auto max-h-[600px]">
					<ThreadView
						{comments}
						{selectedId}
						showSummary={prefs.showSummary}
						showKeywords={prefs.showKeywords}
						showSentiment={prefs.showSentiment}
						onSelect={selectComment}
					/>
				</div>
			</div>
		{:else}
			<KeywordsTable {comments} />
		{/if}
	{/if}
</div>
