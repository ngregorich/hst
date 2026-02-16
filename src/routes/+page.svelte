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
	import SplitPane from '$lib/components/SplitPane.svelte';
	import { parsePostId, fetchPost, fetchComments, generateSentimentQuestion as generateBasicQuestion } from '$lib/hn';
	import { analyzeCommentsBatch, generateSentimentQuestion as generateAIQuestion } from '$lib/openrouter';
	import { loadPrefs, savePrefs, saveAnalysis, loadAnalysis, loadAnyAnalysis, exportToFile, importFromFile, cacheHNData, getCachedHNData, type Preferences } from '$lib/storage';
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
	let discoveredComments = $state<number | null>(null);
	let analyzing = $state(false);
	let analyzeProgress = $state<{ done: number; total: number } | null>(null);
	let generatingQuestion = $state(false);
	let error = $state('');

	// Analysis tracking
	let lastAnalysisModel = $state<string | null>(null);
	let lastAnalysisQuestion = $state<string | null>(null);
	let abortController = $state<AbortController | null>(null);

	// Derived: check if analysis is stale (settings changed since last run)
	let analysisStale = $derived(
		lastAnalysisModel !== null &&
		(lastAnalysisModel !== prefs.model || lastAnalysisQuestion !== sentimentQuestion)
	);
	let hasAnalysis = $derived(
		comments.some(c => c.analysis || c.children.some(cc => cc.analysis))
	);

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

		// Check for cached analysis first (has sentiment data)
		// Try current model first, then any cached analysis
		let cachedAnalysis = await loadAnalysis(id, prefs.model);
		if (!cachedAnalysis) {
			cachedAnalysis = await loadAnyAnalysis(id);
		}
		if (cachedAnalysis) {
			post = cachedAnalysis.post;
			comments = cachedAnalysis.comments;
			sentimentQuestion = cachedAnalysis.sentimentQuestion;
			// Track the model/question that was used for this analysis
			lastAnalysisModel = cachedAnalysis.model;
			lastAnalysisQuestion = cachedAnalysis.sentimentQuestion;
			if (cachedAnalysis.model) prefs.model = cachedAnalysis.model;
			goto(`?post=${id}`, { replaceState: true });
			return;
		}

		// Check for cached HN data (no analysis yet)
		const cachedHN = await getCachedHNData(id);
		if (cachedHN) {
			post = cachedHN.post;
			comments = cachedHN.comments;
			sentimentQuestion = generateBasicQuestion(post.title);
			goto(`?post=${id}`, { replaceState: true });
			return;
		}

		loadingPost = true;
		discoveredComments = 0;

		try {
			const fetchedPost = await fetchPost(id);
			if (!fetchedPost) {
				error = 'Post not found';
				return;
			}
			post = fetchedPost;
			sentimentQuestion = generateBasicQuestion(post.title);

			comments = await fetchComments(id, (count) => {
				discoveredComments = count;
			});

			// Cache fetched data (snapshot to strip Svelte proxies)
			await cacheHNData(id, $state.snapshot(post), $state.snapshot(comments));

			goto(`?post=${id}`, { replaceState: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load post';
		} finally {
			loadingPost = false;
			discoveredComments = null;
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
		abortController = new AbortController();

		try {
			await analyzeCommentsBatch(
				prefs.apiKey,
				prefs.model,
				sentimentQuestion,
				comments,
				5, // batch size
				(done, total) => {
					analyzeProgress = { done, total };
				},
				abortController.signal
			);

			// Track what settings were used
			lastAnalysisModel = prefs.model;
			lastAnalysisQuestion = sentimentQuestion;

			// Save to IndexedDB
			const exportData = buildExport();
			const result = await saveAnalysis(exportData);
			if (!result.ok) {
				console.warn('Failed to save analysis:', result.error);
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') {
				error = 'Analysis stopped';
			} else {
				error = e instanceof Error ? e.message : 'Analysis failed';
			}
		} finally {
			analyzing = false;
			analyzeProgress = null;
			abortController = null;
		}
	}

	function stopAnalysis() {
		abortController?.abort();
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
			post: $state.snapshot(post!),
			comments: $state.snapshot(comments)
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

	async function generateQuestion() {
		if (!prefs.apiKey || !post) return;
		error = '';
		generatingQuestion = true;
		try {
			sentimentQuestion = await generateAIQuestion(prefs.apiKey, prefs.model, post, comments);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to generate question';
		} finally {
			generatingQuestion = false;
		}
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

	{#if discoveredComments !== null}
		<div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
			<div class="h-2 w-32 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
				<div class="h-full bg-orange-500 animate-pulse" style="width: 100%"></div>
			</div>
			<span>Discovering comments... {discoveredComments} found</span>
		</div>
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
				<textarea
					id="sentiment-q"
					bind:value={sentimentQuestion}
					rows="2"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y min-h-[2.5rem]"
				></textarea>
				<button
					onclick={generateQuestion}
					disabled={generatingQuestion || !prefs.apiKey}
					class="mt-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
					title={!prefs.apiKey ? 'Enter API key first' : 'Generate a better question using AI'}
				>
					{generatingQuestion ? 'Generating...' : 'Generate with AI'}
				</button>
			</div>

			{#if tokenEstimate}
				<div class="text-sm text-gray-600 dark:text-gray-400">
					Estimated: {formatTokens(tokenEstimate.totalTokens)} tokens ({tokenEstimate.commentCount} comments) &middot; {formatCost(tokenEstimate.estimatedCost)}
				</div>
			{/if}

			<div class="flex gap-2 flex-wrap items-center">
				<button
					onclick={runAnalysis}
					disabled={analyzing || !prefs.apiKey}
					class="px-4 py-2 text-white rounded disabled:cursor-not-allowed transition-colors {hasAnalysis && !analysisStale ? 'bg-orange-400 hover:bg-orange-500' : 'bg-orange-600 hover:bg-orange-700'} {!prefs.apiKey ? 'opacity-50' : ''}"
					title={hasAnalysis && !analysisStale ? 'Analysis up to date (change model or question to re-run)' : ''}
				>
					{analyzing ? 'Analyzing...' : hasAnalysis && !analysisStale ? 'Re-run Analysis' : 'Run Analysis'}
				</button>
				{#if analyzing}
					<button
						onclick={stopAnalysis}
						class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
					>
						Stop
					</button>
				{/if}
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
				{#if lastAnalysisModel}
					<span class="text-xs text-gray-500 dark:text-gray-400">
						Last run: {lastAnalysisModel}
					</span>
				{/if}
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
			<div class="flex gap-4 text-sm flex-wrap">
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={prefs.showCommentText} class="rounded" />
					Comment
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={prefs.showAuthor} class="rounded" />
					Author
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={prefs.showTime} class="rounded" />
					Time
				</label>
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
			<SplitPane initialWidth={200} minWidth={80} maxWidth={400}>
				{#snippet left()}
					<div class="border border-gray-200 dark:border-gray-700 rounded p-3 mr-1 overflow-x-auto">
						<h3 class="text-sm font-medium mb-2">Comment Tree</h3>
						<TreeView {comments} {selectedId} onSelect={selectComment} />
					</div>
				{/snippet}
				{#snippet right()}
					<div class="pl-2">
						<ThreadView
							{comments}
							{selectedId}
							{analyzing}
							showCommentText={prefs.showCommentText}
							showAuthor={prefs.showAuthor}
							showTime={prefs.showTime}
							showSummary={prefs.showSummary}
							showKeywords={prefs.showKeywords}
							showSentiment={prefs.showSentiment}
							onSelect={selectComment}
						/>
					</div>
				{/snippet}
			</SplitPane>
		{:else}
			<KeywordsTable {comments} />
		{/if}
	{/if}
</div>
