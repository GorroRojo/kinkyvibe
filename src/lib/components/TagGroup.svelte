<script>
	import TagChip from './ui/TagChip.svelte';
	import { tagManager, visibleTags } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { togglePositiveTagFilterFn } from '$lib/utils/stores';

	/** @type ProcessedTag */
	export let tag;
	export let gap = false;
	export let nested = true;

	/**@type{(evt: {target: HTMLInputElement}, tag: string)=>*}*/
	export let onInput = (evt, t) => $togglePositiveTagFilterFn(evt.target?.checked, t);

	/** @param {string} tagID
	 *  @return {boolean}
	 */
	function isVisible(tagID) {
		let t = $tagManager.get(tagID);
		return (
			($visibleTags.includes(tagID) ||
				(t?.children && t.children.length > 0 && t.children.some((s) => isVisible(s)))) ??
			false
		);
	}
	// Las etiquetas tildadas salen de la URL (`?tags=a,b`), como antes.
	$: filtered = ($page.url.searchParams.get('tags') ?? '').split(',').filter(Boolean);
	let mounted = false;
	onMount(() => (mounted = true));
	let noname =
		tag.noname ||
		!($visibleTags.includes(tag.id) || tag.getAllChildren().some((t) => $visibleTags.includes(t)));
</script>

<div
	class="filtergroup"
	style:--tag-color={tag.getColor() ?? 'var(--1)'}
	class:noname
	class:nested
	class:gap
>
	{#if tag.id && !noname}
		<span class="groupname">
			<!-- Chip compartido (TagChip como casilla, docs/estilo.md, «Chip de etiqueta»). -->
			<TagChip
				tag={tag.id}
				name={tag.id}
				checkbox
				selected={filtered.includes(tag.id)}
				on:change={(evt) => onInput(/** @type {*} */ (evt), tag.id)}
				>{#if tag.children && tag.children.length > 0}<span aria-hidden="true">»</span
					>{/if}</TagChip
			>
		</span>
	{/if}
	{#if tag.children && tag.children.length > 0 && tag.children.some(isVisible)}
		<ul class="groupitems">
			{#each tag.children.filter(isVisible) ?? [] as item (item)}
				{@const subTag = $tagManager.get(item)}
				<li>
					{#if !subTag?.children || subTag.children.length == 0}
						{#if mounted}
							<TagChip
								tag={subTag?.id ?? item}
								name={subTag?.id ?? item}
								checkbox
								selected={filtered.includes(item)}
								on:change={(evt) => onInput(/** @type {*} */ (evt), subTag?.id ?? item)}
							/>
						{:else}
							<!-- Antes de hidratar: el chip sin casilla (se ve igual, todavía no filtra). -->
							<TagChip tag={subTag?.id ?? item} />
						{/if}
					{:else if subTag}
						<svelte:self tag={subTag} />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* Cada chip es el compartido (TagChip, `.kv-tag`): acá solo va cómo se ordenan. Una madre
	   tildada abre sus hijas debajo, con una línea en su color a la izquierda. */
	.filtergroup {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		max-width: 100%;
	}
	.groupname {
		display: flex;
		max-width: 100%;
	}
	ul {
		margin: 0;
		padding: 0;
		max-width: 100%;
	}
	/* Cada chip conserva su forma de píldora de una línea: no se estira al alto de la fila (si al
	   lado hay un grupo abierto) ni se achica para partir el texto. Pasa entero a la fila de abajo;
	   el texto solo se parte si el chip solo ya no entra en el ancho. */
	li {
		list-style: none;
		display: flex;
		align-items: flex-start;
		flex: none;
		max-width: 100%;
	}
	li :global(.kv-tag) {
		white-space: normal;
	}
	/* Una hija con sus propias hijas abiertas (ella o alguna de abajo tildada) ocupa la fila
	   entera: su chip arriba y sus hijas debajo, con sangría y la línea de color, igual debajo de
	   cada madre (una etiqueta puede estar en dos ramas, p. ej. bondage e implementos). Así no
	   deja a las vecinas desparejas ni parece que sus hijas son de la madre de arriba. El grupo de
	   adentro es otro TagGroup (svelte:self): Svelte no lo ve, por eso va en :global(). */
	li:has(> :global(.filtergroup :checked)) {
		flex-basis: 100%;
	}
	.groupitems {
		display: none;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-3xs);
		margin-block-start: var(--space-3xs);
		padding-inline-start: var(--space-2xs);
		border-inline-start: 2px solid var(--tag-color);
	}
	/* The checkboxes live in the child <TagChip>. Svelte 5 scopes selectors inside :has(), so the
	   inner part has to be :global() to keep matching it. */
	.groupname:has(:global(:checked)) + .groupitems,
	.groupitems:has(:global(:checked)),
	.noname > .groupitems {
		display: flex;
	}
	.noname > .groupitems {
		margin-block-start: 0;
		padding-inline-start: 0;
		border-inline-start: 0;
	}
	.filtergroup.gap {
		margin-inline-end: var(--space-2xs);
	}
	@container (min-width: 1300px) {
		.filtergroup.gap {
			margin-inline-end: 0;
			margin-block-end: var(--space-2xs);
		}
	}
</style>
