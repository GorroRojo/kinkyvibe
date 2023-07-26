<script>
	import FilterBar from './FilterBar.svelte';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import Tag from './Tag.svelte';
	import { visibleTags } from '$lib/utils/stores';
	import { cubicOut } from 'svelte/easing';
	import { page } from '$app/stores';
	import { onMount } from 'svelte/internal';
	import {togglePositiveTagFilterFn} from '$lib/utils/stores'

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

	/**@type{(evt: {target: HTMLInputElement}, tag: string)=>*}*/
	export let onInput = (evt,tag)=>$togglePositiveTagFilterFn(evt.target?.checked, tag);


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
	let mounted = false;
	onMount(() => (mounted = true));

	/** @type {(group:Group)=>string[]}*/
	function getAllMembers(group) {
		let res = [group.name];
		res.push(...group.members);
		// @ts-ignore
		res.push(...group.sub.map((g) => getAllMembers(g)));
		return res.flat();
	}
	let noname =
		group.noname ||
		!(
			$visibleTags.includes(group.name) ||
			getAllMembers(group).some((t) => $visibleTags.includes(t))
		);
</script>

<div
	in:scale={{ duration: 500 }}
	class="filtergroup"
	style:--tag-color={group.color ?? 'inherit'}
	class:noname
>
	{#each [{ name: group.name, id: 1 }, { lists: lists, id: 2 }].filter((t) => (t.name != undefined && !noname) || (t.lists != undefined && (group.members.length > 0 || isSubListVisible(group.sub, $visibleTags)))) as el (el.id)}
		<svelte:element
			this={el.id == 1 ? 'span' : 'div'}
			in:scale={{ duration: 500 }}
			class={el.id == 1 ? 'groupname' : 'groupitems'}
		>
			{#if el.name != /*@ts-ignore*/ undefined}
				<Tag
					tag={el.name}
					noBorder
					isCheckbox
					onInput={(evt) => onInput(evt, el.name)}
					checked={$page.url.searchParams.has('tags') &&
						$page.url.searchParams.get('tags')?.split(',').includes(el.name)}
				/>
			{:else if el.lists != undefined}
				{#each el.lists as list (list.classname)}
					<ul class={list.classname} in:scale={{ duration: 500 }}>
						{#each list.items as item (typeof item == 'string' ? item : item.name)}
							<li in:scale={{ duration: 500 }}>
								{#if typeof item == 'string'}
									{#if mounted}
										{@const dummy = /**@ts-ignore*/ false}
										<Tag
											onInput={(evt) => onInput(evt, item)}
											tag={item}
											isCheckbox
											checked={$page.url.searchParams.has('tags') &&
												$page.url.searchParams.get('tags')?.split(',').includes(item)}
											noBorder
										/>
									{:else}
										<Tag
											tag={item}
											--filled-text-color="var(--text-color, var(--tag-color))"
											--filled-outline="none"
											--filled-outline-offset="0"
											--fill-color="transparent"
										/>
									{/if}
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
</div>

<style langs="scss">
	.filtergroup {
		display: flex;
		border-radius: 0.3em;
		flex-direction: column;
		min-width: 0;
		align-items: center;
		font-family: sans-serif;
		--border-radius: 0.3em;
		transition: 100ms;
		outline: 3px solid transparent;
		justify-content: center;
		flex-wrap: wrap;
		& > * {
			/* margin-left: 8px; */
		}
	}
	.filtergroup.noname {
		outline-color: transparent;
		background: transparent;
		box-shadow: none;
	}
	.filtergroup.noname ul {
		align-items: center;
	}
	.filtergroup:has(> .groupname :checked) {
		outline: 3px solid var(--tag-color);
		background: color-mix(in srgb, var(--tag-color) 10%, transparent);
	}

	.filtergroup,
	.taglist {
		--text-color: color-mix(in hsl, var(--tag-color) 100%, black);
		--faded-color: color-mix(in srgb, var(--tag-color) 2%, white);
		background: var(--faded-color);
	}
	:global(.taglist:has(li)),
	:global(.filtergroup:has(li)),
	:global(.filtergroup:has(span)) {
		box-shadow: -2px 0 var(--tag-color);
	}

	:global(.filterbar > .filtergroup) {
		box-shadow: 0 0 0em -0em rgba(0, 0, 0, 0.3);
	}

	.taglist {
		border-radius: 0.3em;
		overflow: hidden;
		align-items: center;
		min-width: 0;
	}
	.subgroups {
		flex-direction: column;
		align-items: center;
		row-gap: 0.3em;
		column-gap: 0.3em;
	}
	:global(.filterbar .filtergroup ul:has(li)) {
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
		max-width: 100%;
		/* transition: 700ms; */
	}
	li {
		list-style: none;
		text-align: center;
		display: flex;
		/* height: 0; */
	}
	:global(.filtergroup .groupitems li:has(li)),
	:global(.filtergroup .groupitems li:has(label)) {
		height: unset;
	}
	.taglist li {
		/* flex: 1 1; */
	}
	:global(.taglist > li:has(:checked) + li:has(:checked)) {
		--border-radius: 0 0.3em 0.3em 0;
		border-left: 10px solid var(--tag-color);
		margin-left: -10px;
	}
	.groupname {
		display: flex;
		/* color: var(--tag-color); */
		justify-content: stretch;
		flex: 1 1;
		text-align: center;
		/* --fill-color: transparent; */
	}
	/* .groupname + .groupitems {
		margin-left: 5px;
	} */
	.groupitems {
		flex-direction: column;
		row-gap: 0.2em;
		column-gap: 0.6em;
		justify-content: center;
		align-items: center;
		/* flex-wrap: wrap; */
		/* transition: 700ms; */
	}
	:global(.groupitems) {
		display: none;
	}
	.groupname:has(:checked) + .groupitems,
	.groupname:has(span) + .groupitems,
	:global(.groupitems:has(:checked)) {
		display: flex;
	}
	.noname .groupitems {
		display: flex;
	}
	@container (min-width: 1300px) {
		.groupname {
			width: 100%;
		}
	}
</style>
