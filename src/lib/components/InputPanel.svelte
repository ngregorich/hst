<script lang="ts">
	import { MODELS, DEFAULT_MODEL } from '$lib/schema';

	interface Props {
		postInput: string;
		apiKey: string;
		model: string;
		onLoad: () => void;
		loading?: boolean;
	}

	let { postInput = $bindable(), apiKey = $bindable(), model = $bindable(), onLoad, loading = false }: Props = $props();
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
		<input
			id="model"
			list="models"
			bind:value={model}
			placeholder="Select or type model ID"
			class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
		/>
		<datalist id="models">
			{#each MODELS as m}
				<option value={m}></option>
			{/each}
		</datalist>
	</div>
</div>
