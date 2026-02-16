<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { loadPrefs, savePrefs, type Preferences } from '$lib/storage';

	let { children } = $props();

	let prefs = $state<Preferences>(loadPrefs());
	let darkMode = $state(false);

	function updateTheme() {
		if (prefs.theme === 'system') {
			darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		} else {
			darkMode = prefs.theme === 'dark';
		}
		document.documentElement.classList.toggle('dark', darkMode);
	}

	function toggleTheme() {
		prefs.theme = darkMode ? 'light' : 'dark';
		savePrefs(prefs);
		updateTheme();
	}

	onMount(() => {
		updateTheme();
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		mq.addEventListener('change', updateTheme);
		return () => mq.removeEventListener('change', updateTheme);
	});
</script>

<div class="min-h-screen">
	<header class="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
		<div>
			<a href="/" class="text-xl font-semibold hover:text-orange-600 dark:hover:text-orange-400">
				HN Sentiment Tool (HST)
			</a>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				AI-powered sentiment analysis for Hacker News threads
				<a href="https://github.com/ngregorich/hst" target="_blank" rel="noopener" class="text-orange-600 dark:text-orange-400 hover:underline ml-1">GitHub</a>
			</p>
		</div>
		<button
			onclick={toggleTheme}
			class="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
			aria-label="Toggle theme"
		>
			{#if darkMode}
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
				</svg>
			{:else}
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
				</svg>
			{/if}
		</button>
	</header>
	<main class="p-4">
		{@render children()}
	</main>
</div>
