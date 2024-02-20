<script>
	import { togglePositiveTagFilterFn, filteredTags } from '$lib/utils/stores';
	import Tag from '$lib/components/Tag.svelte';

	/** @type string */
	export let tag;
	/** @type string|undefined */
	export let internalTag = undefined;
	/** @type {(a:boolean,b:string)=>*}*/
	let toggle = $togglePositiveTagFilterFn;
	let checked = $filteredTags?.includes(tag) ?? false;
	const aliasedTag = internalTag ?? tag;

	togglePositiveTagFilterFn.subscribe((f) => (toggle = f));
	filteredTags.subscribe((f) => (checked = f.includes(aliasedTag)));
</script>

<Tag
	onInput={(/**@type {*} */ evt) => toggle(evt.target?.checked, aliasedTag)}
	{tag}
	isCheckbox
	{checked}
	--off-background="color-mix(in srgb, var(--1-light) 10%, transparent)"
	--off-outline="1px solid var(--1-light)"
	--off-outline-offset="-2px"
	--font-size="1em"
	--padding="0.1em 0.2em"
	--border-radius=".3em"
	noBorder
/>
