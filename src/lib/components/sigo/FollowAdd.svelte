<script>
	/**
	 * «Agregar» de Mi rincón → Lo que sigo: buscar una etiqueta, una serie o (si vienen) un perfil
	 * o un lugar y seguirlo con las opciones de siempre, sin salir de la página (?/seguir).
	 *
	 * Es el selector de etiquetas del sitio (ChipCombobox, con la búsqueda de
	 * $lib/utils/adminTags.js) con el aspecto del buscador público de las listas (`look="search"`:
	 * campo redondeado con lupa, sugerencias con emoji y color). Con JavaScript, elegir una
	 * sugerencia manda el formulario en el momento. Sin JavaScript es el mismo campo (con
	 * `name="clave"`) y un botón «Seguir»: el servidor busca la etiqueta por su nombre, un alias o
	 * la forma de la URL.
	 *
	 * Props: `tags` (followableTags), `profiles` (followableProfiles; vacío = solo etiquetas),
	 * `taken` (lo que ya sigue, como `tipo:clave`), `result` (la respuesta de ?/seguir, si la hay).
	 */
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import ChipCombobox from '$lib/components/admin/ChipCombobox.svelte';
	import { searchTagOptions } from '$lib/utils/adminTags.js';
	import { KIND_EMOJI, followEmoji, searchProfiles } from '$lib/utils/sigo.js';

	/** @type {readonly (import('$lib/utils/adminTags.js').TagOption & { series?: boolean })[]} */
	export let tags = [];
	/** @type {readonly import('$lib/utils/sigo.js').ProfileOption[]} */
	export let profiles = [];
	/** @type {ReadonlySet<string>} */
	export let taken = new Set();
	/** @type {null | { ok?: boolean, error?: string, title?: string }} */
	export let result = null;

	const PROFILE_LABEL = /** @type {Record<string, string>} */ ({
		persona: 'Perfil',
		proyecto: 'Proyecto',
		lugar: 'Lugar'
	});

	let mounted = false;
	let busy = false;
	let kind = 'etiqueta';
	let key = '';
	/** @type {HTMLFormElement} */
	let formEl;

	onMount(() => (mounted = true));

	$: byId = new Map(tags.map((t) => [t.id, t]));
	/**
	 * searchTagOptions resuelve alias con un árbol: acá las opciones ya vienen con su id canónico,
	 * así que alcanza con reconocerlas.
	 *
	 * @returns {TagManager}
	 */
	const lookup = () =>
		/** @type {any} */ ({ get: (/** @type {string} */ id) => (byId.has(id) ? { id } : undefined) });
	$: takenTags = [...taken].filter((t) => t.startsWith('etiqueta:')).map((t) => t.slice(9));
	$: takenProfiles = new Set(
		[...taken].filter((t) => t.startsWith('perfil:')).map((t) => t.slice(7))
	);

	/** @param {number} n */
	const upcoming = (n) => (n === 1 ? '1 evento próximo' : `${n} eventos próximos`);

	/**
	 * @param {string} query
	 * @returns {{ value: string, label: string, icon?: string, color?: string, detail?: string }[]}
	 */
	function search(query) {
		const found = searchTagOptions(/** @type {any} */ (tags), query, {
			selected: takenTags,
			limit: profiles.length ? 6 : 8,
			tm: lookup()
		}).map((o) => {
			const t = /** @type {typeof tags[number]} */ (o);
			return {
				value: `etiqueta:${t.id}`,
				label: t.name,
				icon: followEmoji({ kind: 'etiqueta', icon: t.icon, series: t.series }),
				color: t.color,
				detail: [
					t.series ? 'Serie' : t.group,
					o.matched ? `también «${o.matched}»` : '',
					t.count ? upcoming(t.count) : ''
				]
					.filter(Boolean)
					.join(' · ')
			};
		});
		const people = searchProfiles(profiles, query, { taken: takenProfiles, limit: 4 }).map((p) => ({
			value: `perfil:${p.key}`,
			label: p.name,
			icon: KIND_EMOJI[/** @type {keyof typeof KIND_EMOJI} */ (p.kind)] ?? KIND_EMOJI.persona,
			detail: PROFILE_LABEL[p.kind] ?? 'Perfil'
		}));
		return [...found, ...people];
	}

	/**
	 * Elegir una sugerencia: la sigue en el momento (no queda como chip).
	 *
	 * @param {string[]} values
	 * @param {string} value `tipo:clave`
	 */
	function pick(values, value) {
		const i = value.indexOf(':');
		kind = value.slice(0, i);
		key = value.slice(i + 1);
		tick().then(() => formEl?.requestSubmit());
		return values;
	}

	/**
	 * Sin coincidencias, lo dice (como el buscador de las listas) en vez de cerrar la lista.
	 *
	 * @param {string} query
	 * @param {string[]} _values
	 * @param {unknown[]} found
	 */
	const extra = (query, _values, found) =>
		query.trim() && !found.length
			? { value: '', label: `Nada coincide con «${query.trim()}».`, disabled: true }
			: null;

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
			kind = 'etiqueta';
			key = '';
		};
	};

	$: hint = profiles.length
		? 'Una etiqueta, una serie, une amigue o un lugar.'
		: 'Una etiqueta o una serie.';
</script>

<form
	class="follow-add"
	method="POST"
	action="?/seguir"
	bind:this={formEl}
	use:enhance={submit}
	aria-busy={busy}
>
	<label for="sigo-agregar" class="label">Buscá qué seguir</label>
	<p class="hint" id="sigo-agregar-ayuda">
		{hint} Queda en tu calendario y con mail cuando se anuncie algo nuevo; abajo lo cambiás.
	</p>
	{#if mounted}
		<input type="hidden" name="tipo" value={kind} />
		<input type="hidden" name="clave" value={key} />
	{:else}
		<input type="hidden" name="tipo" value="etiqueta" />
	{/if}
	<div class="field">
		<ChipCombobox
			values={[]}
			id="sigo-agregar"
			look="search"
			placeholder={mounted ? 'shibari, cine, un lugar…' : 'Nombre de la etiqueta o la serie'}
			describedby="sigo-agregar-ayuda"
			inputAttrs={mounted ? {} : { name: 'clave', required: true, maxlength: 100 }}
			{search}
			{extra}
			add={pick}
			addedMessage={(label) => `Siguiendo ${label}…`}
		/>
		{#if !mounted}
			<button class="pill-btn small" type="submit">Seguir</button>
		{/if}
	</div>
	{#if result?.error}
		<p class="error" role="alert">{result.error}</p>
	{:else if result?.ok}
		<p class="ok" role="status">Listo: ahora seguís {result.title}.</p>
	{/if}
</form>

<style>
	.follow-add {
		display: grid;
		gap: 0.45em;
	}
	.label {
		font-weight: 700;
	}
	p {
		margin: 0;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.field {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em;
	}
	.field > :global(.chip-combobox) {
		flex: 1 1 14em;
	}
	.small {
		font-size: var(--step--1);
	}
	.ok {
		color: var(--3-ink);
		font-weight: 600;
	}
	.error {
		color: var(--1-ink);
		font-weight: 600;
	}
	.follow-add[aria-busy='true'] {
		opacity: 0.7;
	}
</style>
