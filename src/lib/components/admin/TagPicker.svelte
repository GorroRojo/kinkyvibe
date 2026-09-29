<!--
	Tag field: search the site's tags (name, aliases, accents don't matter), pick suggestions,
	remove chips. A tag that doesn't exist can be added only through the explicit
	"Crear etiqueta nueva" entry: the site shows unknown tags as tags without a category.
-->
<script>
	import ChipCombobox from './ChipCombobox.svelte';
	import {
		canonicalTag,
		cleanNewTag,
		exactTagOption,
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
		return searchTagOptions(options, q, { selected: values, tm }).map((o) => ({
			value: o.id,
			label: o.name,
			icon: o.icon,
			color: o.color,
			detail: [
				o.matched ? `también «${o.matched}»` : '',
				o.inTree ? o.group : 'sin categoría',
				o.count ? `${o.count} ${o.count === 1 ? 'uso' : 'usos'}` : ''
			]
				.filter(Boolean)
				.join(' · ')
		}));
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
	removeLabel="Quitar etiqueta"
	addedMessage={(label) => `Etiqueta agregada: ${label}`}
/>
