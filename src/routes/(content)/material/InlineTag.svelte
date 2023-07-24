<script>
	import { page } from '$app/stores';
	import { alias, togglePositiveTagFilterFn, filteredTags } from '$lib/utils/stores';
	import Tag from '$lib/components/Tag.svelte';

	/** @type string */
	export let tag;
	/** @type string */
	export let internalTag;
	/** @type {(a:string,b:string)=>*}*/
	let toggle = $togglePositiveTagFilterFn;
	let checked = $filteredTags.includes(tag);
	const aliasedTag = $alias(internalTag ?? tag);

	togglePositiveTagFilterFn.subscribe((f) => (toggle = f));
	filteredTags.subscribe((f) => (checked = f.includes(aliasedTag ?? internalTag ?? tag)));
</script>

<Tag
	onInput={(/**@type {*} */ evt) => toggle(evt.target?.checked, aliasedTag ?? internalTag ?? tag)}
	{tag}
	isCheckbox
	{checked}
	--off-background="color-mix(in srgb, var(--1-light) 10%, transparent)"
	--font-size="1em"
	--padding="0.1em 0.2em"
	--border-radius=".3em"
	noBorder
/>
