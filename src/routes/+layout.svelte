<script>
	import '$lib/styles/style.scss';
	import { filteredTags, togglePositiveTagFilterFn } from '$lib/utils/stores';
	import { page } from '$app/state';
	import { pushState, replaceState } from '$app/navigation';
	/** @type {{children?: import('svelte').Snippet}} */
	let { children } = $props();
	filteredTags.set(page.url.searchParams.get('tags')?.split(',') ?? []);
	togglePositiveTagFilterFn.update(
		() =>
			function (checked, tag) {
				let fTags = $filteredTags;

				if (checked && !fTags.includes(tag)) {
					fTags.push(tag)
				} else if (!checked && $filteredTags.includes(tag)) {
					fTags = [
						...fTags.slice(0, fTags.indexOf(tag)),
						...fTags.slice(fTags.indexOf(tag) + 1)
					];
				} else return;

				page.url.searchParams.set('tags', fTags.join(','));
				$filteredTags = fTags

				if (fTags.length > 0) {
					pushState(page.url, page.state);
				} else {
					page.url.searchParams.delete('tags');
					replaceState(page.url, page.state);
				}
			}
	);
</script>

<svelte:head>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<meta property="og:url" content={page.url.href} />
</svelte:head>

{@render children?.()}
