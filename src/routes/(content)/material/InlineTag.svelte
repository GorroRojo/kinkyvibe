<script>
	import { page } from '$app/stores';
	import { alias, togglePositiveTagFilterFn } from '$lib/utils/stores';
	import Tag from '$lib/components/Tag.svelte';

	/** @type string */
	export let tag;
	/** @type string */
	export let internalTag;
	/** @type {(a:string,b:string)=>*}*/
	let toggle = $togglePositiveTagFilterFn;
	
	togglePositiveTagFilterFn.subscribe(f=>toggle = f);
	
	const aliasedTag = $alias(internalTag ?? tag);
</script>

<Tag
	onInput={(/**@type {*} */ evt) => toggle(evt.target?.checked, aliasedTag ?? internalTag ?? tag)}
	{tag}
	isCheckbox
	checked={$page.url.searchParams.has('tags') &&
		$page.url.searchParams
			.get('tags')
			?.split(',')
			.includes(aliasedTag ?? internalTag ?? tag)}
	--off-background="color-mix(in srgb, var(--1-light) 10%, transparent)"
	--font-size="1em"
	--padding="0.1em 0.2em"
	--border-radius=".3em"
	noBorder
/>
