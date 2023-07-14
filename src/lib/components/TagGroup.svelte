<script>
	import FilterBar from './FilterBar.svelte';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import Tag from './Tag.svelte';
	import { visibleTags } from '$lib/utils/stores';
	import { cubicOut } from 'svelte/easing';
	import { page } from '$app/stores';
	import { onMount } from 'svelte/internal';

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

	/**@type{(evt: InputEvent, tag: string)=>*}*/
	export let onInput;

	/**@type {boolean}*/
	// export let checked =
	// 	$page.url.searchParams.has('tags') &&
	// 	$page.url.searchParams.get('tags')?.split(',').includes(group.name) != undefined;

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
</script>
<div
	in:scale={{ duration: 500 }}
	class="filtergroup"
	style:--tag-color={group.color ?? 'inherit'}
	class:noname={!$visibleTags.includes(group.name)}
>
	{#each [{ name: group.name, id: 1 }, { lists: lists, id: 2 }].filter((t) => (t.name != undefined && $visibleTags.includes(t.name)) || (t.lists != undefined && (group.members.length > 0 || isSubListVisible(group.sub, $visibleTags)))) as el (el.id)}
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
											isLink={!mounted}
										/>
									{:else}
										<Tag tag={item}
										--filled-text-color='var(--text-color, var(--tag-color))'
										--filled-outline='none'
										--filled-outline-offset='0'
										--fill-color='transparent'
										/>
									{/if}
								{:else}
									<svelte:self
										group={item}
										{onInput}
										checked={$page.url.searchParams.has('tags') &&
											$page.url.searchParams.get('tags')?.split(',').includes(item.name)}
									/>
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
		min-width: 0;
		align-items: center;
		font-family: sans-serif;
		--border-radius: 0.3em;
		transition: 100ms;
		outline: 3px solid transparent;
		justify-content:center;
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
		background: var(--tag-color);
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
		border-radius: .3em;
		overflow: hidden;
		align-items: start;
		min-width: 0;
	}
	.subgroups {
		flex-direction: column;
		align-items: start;
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
		flex: 1 1;
	}
	:global(.taglist > li:has(:checked) + li:has(:checked)) {
		--border-radius: 0 .3em .3em 0;
		border-left: 10px solid var(--tag-color);
		margin-left: -10px;
	}
	.groupname {
		color: var(--tag-color);
		--fill-color: transparent;
		display:flex;
		justify-content: stretch;
		text-align: center;
		flex: 1 1;
	}
	/* .groupname + .groupitems {
		margin-left: 5px;
	} */
	.groupitems {
		display: flex;
		flex-direction: column;
		/* flex-wrap: wrap; */
		row-gap: 0.2em;
		column-gap: 0.6em;
		justify-content: center;
		align-items: start;
		/* transition: 700ms; */
	}
	@container (min-width: 1300px) {
		.groupname {
			width: 100%;
		}
	}
</style>
