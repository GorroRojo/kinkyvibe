<script>
	import '$lib/styles/style.scss';
	import {
		filteredTags,
		togglePositiveTagFilterFn
	} from '$lib/utils/stores';
	import { page } from '$app/stores';
	// onMount(() => {
	filteredTags.set([]);
	// });
	togglePositiveTagFilterFn.update(
		() =>
			function (checked, tag) {
				// PostList mirrors filteredTags into ?tags=
				filteredTags.update((fTags) =>
					checked ? [...fTags.filter((t) => t != tag), tag] : fTags.filter((t) => t != tag)
				);
			}
	);
</script>

<svelte:head>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<meta property="og:url" content={$page.url.href} />
</svelte:head>

<slot></slot>