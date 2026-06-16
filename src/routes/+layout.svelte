<script>
	import '$lib/styles/style.scss';
	import {
		filteredTags,
		togglePositiveTagFilterFn
	} from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	onMount(async () => {
		if ('serviceWorker' in navigator) {
		try {
			console.log('Registrando Service Worker manualmente...');
			const registration = await navigator.serviceWorker.register('/service-worker.js');
			console.log('Service Worker registrado exitosamente:', registration);
		} catch (error) {
			console.error('Error al registrar Service Worker:', error);
		}
		}
  	});

	// onMount(() => {
	filteredTags.set([]);
	// });
	togglePositiveTagFilterFn.update(
		() =>
			function (checked, tag) {
				if (checked) {
					filteredTags.update((fTags) => [...fTags, tag]);
				} else {
					filteredTags.update((fTags) => [
						...fTags.slice(0, fTags.indexOf(tag)),
						...fTags.slice(fTags.indexOf(tag) + 1)
					]);
				}
				$page.url.searchParams.set('tags', $filteredTags.join(','));
				if ($filteredTags.length > 0) {
					window.history.pushState('', '', `?${$page.url.searchParams.toString()}`);
				} else {
					$page.url.searchParams.delete('tags');
					window.history.replaceState('', '', $page.url);
				}
			}
	);

</script>

<svelte:head>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<meta property="og:url" content={$page.url.href} />
</svelte:head>

<slot></slot>