<script>
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import Tag from './Tag.svelte';
	import { visibleTags, filteredTags } from '$lib/utils/stores';
	import { afterUpdate } from 'svelte';
	import { sub } from 'date-fns';
	import { cubicOut } from 'svelte/easing';

	/**@param {HTMLElement} node
	 * @param {{from:DOMRect, to:DOMRect}} ends
	 * @param {any} params
	 * @returns {{
	 *  delay?: number,
	 *  duration?: number,
	 *  easing?: (t: number) => number,
	 *  css?: (t: number, u: number) => string,
	 *  tick?: (t: number, u: number) => void
	 * }}
	 */
	function betterflip(node, { from, to }, params) {
		const style = getComputedStyle(node);
		const transform = style.transform === 'none' ? '' : style.transform;

		const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
		const dx = from.left + (from.width * ox) / to.width - (to.left + ox);
		const dy = from.top + (from.height * oy) / to.height - (to.top + oy);
		//@ts-ignore
		const { delay = 0, duration = (d) => Math.sqrt(d) * 120, easing = cubicOut } = params;

		return {
			delay,
			duration: typeof duration === 'function' ? duration(Math.sqrt(dx * dx + dy * dy)) : duration,
			easing,
			css: (t, u) => {
				const x = u * dx;
				const y = u * dy;
				const sx = t + (u * from.width) / to.width;
				const sy = t + (u * from.height) / to.height;

				return `transform: ${transform} translate(${x}px,0px)`; //${x}px, ${y}px)`; // scale(${sx}, ${sy});`;
			}
		};
	}

	/** @type Group */
	export let group;

	/**
	 * @param {string} tag
	 */
	function togglePositiveTagFilter(tag) {
		filteredTags.update((fTags) =>
			!fTags.includes(tag)
				? [...fTags, tag]
				: [...fTags.slice(0, fTags.indexOf(tag)), ...fTags.slice(fTags.indexOf(tag) + 1)]
		);
	}

	/**@type{(evt: InputEvent, tag: string)=>*}*/
	export let onInput;

	// /** @type {List} */
	// let memberList = {
	// 	items: group.members ?? [],
	// 	classname: 'taglist',
	// 	visible: group.members != undefined && group.members.length > 0
	// };
	// /** @type {List} */
	// let subList = {
	// 	items: group.sub ?? [],
	// 	classname: 'subgroups',
	// 	visible: group.sub != undefined && group.sub.length > 0 && group.sub.some((ss) => isVisible(ss))
	// };

	/**@type {List[]} */
	$: lists = [
		{
			items: group.members ?? [],
			classname: 'taglist',
			visible: true
			// group.members != undefined && group.members.length > 0
		},
		{
			items: group.sub ?? [],
			classname: 'subgroups',
			visible: true
			// group.sub != undefined && group.sub.length > 0 && group.sub.some((ss) => isVisible(ss))
		}
	].filter((i) => i.visible);

	/** @param {Group} group
	 *  @param {string[]} visible
	 *  @return {boolean}
	 */
	function isVisible(group, visible = $visibleTags) {
		return (
			($visibleTags.includes(group.name) ||
				(group.members && group.members.length > 0) ||
				(group.sub && group.sub.length > 0 && group.sub.some((s) => isVisible(s)))) ??
			false
		);
	}
	/**@param {Group[]} sub @param {string[]} visible @returns boolean*/
	let isSubListVisible = (sub, visible) =>
		sub != undefined &&
		sub.length > 0 &&
		sub.some(
			(s) =>
				$visibleTags.includes(s.name) ||
				(s.members && s.members.length > 0) ||
				(s.sub && s.sub.length > 0 && s.sub.some((ss) => isVisible(ss)))
		);
</script>

<!-- {JSON.stringify(lists)} -->
<div
	in:scale={{ duration: 500 }}
	class="filtergroup"
	style:--tag-color={group.color ?? 'inherit'}
	class:noname={!$visibleTags.includes(group.name)}
