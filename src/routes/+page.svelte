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
	import { parsePostId, fetchPost, fetchComments, flattenComments, sortCommentsTree, generateSentimentQuestion as generateBasicQuestion } from '$lib/hn';
	import { analyzeCommentsBatch, generateSentimentQuestion as generateAIQuestion, generateThreadSummary, type ThreadSummaryInput, type OpenRouterDebugEvent } from '$lib/openrouter';
	import { loadPrefs, savePrefs, saveAnalysis, loadAnalysis, loadAnyAnalysis, listAnalysisModels, exportToFile, importFromFile, cacheHNData, getCachedHNData, type Preferences } from '$lib/storage';
	import { estimateTokens, formatCost, formatTokens } from '$lib/tokens';
	import { DEFAULT_MODEL, SCHEMA_VERSION, type Comment, type HNPost, type AnalysisExport } from '$lib/schema';

	const STARTUP_ANALYSIS_PATH = '/examples/startup-analysis.json';

	// State
	let prefs = $state<Preferences>(loadPrefs());
	let postInput = $state('');
	let post = $state<HNPost | null>(null);
	let comments = $state<Comment[]>([]);
	let sentimentQuestion = $state('');
	let selectedId = $state<number | null>(null);
	let activeTab = $state<'analysis' | 'keywords'>('analysis');
	let highlightedKeyword = $state<string | null>(null);
	let expandedKeywordRows = $state<string[]>([]);
	let returnKeyword = $state<string | null>(null);
	let lastSeenModel = $state(prefs.model);
	let threadSummary = $state('');
	let generatingThreadSummary = $state(false);
	let availableAnalysisModels = $state<string[]>([]);
	let suppressModelChangeReset = $state(false);
	let apiDebug = $state({
		question: null as OpenRouterDebugEvent | null,
		threadSummary: null as OpenRouterDebugEvent | null,
		comment: {
			requests: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			truncated: 0,
			finishReasons: {} as Record<string, number>,
			last: null as OpenRouterDebugEvent | null
		}
	});

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
	let displayedComments = $derived(sortCommentsTree(comments, prefs.sortMode));
	let navIndex = $derived.by(() => {
		const flat = flattenComments(displayedComments);
		const flatIds = flat.map((c) => c.id);
		const positionById = new Map<number, number>();
		const childrenById = new Map<number, number[]>();
		const parentById = new Map<number, number | null>();

		for (const c of flat) {
			childrenById.set(c.id, c.children.map((cc) => cc.id));
			parentById.set(c.id, c.parentId);
		}
		for (let i = 0; i < flatIds.length; i++) {
			positionById.set(flatIds[i], i);
		}

		return { flatIds, positionById, childrenById, parentById };
	});

	// Derived
	let tokenEstimate = $derived(comments.length > 0 ? estimateTokens(comments, prefs.model) : null);

	// Load from URL param on mount + enable global keyboard navigation
	onMount(() => {
		window.addEventListener('keydown', handleGlobalKeydown);
		(async () => {
			const postParam = $page.url.searchParams.get('post');
			if (postParam) {
				postInput = postParam;
				await loadPost();
				return;
			}
			await loadStartupAnalysis();
		})();

		return () => {
			window.removeEventListener('keydown', handleGlobalKeydown);
		};
	});

	$effect(() => {
		if (comments.length === 0) {
			selectedId = null;
			return;
		}
		if (selectedId === null || !navIndex.positionById.has(selectedId)) {
			selectComment(displayedComments[0].id);
		}
	});

	// Auto-load when post input changes (debounced), but only for valid IDs/URLs.
	$effect(() => {
		const raw = postInput.trim();
		if (!raw) return;
		if (loadingPost) return;

		const timer = setTimeout(() => {
			const parsedId = parsePostId(raw);
			if (!parsedId) return;
			if (post?.id === parsedId) return;
			loadPost();
		}, 450);

		return () => clearTimeout(timer);
	});

	// Save prefs when they change
	$effect(() => {
		savePrefs(prefs);
	});

	function clearCommentAnalysis(list: Comment[]): Comment[] {
		return list.map((c) => ({
			...c,
			analysis: undefined,
			children: clearCommentAnalysis(c.children)
		}));
	}

	function resetThreadUiState() {
		comments = [];
		sentimentQuestion = '';
		selectedId = null;
		activeTab = 'analysis';
		highlightedKeyword = null;
		expandedKeywordRows = [];
		returnKeyword = null;
		threadSummary = '';
		generatingThreadSummary = false;
		availableAnalysisModels = [];
		lastAnalysisModel = null;
		lastAnalysisQuestion = null;
		analyzeProgress = null;
		discoveredComments = null;
		apiDebug = {
			question: null,
			threadSummary: null,
			comment: {
				requests: 0,
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
				truncated: 0,
				finishReasons: {},
				last: null
			}
		};
	}

	function handleApiDebug(event: OpenRouterDebugEvent) {
		if (event.operation === 'question') {
			apiDebug.question = event;
			return;
		}
		if (event.operation === 'thread_summary') {
			apiDebug.threadSummary = event;
			return;
		}

		const reason = event.finishReason || 'unknown';
		apiDebug.comment.requests += 1;
		apiDebug.comment.inputTokens += event.inputTokens;
		apiDebug.comment.outputTokens += event.outputTokens;
		apiDebug.comment.totalTokens += event.totalTokens;
		if (event.truncated) apiDebug.comment.truncated += 1;
		apiDebug.comment.finishReasons[reason] = (apiDebug.comment.finishReasons[reason] || 0) + 1;
		apiDebug.comment.last = event;
	}

	let commentFinishReasonsText = $derived.by(() => {
		const entries = Object.entries(apiDebug.comment.finishReasons).sort((a, b) => b[1] - a[1]);
		if (entries.length === 0) return 'none yet';
		return entries.map(([reason, count]) => `${reason}: ${count}`).join(', ');
	});

	async function applyImportedAnalysis(data: AnalysisExport): Promise<void> {
		post = data.post;
		comments = data.comments;
		postInput = String(data.hnPostId);
		expandedKeywordRows = [];
		returnKeyword = null;
		threadSummary = data.threadSummary || '';
		generatingThreadSummary = false;
		sentimentQuestion = data.sentimentQuestion;
		lastAnalysisModel = data.model || null;
		lastAnalysisQuestion = data.sentimentQuestion || null;
		if (data.model && data.model !== prefs.model) {
			suppressModelChangeReset = true;
			prefs.model = data.model;
		}
		availableAnalysisModels = await listAnalysisModels(data.hnPostId);
		goto(`?post=${data.hnPostId}`, { replaceState: true });
	}

	async function fetchStartupAnalysisData(): Promise<AnalysisExport | null> {
		try {
			const res = await fetch(STARTUP_ANALYSIS_PATH, { cache: 'no-store' });
			if (!res.ok) return null;
			const data: AnalysisExport = await res.json();
			if (!data?.hnPostId || !data?.post || !Array.isArray(data?.comments)) return null;
			return data;
		} catch {
			return null;
		}
	}

	async function loadStartupAnalysis() {
		const data = await fetchStartupAnalysisData();
		if (!data) return;
		await applyImportedAnalysis(data);
	}

	// If model changes while analysis data is shown, clear old results so rerun starts from a clean slate.
	$effect(() => {
		const currentModel = prefs.model;
		if (currentModel === lastSeenModel) return;
		if (suppressModelChangeReset) {
			lastSeenModel = currentModel;
			suppressModelChangeReset = false;
			return;
		}
		lastSeenModel = currentModel;

		if (!post || comments.length === 0) return;
		if (!flattenComments(comments).some((c) => c.analysis)) return;

		comments = clearCommentAnalysis($state.snapshot(comments));
		threadSummary = '';
		generatingThreadSummary = false;
		lastAnalysisModel = null;
		lastAnalysisQuestion = null;
		analyzeProgress = null;
		activeTab = 'analysis';
		highlightedKeyword = null;
		expandedKeywordRows = [];
		returnKeyword = null;
	});

	async function loadPost() {
		error = '';
		const id = parsePostId(postInput);
		if (!id) {
			error = 'Invalid HN URL or post id';
			return;
		}

		const switchingPosts = post?.id !== id;
		if (switchingPosts) {
			abortController?.abort();
			post = null;
			resetThreadUiState();
		}

		// Check for cached analysis first (has sentiment data)
		// Try current model first, then any cached analysis
		let cachedAnalysis = await loadAnalysis(id, prefs.model);
		if (!cachedAnalysis && switchingPosts) {
			cachedAnalysis = await loadAnyAnalysis(id);
		}
			if (cachedAnalysis) {
				post = cachedAnalysis.post;
			comments = cachedAnalysis.comments;
			threadSummary = cachedAnalysis.threadSummary || '';
			generatingThreadSummary = false;
			sentimentQuestion = cachedAnalysis.sentimentQuestion;
			// Track the model/question that was used for this analysis
			lastAnalysisModel = cachedAnalysis.model;
			lastAnalysisQuestion = cachedAnalysis.sentimentQuestion;
			if (cachedAnalysis.model && cachedAnalysis.model !== prefs.model) {
				suppressModelChangeReset = true;
				prefs.model = cachedAnalysis.model;
			}
			availableAnalysisModels = await listAnalysisModels(id);
			goto(`?post=${id}`, { replaceState: true });
				return;
			}

			// Check bundled startup analysis for this post ID
			const startupAnalysis = await fetchStartupAnalysisData();
			if (startupAnalysis && startupAnalysis.hnPostId === id) {
				await applyImportedAnalysis(startupAnalysis);
				return;
			}

			// Check for cached HN data (no analysis yet)
			const cachedHN = await getCachedHNData(id);
		if (cachedHN) {
			post = cachedHN.post;
			comments = cachedHN.comments;
			threadSummary = '';
			generatingThreadSummary = false;
			sentimentQuestion = generateBasicQuestion(post.title);
			availableAnalysisModels = await listAnalysisModels(id);
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
			threadSummary = '';
			generatingThreadSummary = false;
			sentimentQuestion = generateBasicQuestion(post.title);

			comments = await fetchComments(id, (count) => {
				discoveredComments = count;
			});

			// Cache fetched data (snapshot to strip Svelte proxies)
			await cacheHNData(id, $state.snapshot(post), $state.snapshot(comments));
			availableAnalysisModels = await listAnalysisModels(id);

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
		threadSummary = '';
		generatingThreadSummary = false;
		abortController = new AbortController();
		apiDebug.comment = {
			requests: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			truncated: 0,
			finishReasons: {},
			last: null
		};
		apiDebug.threadSummary = null;

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
				abortController.signal,
				prefs.analysisPromptTemplate,
				handleApiDebug
			);

			// Track what settings were used
			lastAnalysisModel = prefs.model;
			lastAnalysisQuestion = sentimentQuestion;

			const summaryInput = buildThreadSummaryInput();
			if (summaryInput && abortController && !abortController.signal.aborted) {
				generatingThreadSummary = true;
				try {
					threadSummary = await generateThreadSummary(
						prefs.apiKey,
						prefs.model,
						summaryInput,
						abortController.signal,
						prefs.threadSummaryPromptTemplate,
						handleApiDebug
					);
				} catch (e) {
					if (e instanceof Error && e.name === 'AbortError') throw e;
					console.warn('Failed to generate thread summary:', e);
				} finally {
					generatingThreadSummary = false;
				}
			}

			// Save to IndexedDB
			const exportData = buildExport();
			const result = await saveAnalysis(exportData);
			if (!result.ok) {
				console.warn('Failed to save analysis:', result.error);
			}
			availableAnalysisModels = await listAnalysisModels(post.id);
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
			threadSummary: threadSummary || undefined,
			post: $state.snapshot(post!),
			comments: $state.snapshot(comments)
		};
	}

	function buildThreadSummaryInput(): ThreadSummaryInput | null {
		const flat = flattenComments(comments);
		const analyzable = flat.filter((c) => c.text && !c.deleted && !c.dead);
		const analyzed = analyzable.filter((c) => c.analysis);
		if (analyzed.length === 0) return null;

		const promoters = analyzed.filter((c) => c.analysis!.sentiment === 'promoter').length;
		const neutrals = analyzed.filter((c) => c.analysis!.sentiment === 'neutral').length;
		const detractors = analyzed.filter((c) => c.analysis!.sentiment === 'detractor').length;
		const npsScore = Math.round((promoters / analyzed.length) * 100) - Math.round((detractors / analyzed.length) * 100);

		const keywordCounts = new Map<string, number>();
		for (const c of analyzed) {
			for (const kw of c.analysis?.keywords || []) {
				const lower = kw.toLowerCase();
				keywordCounts.set(lower, (keywordCounts.get(lower) || 0) + 1);
			}
		}

		const topKeywords = [...keywordCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([keyword, count]) => ({ keyword, count }));

		return {
			sentimentQuestion,
			analyzableCount: analyzable.length,
			analyzedCount: analyzed.length,
			npsScore,
			promoters,
			neutrals,
			detractors,
			topKeywords
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
			await applyImportedAnalysis(data);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Import failed';
		}
		input.value = '';
	}

	function selectComment(id: number) {
		selectedId = id;
		requestAnimationFrame(() => {
			const threadEl = document.getElementById(`comment-${id}`);
			threadEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			const treeEl = document.getElementById(`tree-node-${id}`);
			treeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
		});
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName.toLowerCase();
		return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
	}

	function jumpToKeyword(keyword: string) {
		highlightedKeyword = keyword.toLowerCase();
		activeTab = 'keywords';
	}

	function jumpToCommentFromKeyword(commentId: number, keyword: string) {
		returnKeyword = keyword.toLowerCase();
		highlightedKeyword = keyword.toLowerCase();
		activeTab = 'analysis';
		requestAnimationFrame(() => {
			selectComment(commentId);
		});
	}

	function jumpBackToKeywordTab() {
		if (!returnKeyword) return;
		highlightedKeyword = returnKeyword;
		activeTab = 'keywords';
	}

	async function switchModelResults(model: string) {
		if (!post) return;
		const cached = await loadAnalysis(post.id, model);
		if (!cached) return;

		post = cached.post;
		comments = cached.comments;
		sentimentQuestion = cached.sentimentQuestion;
		threadSummary = cached.threadSummary || '';
		generatingThreadSummary = false;
		lastAnalysisModel = cached.model || model;
		lastAnalysisQuestion = cached.sentimentQuestion || null;
		activeTab = 'analysis';
		highlightedKeyword = null;
		expandedKeywordRows = [];
		returnKeyword = null;
		analyzeProgress = null;

		if (model !== prefs.model) {
			suppressModelChangeReset = true;
			prefs.model = model;
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (activeTab !== 'analysis' || displayedComments.length === 0 || isTypingTarget(e.target)) return;

		const firstId = navIndex.flatIds[0];
		if (selectedId === null) {
			if (firstId !== undefined) {
				e.preventDefault();
				selectComment(firstId);
			}
			return;
		}

		const currentPos = navIndex.positionById.get(selectedId);
		if (currentPos === undefined) return;

		let nextId: number | null = null;
		switch (e.key) {
			case 'ArrowDown':
				nextId = currentPos < navIndex.flatIds.length - 1 ? navIndex.flatIds[currentPos + 1] : null;
				break;
			case 'ArrowUp':
				nextId = currentPos > 0 ? navIndex.flatIds[currentPos - 1] : null;
				break;
			case 'ArrowRight': {
				const children = navIndex.childrenById.get(selectedId) || [];
				nextId = children[0] ?? null;
				break;
			}
			case 'ArrowLeft':
				nextId = navIndex.parentById.get(selectedId) ?? null;
				break;
			case 'Home':
				nextId = firstId ?? null;
				break;
			case 'End':
				nextId = navIndex.flatIds.length > 0 ? navIndex.flatIds[navIndex.flatIds.length - 1] : null;
				break;
			default:
				return;
		}

		if (nextId === null || nextId === selectedId) return;
		e.preventDefault();
		selectComment(nextId);
	}

	async function generateQuestion() {
		if (!prefs.apiKey || !post) return;
		error = '';
		generatingQuestion = true;
		try {
			sentimentQuestion = await generateAIQuestion(
				prefs.apiKey,
				prefs.model,
				post,
				comments,
				prefs.questionPromptTemplate,
				handleApiDebug
			);
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
		bind:questionPromptTemplate={prefs.questionPromptTemplate}
		bind:analysisPromptTemplate={prefs.analysisPromptTemplate}
		bind:threadSummaryPromptTemplate={prefs.threadSummaryPromptTemplate}
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
			<h2 class="text-lg font-medium">Analyze sentiment in <a href="https://news.ycombinator.com" target="_blank" rel="noopener" class="text-orange-600 dark:text-orange-400 hover:underline">Hacker News</a> threads</h2>
			<p class="text-gray-600 dark:text-gray-400">
				Paste an HN URL/post id, or place an exported JSON at <code>{STARTUP_ANALYSIS_PATH}</code> to auto-load on startup.
			</p>
		</div>
	{/if}

	{#if post}
		<div class="space-y-4">
			<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
				<div>
					<label for="sentiment-q" class="block text-sm font-medium mb-1">Sentiment Question</label>
					<textarea
						id="sentiment-q"
						bind:value={sentimentQuestion}
						rows="2"
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y min-h-[2.5rem]"
					></textarea>
				</div>

				<div class="flex flex-wrap gap-3 items-start">
					<button
						onclick={generateQuestion}
						disabled={generatingQuestion || !prefs.apiKey}
						class="w-72 h-12 px-4 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
						title={!prefs.apiKey ? 'Enter API key first' : 'Generate a better question using AI'}
					>
						{generatingQuestion ? 'Generating...' : 'Generate Question with AI'}
					</button>
				</div>
			</div>

				<div class="space-y-1">
					<div class="flex gap-2 items-center flex-wrap">
					<button
						onclick={runAnalysis}
						disabled={analyzing || !prefs.apiKey}
						class="w-72 h-12 px-4 text-white rounded disabled:cursor-not-allowed transition-colors {hasAnalysis && !analysisStale ? 'bg-orange-400 hover:bg-orange-500' : 'bg-orange-600 hover:bg-orange-700'} {!prefs.apiKey ? 'opacity-50' : ''}"
						title={hasAnalysis && !analysisStale ? 'Analysis up to date (change model or question to re-run)' : ''}
					>
						{analyzing ? 'Analyzing...' : hasAnalysis && !analysisStale ? 'Re-run Analysis' : 'Run Analysis'}
					</button>
					{#if analyzing}
						<button
							onclick={stopAnalysis}
							class="h-12 px-4 bg-red-600 text-white rounded hover:bg-red-700"
						>
							Stop
						</button>
					{/if}
						{#if tokenEstimate}
							<div class="text-sm text-gray-600 dark:text-gray-400">
								Estimated: {formatTokens(tokenEstimate.totalTokens)} tokens ({tokenEstimate.commentCount} comments) &middot; {formatCost(tokenEstimate.estimatedCost)}
							</div>
						{/if}
					</div>
					{#if lastAnalysisModel}
						<div class="text-xs text-gray-500 dark:text-gray-400">
							Last run: {lastAnalysisModel}
						</div>
					{/if}
			</div>

			{#if prefs.showApiDebug}
				<div class="border border-gray-200 dark:border-gray-700 rounded p-3 text-xs space-y-2 bg-gray-50 dark:bg-gray-900/30">
					<div class="font-medium">API Debug</div>
					{#if apiDebug.question}
						<div>
							Question: {apiDebug.question.model} | finish: {apiDebug.question.finishReason} | out: {apiDebug.question.outputTokens} | in: {apiDebug.question.inputTokens}
						</div>
					{/if}
					<div>
						Comments: {apiDebug.comment.requests} calls | out: {apiDebug.comment.outputTokens} | in: {apiDebug.comment.inputTokens} | truncated: {apiDebug.comment.truncated}
					</div>
					<div>
						Comment finish reasons: {commentFinishReasonsText}
					</div>
					{#if apiDebug.threadSummary}
						<div>
							Thread summary: {apiDebug.threadSummary.model} | finish: {apiDebug.threadSummary.finishReason} | out: {apiDebug.threadSummary.outputTokens} | in: {apiDebug.threadSummary.inputTokens}
						</div>
					{/if}
				</div>
			{/if}

			{#if availableAnalysisModels.length > 1}
				<div class="flex flex-wrap gap-2">
					{#each availableAnalysisModels as modelName}
						<button
							onclick={() => switchModelResults(modelName)}
							class="px-2 py-1 text-xs border rounded {prefs.model === modelName ? 'border-orange-500 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'}"
						>
							{modelName}
						</button>
					{/each}
				</div>
			{/if}

				<Dashboard
					{post}
					{comments}
					analysisModel={lastAnalysisModel || prefs.model}
					{analyzing}
					{threadSummary}
					{generatingThreadSummary}
					{sentimentQuestion}
					onKeywordClick={jumpToKeyword}
				/>

				<div class="space-y-2">
				<div class="flex gap-2 flex-wrap items-center">
					<label class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
						Import JSON
						<input type="file" accept=".json" class="hidden" onchange={handleImport} />
					</label>
					<button
						onclick={handleExport}
						class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
					>
						Export JSON
					</button>
				</div>
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
			<div class="flex gap-4 text-sm flex-wrap items-center">
				{#if returnKeyword}
					<button
						class="px-2 py-1 border border-orange-300 text-orange-700 dark:text-orange-300 dark:border-orange-700 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20"
						onclick={jumpBackToKeywordTab}
					>
						Back to keyword: {returnKeyword}
					</button>
				{/if}
				<label class="flex items-center gap-2">
					<span>Sort</span>
					<select
						bind:value={prefs.sortMode}
						class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm"
					>
						<option value="default">Default (HN)</option>
						<option value="time-asc">Time (Oldest first)</option>
						<option value="time-desc">Time (Newest first)</option>
						<option value="sentiment-asc">Sentiment (Low to high)</option>
						<option value="sentiment-desc">Sentiment (High to low)</option>
					</select>
				</label>
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
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={prefs.showApiDebug} class="rounded" />
					API Debug
				</label>
			</div>
		{/if}

			{#if activeTab === 'analysis'}
				<div class="h-[70vh] min-h-[420px] max-h-[900px] overflow-hidden">
					<SplitPane initialWidth={280} minWidth={140} maxWidth={420}>
						{#snippet left()}
							<div class="h-full border border-gray-200 dark:border-gray-700 rounded p-3 mr-1 overflow-auto">
								<h3 class="text-sm font-medium mb-2">Comment Tree</h3>
								<p class="mb-2 text-xs text-gray-500 dark:text-gray-400">Use arrow keys to navigate</p>
								<div class="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
									<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block"></span>Promoter</span>
									<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-slate-500 inline-block"></span>Neutral</span>
									<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm detractor-legend inline-block"></span>Detractor</span>
									<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-500 inline-block"></span>Empty</span>
								</div>
								<TreeView comments={displayedComments} {selectedId} onSelect={selectComment} />
							</div>
						{/snippet}
						{#snippet right()}
							<div class="h-full pl-2 overflow-auto">
								<ThreadView
									comments={displayedComments}
									{selectedId}
									{analyzing}
									showCommentText={prefs.showCommentText}
									showAuthor={prefs.showAuthor}
									showTime={prefs.showTime}
									showSummary={prefs.showSummary}
									showKeywords={prefs.showKeywords}
									showSentiment={prefs.showSentiment}
									onSelect={selectComment}
									onKeywordClick={jumpToKeyword}
								/>
							</div>
						{/snippet}
					</SplitPane>
				</div>
			{:else}
				<KeywordsTable
					{comments}
					{highlightedKeyword}
					expandedKeywordsState={expandedKeywordRows}
					onExpandedKeywordsChange={(keywords) => expandedKeywordRows = keywords}
					onCommentJump={jumpToCommentFromKeyword}
				/>
			{/if}
		{/if}
</div>

<style>
	.detractor-legend {
		background-color: rgb(239 68 68);
		background-image: repeating-linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.7) 0 1px,
			transparent 1px 4px
		);
	}
</style>
