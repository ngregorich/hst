<script lang="ts">
	import { MODELS } from '$lib/schema';
import { DEFAULT_ANALYSIS_PROMPT_TEMPLATE, DEFAULT_QUESTION_PROMPT_TEMPLATE, DEFAULT_THREAD_SUMMARY_PROMPT_TEMPLATE } from '$lib/prompts';

	interface Props {
		postInput: string;
		apiKey: string;
		model: string;
		questionPromptTemplate: string;
		analysisPromptTemplate: string;
		threadSummaryPromptTemplate: string;
		onLoad: () => void;
		loading?: boolean;
	}

	let {
		postInput = $bindable(),
		apiKey = $bindable(),
		model = $bindable(),
		questionPromptTemplate = $bindable(),
		analysisPromptTemplate = $bindable(),
		threadSummaryPromptTemplate = $bindable(),
		onLoad,
		loading = false
	}: Props = $props();

	let useCustomModel = $state(false);
	let customModel = $state('');
	let advancedOpen = $state(false);

	// Sync model value with custom input
	$effect(() => {
		if (useCustomModel && customModel) {
			model = customModel;
		}
	});

	function handleModelChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		if (value === '__custom__') {
			useCustomModel = true;
			customModel = model;
		} else {
			useCustomModel = false;
			model = value;
		}
	}

	function resetPromptTemplates() {
		questionPromptTemplate = DEFAULT_QUESTION_PROMPT_TEMPLATE;
		analysisPromptTemplate = DEFAULT_ANALYSIS_PROMPT_TEMPLATE;
		threadSummaryPromptTemplate = DEFAULT_THREAD_SUMMARY_PROMPT_TEMPLATE;
	}

	function handlePostInputKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (loading || !postInput.trim()) return;
		onLoad();
	}
</script>

<div class="space-y-4 w-full border border-gray-200 dark:border-gray-700 rounded-lg p-4">
	<div>
		<label for="post-input" class="block text-sm font-medium mb-1">HN Post URL or ID</label>
		<div class="flex gap-2">
			<input
				id="post-input"
				name="hn-post-url"
				type="text"
				bind:value={postInput}
				onkeydown={handlePostInputKeydown}
				autocomplete="url"
				autocapitalize="off"
				autocorrect="off"
				spellcheck="false"
				placeholder="https://news.ycombinator.com/item?id=12345 or just 12345"
				class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
			/>
			<button
				onclick={onLoad}
				disabled={loading || !postInput.trim()}
				class="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Loading...' : 'Load'}
			</button>
		</div>
	</div>

	<div>
		<label for="api-key" class="block text-sm font-medium mb-1">
			OpenRouter API Key
			<a
				href="https://openrouter.ai/keys"
				target="_blank"
				rel="noopener"
				class="text-orange-600 dark:text-orange-400 hover:underline ml-2 text-xs"
			>
				Get one
			</a>
			<span class="text-gray-400 text-xs ml-2">(stored locally, no backend)</span>
		</label>
		<input
			id="api-key"
			name="openrouter-api-key"
			type="password"
			bind:value={apiKey}
			autocomplete="new-password"
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
			placeholder="sk-or-..."
			class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
		/>
	</div>

	<div>
		<label for="model" class="block text-sm font-medium mb-1">Model</label>
		{#if useCustomModel}
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={customModel}
					placeholder="e.g., anthropic/claude-3-opus"
					class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
				/>
				<button
					onclick={() => { useCustomModel = false; model = MODELS[0]; }}
					class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
				>
					Cancel
				</button>
			</div>
		{:else}
			<select
				id="model"
				value={model}
				onchange={handleModelChange}
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
			>
				{#each MODELS as m}
					<option value={m}>{m}</option>
				{/each}
				<option value="__custom__">Custom model...</option>
			</select>
		{/if}
	</div>

	<details bind:open={advancedOpen} class="border border-gray-200 dark:border-gray-700 rounded">
		<summary class="cursor-pointer px-3 py-2 text-sm font-medium select-none">Advanced</summary>
		<div class="px-3 pb-3 pt-1 space-y-4">
			<div>
				<label for="question-prompt-template" class="block text-sm font-medium mb-1">
					Question Prompt Template
				</label>
				<textarea
					id="question-prompt-template"
					bind:value={questionPromptTemplate}
					rows="7"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xs"
				></textarea>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Placeholders: <code>&#123;&#123;title&#125;&#125;</code>, <code>&#123;&#123;body&#125;&#125;</code>, <code>&#123;&#123;url&#125;&#125;</code>, <code>&#123;&#123;top_comments&#125;&#125;</code>, <code>&#123;&#123;body_section&#125;&#125;</code>, <code>&#123;&#123;url_section&#125;&#125;</code>, <code>&#123;&#123;top_comments_section&#125;&#125;</code>
				</p>
			</div>

			<div>
				<label for="analysis-prompt-template" class="block text-sm font-medium mb-1">
					Comment Analysis Prompt Template
				</label>
				<textarea
					id="analysis-prompt-template"
					bind:value={analysisPromptTemplate}
					rows="10"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xs"
				></textarea>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Placeholders: <code>&#123;&#123;sentiment_question&#125;&#125;</code>, <code>&#123;&#123;comment_text&#125;&#125;</code>
				</p>
			</div>

			<div>
				<label for="thread-summary-prompt-template" class="block text-sm font-medium mb-1">
					Overall Thread Summary Prompt Template
				</label>
				<textarea
					id="thread-summary-prompt-template"
					bind:value={threadSummaryPromptTemplate}
					rows="10"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xs"
				></textarea>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Placeholders: <code>&#123;&#123;sentiment_question&#125;&#125;</code>, <code>&#123;&#123;analyzed_count&#125;&#125;</code>, <code>&#123;&#123;analyzable_count&#125;&#125;</code>, <code>&#123;&#123;nps_score&#125;&#125;</code>, <code>&#123;&#123;promoters&#125;&#125;</code>, <code>&#123;&#123;neutrals&#125;&#125;</code>, <code>&#123;&#123;detractors&#125;&#125;</code>, <code>&#123;&#123;top_keywords&#125;&#125;</code>
				</p>
			</div>

			<div>
				<button
					type="button"
					onclick={resetPromptTemplates}
					class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
				>
					Reset Prompt Defaults
				</button>
			</div>
		</div>
	</details>
</div>
