<!--
	Tag field: search the site's tags (name, aliases, accents don't matter), pick suggestions,
	remove chips. A tag that doesn't exist can be added only through the explicit
	"Crear etiqueta nueva" entry: the site shows unknown tags as tags without a category.
-->
<script>
	import { onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import ChipCombobox from './ChipCombobox.svelte';
	import {
		addSpecificTag,
		canonicalTag,
		cleanNewTag,
		exactTagOption,
		moreSpecificPicked,
		normalizeText,
		searchTagOptions,
		siteTags
	} from '$lib/utils/adminTags.js';

	/** @type {string[]} tags as written in the file */
	export let tags = [];
	/** @type {import('$lib/utils/adminTags.js').TagOption[]} */
	export let options = [];
	/** @type {Set<string>} canonical ids that have their own controls (or don't apply here) */
	export let reserved = new Set();
	/** @type {string} what to say when someone types a reserved tag */
	export let reservedHint = 'Esta etiqueta se elige arriba.';
	export let id = 'tags';
	export let placeholder = 'Buscá una etiqueta: taller, shibari, cine…';
	/** @type {string|undefined} */
	export let describedby = undefined;
	/** @type {(tags: string[]) => void} */
	export let onChange = () => {};

	const tm = siteTags();
	$: byId = new Map(options.map((o) => [o.id, o]));

	/* A tag implies its ancestors ("shibari" is already "cuerdas"): keep only the most specific. */
	/** @type {null | {gone: Array<{label: string, color?: string}>, by: string}} */
	let replacedNote = null;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let noteTimer;
	/**
	 * @param {string[]} values
	 * @param {string} value
	 */
	function addTag(values, value) {
		const r = addSpecificTag(values, value, tm);
		if (r.replaced.length) {
			replacedNote = {
				gone: r.replaced.map((t) => ({ label: chip(t).label, color: chip(t).color })),
				by: chip(value).label
			};
			clearTimeout(noteTimer);
			noteTimer = setTimeout(() => (replacedNote = null), 7000);
		}
		return r.added ? r.tags : values;
	}
	onDestroy(() => clearTimeout(noteTimer));

	/** @param {string} value */
	function chip(value) {
		const id = canonicalTag(value, tm);
		const o = byId.get(id);
		const tag = tm.get(id);
		const known = Boolean(o?.inTree || (tag && !tag.orphan));
		return {
			label: o?.name ?? tag?.visible_name ?? value,
			icon: o?.icon ?? tag?.icon,
			color: known ? o?.color ?? tag?.getColor?.() : undefined,
			unknown: !known,
			title:
				(value !== id ? `En el archivo dice «${value}». ` : '') +
				(known
					? o?.group ?? ''
					: o?.count
					? `Etiqueta sin categoría (${o.count} usos)`
					: 'Etiqueta nueva')
		};
	}

	/**
	 * @param {string} q
	 * @param {string[]} values
	 */
	function search(q, values) {
		return searchTagOptions(options, q, { selected: values, tm }).map((o) => {
			// An ancestor of a picked tag adds nothing: say why instead of offering it.
			const specific = moreSpecificPicked(o.id, values, tm);
			return {
				value: o.id,
				label: o.name,
				icon: o.icon,
				color: o.color,
				disabled: Boolean(specific),
				detail: specific
					? `Ya está incluida: «${chip(specific).label}» es más específica y está dentro de «${o.name}».`
					: [
							o.matched ? `también «${o.matched}»` : '',
							o.inTree ? o.group : 'sin categoría',
							o.count ? `${o.count} ${o.count === 1 ? 'uso' : 'usos'}` : ''
					  ]
							.filter(Boolean)
							.join(' · ')
			};
		});
	}

	/**
	 * @param {string} q
	 * @param {string[]} values
	 * @param {Array<{value: string}>} found
	 */
	function extra(q, values, found) {
		const text = cleanNewTag(q);
		if (!text) return null;
		const id = canonicalTag(text, tm);
		const inTree = tm.get(id) && !tm.get(id).orphan;
		const exists =
			exactTagOption(options, text) ||
			values.some((v) => normalizeText(canonicalTag(v, tm)) === normalizeText(id));
		if (exists) return null;
		if (reserved.has(id) || (inTree && !byId.has(id))) {
			return {
				value: '',
				label: `«${text}»: ${
					reserved.has(id) ? reservedHint : 'no se usa en este tipo de publicación.'
				}`,
				disabled: true
			};
		}
		if (found.some((f) => normalizeText(f.value) === normalizeText(text))) return null;
		return {
			value: text,
			label: `Crear etiqueta nueva «${text}»`,
			detail: 'No existe todavía: va a aparecer como etiqueta sin categoría.',
			create: true
		};
	}
</script>

<ChipCombobox
	bind:values={tags}
	{id}
	{placeholder}
	{describedby}
	{search}
	{extra}
	{chip}
	{onChange}
	add={addTag}
	removeLabel="Quitar etiqueta"
	addedMessage={(label) => `Etiqueta agregada: ${label}`}
>
	<p class="replaced" role="status" slot="after-chips">
		{#if replacedNote}
			<span class="replaced-note" transition:fade={{ duration: 300 }}>
				{#each replacedNote.gone as g}<s class="ghost" style:--chip-color={g.color}>{g.label}</s>{/each}
				{replacedNote.gone.length === 1 ? 'ya incluye' : 'ya incluyen'} a «{replacedNote.by}»: se
				{replacedNote.gone.length === 1 ? 'reemplazó' : 'reemplazaron'} por la más específica.
			</span>
		{/if}
	</p>
</ChipCombobox>

<style lang="scss">
	.replaced {
		margin: 0;
		font-size: var(--step--1);
		/* empty (but kept, as a live region): no extra gap */
		&:not(:has(.replaced-note)) {
			margin-top: -0.4em;
		}
	}
	.replaced-note {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35em;
		opacity: 0.85;
	}
	.ghost {
		display: inline-block;
		padding: 0.1em 0.7em;
		border-radius: 2em;
		background: var(--chip-color, var(--1));
		color: white;
		opacity: 0.45;
		text-decoration: line-through;
		text-decoration-thickness: 2px;
	}
</style>
