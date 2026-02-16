<script lang="ts">
	import { MODELS } from '$lib/schema';

	interface Props {
		postInput: string;
		apiKey: string;
		model: string;
		onLoad: () => void;
		loading?: boolean;
	}

	let { postInput = $bindable(), apiKey = $bindable(), model = $bindable(), onLoad, loading = false }: Props = $props();

	let useCustomModel = $state(false);
	let customModel = $state('');

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
</script>

<div class="space-y-4 max-w-2xl">
	<div>
		<label for="post-input" class="block text-sm font-medium mb-1">HN Post URL or ID</label>
		<div class="flex gap-2">
			<input
				id="post-input"
				type="text"
				bind:value={postInput}
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
			type="password"
			bind:value={apiKey}
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
</div>
