<!--
	"Organizan" / "Autores": suggestions from the amigues profiles (and names past posts used),
	several allowed, free text for someone without a profile. Writes the same `authors:` list
	posts already use: the profile's file name (DemonWeb, la.colectiver…) or the text as typed.
-->
<script>
	import ChipCombobox from './ChipCombobox.svelte';
	import { normalizeText } from '$lib/utils/adminTags.js';
	import { findProfile, organizerValue, searchOrganizers } from '$lib/utils/organizers.js';

	/** @type {string[]} */
	export let authors = [];
	/** @type {import('$lib/utils/organizers.js').Profile[]} */
	export let profiles = [];
	/** @type {import('$lib/utils/organizers.js').OrganizerOption[]} */
	export let options = [];
	export let id = 'authors';
	export let placeholder = 'Buscá en amigues o escribí un nombre';
	/** @type {string|undefined} */
	export let describedby = undefined;
	/** @type {(authors: string[]) => void} */
	export let onChange = () => {};

	/** @param {string} value */
	function chip(value) {
		const p = findProfile(profiles, value);
		return {
			label: value,
			thumb: p?.thumb,
			unknown: !p,
			title: p
				? `Perfil: ${p.title} (/amigues/${p.slug})`
				: 'Sin perfil en amigues: se muestra solo el nombre'
		};
	}

	/**
	 * @param {string} q
	 * @param {string[]} values
	 */
	function search(q, values) {
		return searchOrganizers(options, q, { selected: values }).map((o) => ({
			value: o.value,
			label: o.label,
			thumb: o.thumb,
			detail: [o.detail, o.count ? `${o.count} eventos` : ''].filter(Boolean).join(' · ')
		}));
	}

	/**
	 * @param {string} q
	 * @param {string[]} values
	 * @param {Array<{value: string}>} found
	 */
	function extra(q, values, found) {
		const value = organizerValue(profiles, q);
		if (!value) return null;
		const k = normalizeText(value);
		if (values.some((v) => normalizeText(v) === k)) return null;
		if (found.some((f) => normalizeText(f.value) === k)) return null;
		return {
			value,
			label: `Agregar «${value}»`,
			detail: 'Sin perfil en amigues: se muestra solo el nombre.',
			create: true
		};
	}
</script>

<ChipCombobox
	bind:values={authors}
	{id}
	{placeholder}
	{describedby}
	{search}
	{extra}
	{chip}
	{onChange}
	removeLabel="Quitar"
	addedMessage={(label) => `Agregade: ${label}`}
/>