>
	{#each [{ name: group.name, id: 1 }, { lists: lists, id: 2 }].filter((t) => (t.name != undefined && $visibleTags.includes(t.name)) || (t.lists != undefined && (group.members.length > 0 || group.sub.length > 0))) as el (el.id)}
		<svelte:element
			this={el.id == 1 ? 'span' : 'div'}
			in:scale={{ duration: 500 }}
			class={el.id == 1 ? 'groupname' : 'groupitems'}
		>
			{#if el.name != /*@ts-ignore*/ undefined}
				<Tag
					tag={el.name}
					noBorder
					isCheckbox={$visibleTags.includes(el.name)}
					onInput={() => togglePositiveTagFilter(el.name)}
				/>
			{:else if el.lists != undefined}
				{#each el.lists as list (list.classname)}
					<ul class={list.classname} in:scale={{ duration: 500 }}>
						{#each list.items as item (typeof item == 'string' ? item : item.name)}
							<li in:scale={{ duration: 500 }}>
								{#if typeof item == /**@ts-ignore*/ 'string'}
									<Tag
										tag={item}
										noBorder
										onInput={(evt) => onInput(evt, item)}
										isCheckbox={true}
									/>
								{:else}
									<svelte:self group={item} />
								{/if}
							</li>
						{/each}
					</ul>
				{/each}
			{/if}
		</svelte:element>
	{/each}
	<!-- {#if group.name}
		{#if $visibleTags.includes(group.name)}
			<span transition:scale={{duration:500}} out:scale={{duration:100}} class="groupname" />
		{/if}
	{/if}
	{#if group.members || group.sub}
		<div class="groupitems" />
	{/if} -->
</div>

<style>
	.filtergroup {
		display: flex;
		border-radius: 1em;
		min-width: 0;
		align-items: center;
		font-family: sans-serif;
	}
	.filtergroup.noname {
		background: transparent;
	}
	.filtergroup:has(> .groupname :checked) {
		background: var(--tag-color);
	}

	.filtergroup,
	.taglist {
		--text-color: color-mix(in hsl, var(--tag-color) 80%, black);
		--faded-color: color-mix(in srgb, var(--tag-color) 10%, white);
		background: var(--faded-color);
	}
	:global(.taglist:has(li)),
	:global(.filtergroup:has(li)),
	:global(.filtergroup:has(span)) {
		outline: 3px solid white;
	}

	:global(.filterbar > .filtergroup) {
		box-shadow: 0 0 0em -0em rgba(0, 0, 0, 0.3);
	}

	.taglist {
		border-radius: 1em;
		overflow: hidden;
		align-items: center;
		min-width: 0;
	}
	.subgroups {
		flex-direction: row;
		row-gap: 0.3em;
		column-gap: 0.3em;
	}
	ul:has(li) {
		margin: 0;
		opacity: 1;
	}
	ul {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		margin: -0.1em -0.6em;
		padding: 0;
		opacity: 0;
		/* transition: 700ms; */
	}
	li {
		list-style: none;
		text-align: center;
		display: flex;
		height: 0;
	}
	:global(.filtergroup .groupitems li:has(li)),
	:global(.filtergroup .groupitems li:has(label)) {
		height: unset;
	}
	.taglist li {
		flex: 1 1;
	}
	:global(.taglist > li:has(:checked) + li:has(:checked)) {
		--border-radius: 0 2em 2em 0;
		border-left: 10px solid var(--tag-color);
		margin-left: -10px;
	}
	.groupname {
		color: var(--tag-color);
		--fill-color: transparent;
		/* transition: 200ms; */
	}
	.groupname + .groupitems {
		/* margin-left: 5px; */
	}
	.groupitems {
		display: flex;
		flex-direction: column;
		/* flex-wrap: wrap; */
		row-gap: 0.2em;
		column-gap: 0.6em;
		justify-content: center;
		/* transition: 700ms; */
	}
</style>
