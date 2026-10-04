<script>
	/**
	 * Sección «📍 Lugar» del formulario de eventos (crear y editar): elegir un lugar (perfil de tipo
	 * lugar) y qué se muestra de su dirección en este evento, o escribir el «Dónde» en texto libre.
	 * Como en las páginas públicas, un lugar elegido manda sobre el texto libre: con un lugar, el
	 * texto queda plegado («Usar texto libre en vez de un lugar»).
	 *
	 * Lo elegido no va al .md: la página lo manda en campos aparte (`venueChoiceFields` en
	 * $lib/utils/venueChoice.js) y el servidor lo guarda en `event_venues` después de guardar el
	 * evento (src/lib/server/amigues/eventFormVenue.js).
	 *
	 * Props:
	 * - `picker`: `data.venuePicker` ({ venues, current, flagOn }) o `null` (sin base: solo el texto
	 *   libre, como antes).
	 * - `choice` (bind): lo elegido ({ venueId, privacy }).
	 * - `fields`, `values` (bind), `idFor`, `errors`: los del «Dónde» en texto libre (FieldGrid).
	 * - `idPrefix`: prefijo de los ids (`ev` al crear, `edit` al editar).
	 * - `venues` (bind, opcional): los lugares, con los que se crean desde acá.
	 * - `createAction`: la acción de «+ Crear lugar» (sin pasarla, `?/crearLugar`).
	 * - `editAction`: la de «Editar» el lugar elegido (nombre, dirección, barrio y ciudad; sin
	 *   pasarla, `?/editarLugar`). Va por su cuenta (fetch): no manda el formulario del evento ni
	 *   pierde lo que no se guardó.
	 */
	import { deserialize } from '$app/forms';
	import { tick } from 'svelte';
	import FieldGrid from './FieldGrid.svelte';
	import {
		VENUE_PRIVACY_LABELS,
		effectivePrivacy,
		inheritPrivacyLabel,
		showsAddress
	} from '$lib/utils/venues.js';
	import { DEFAULT_VENUE_LISTING, VENUE_LISTING_LABELS } from '$lib/utils/venueImport.js';
	import {
		NO_VENUE,
		searchVenues,
		venueOptionMarks,
		venueOptionPlace
	} from '$lib/utils/venueChoice.js';

	/** @typedef {import('$lib/utils/venueChoice.js').VenueOption} VenueOption */
	/** @typedef {import('$lib/utils/venueChoice.js').VenueChoice} VenueChoice */

	/** @type {{ venues: VenueOption[], current: VenueChoice, flagOn: boolean } | null} */
	export let picker = null;
	/** @type {VenueChoice} */
	export let choice = { ...NO_VENUE };
	/** @type {import('$lib/admin/postFields.js').Field[]} */
	export let fields = [];
	/** @type {Record<string, any>} */
	export let values = {};
	/** @type {(key: string) => string} */
	export let idFor = (key) => `${key}-input`;
	/** @type {Record<string, string>} */
	export let errors = {};
	export let idPrefix = 'ev';
	export let createAction = '?/crearLugar';
	export let editAction = '?/editarLugar';

	/**
	 * Los lugares (más los que se crean acá; con bind, la página los ve para el resumen).
	 * @type {VenueOption[]}
	 */
	export let venues = picker?.venues ?? [];
	let query = '';
	/** Buscando otro lugar con uno ya elegido («Cambiar»). */
	let changing = false;
	let creating = false;
	let newName = '';
	let newAddress = '';
	/** Lugar nuevo: no listado en Amigues salvo que se elija «Público» (decisión de gorrite). */
	let newListing = DEFAULT_VENUE_LISTING;
	const LISTINGS = /** @type {const} */ (['unlisted', 'listed']);
	let createBusy = false;
	let createError = '';
	/** @type {HTMLInputElement | undefined} */
	let searchInput;

	/* Edición rápida del lugar elegido (decisión de gorrite). */
	let editing = false;
	let editBusy = false;
	let editError = '';
	/** @type {Record<string, string>} */
	let editErrors = {};
	let edit = { title: '', address: '', area: '', city: '' };
	const EDIT_FIELDS = /** @type {const} */ ([
		{ key: 'title', label: 'Nombre', max: 200 },
		{ key: 'address', label: 'Dirección', max: 300 },
		{ key: 'area', label: 'Barrio', max: 100 },
		{ key: 'city', label: 'Ciudad', max: 100 }
	]);

	$: chosen =
		choice.venueId === null ? null : (venues.find((v) => v.id === choice.venueId) ?? null);
	$: missing = choice.venueId !== null && !chosen;
	$: results = searchVenues(venues, query);
	$: level = chosen ? effectivePrivacy(choice.privacy, chosen.privacy) : null;
	// La dirección escrita en el .md es pública (el repo es público): avisar si el lugar no la muestra.
	$: mdAddressShows = Boolean(
		level && !showsAddress(level) && String(values.location ?? '').trim()
	);
	$: searching = picker && (choice.venueId === null || changing);

	/** @param {VenueOption} v */
	function pick(v) {
		// Al cambiar de lugar, «Igual que el Lugar» (el nivel del otro lugar puede ser otro).
		choice = { venueId: v.id, privacy: v.id === choice.venueId ? choice.privacy : null };
		changing = false;
		creating = false;
		query = '';
	}

	function unlink() {
		choice = { ...NO_VENUE };
		changing = false;
		editing = false;
	}

	function startEdit() {
		if (!chosen) return;
		edit = { title: chosen.title, address: chosen.address, area: chosen.area, city: chosen.city };
		editError = '';
		editErrors = {};
		editing = true;
	}

	async function saveEdit() {
		if (editBusy || !chosen) return;
		if (!edit.title.trim()) {
			editErrors = { title: 'Escribí el nombre del lugar.' };
			return;
		}
		editBusy = true;
		editError = '';
		editErrors = {};
		try {
			const body = new FormData();
			body.set('lugar', String(chosen.id));
			body.set('version', String(chosen.version));
			for (const f of EDIT_FIELDS) body.set(f.key, edit[f.key].trim());
			const response = await fetch(editAction, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await response.text());
			if (result.type === 'success' && result.data?.venueUpdated) {
				const v = /** @type {VenueOption} */ (result.data.venueUpdated);
				venues = venues.map((x) => (x.id === v.id ? v : x));
				editing = false;
			} else {
				editError = result.data?.venueError ?? 'No se pudo guardar el lugar.';
				editErrors = result.data?.venueErrors ?? {};
			}
		} catch (e) {
			editError = 'No pudimos conectarnos con el sitio. ¿Tenés internet?';
		} finally {
			editBusy = false;
		}
	}

	/** Enter en la edición rápida guarda el lugar (no el evento). @param {KeyboardEvent} e */
	function onEditKey(e) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		saveEdit();
	}

	async function startChange() {
		changing = true;
		await tick();
		searchInput?.focus();
	}

	/** @param {Event} e */
	function onPrivacy(e) {
		const value = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
		choice = { ...choice, privacy: value ? /** @type {any} */ (value) : null };
	}

	async function createVenue() {
		if (createBusy || !newName.trim()) return;
		createBusy = true;
		createError = '';
		try {
			const body = new FormData();
			body.set('title', newName.trim());
			body.set('address', newAddress.trim());
			body.set('listado', newListing);
			const response = await fetch(createAction, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await response.text());
			if (result.type === 'success' && result.data?.venueCreated) {
				const v = /** @type {VenueOption} */ (result.data.venueCreated);
				venues = [...venues, v];
				pick(v);
				newName = '';
				newAddress = '';
				newListing = DEFAULT_VENUE_LISTING;
			} else {
				createError = result.data?.venueError ?? 'No se pudo crear el lugar.';
			}
		} catch (e) {
			createError = 'No pudimos conectarnos con el sitio. ¿Tenés internet?';
		} finally {
			createBusy = false;
		}
	}

	/** Enter en el buscador elige el primero (y no manda el formulario). @param {KeyboardEvent} e */
	function onSearchKey(e) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (query.trim() && results[0]) pick(results[0]);
	}
</script>

<fieldset class="card place" id="sec-lugar">
	<legend>📍 Lugar</legend>

	{#if picker}
		{#if !picker.flagOn}
			<p class="hint" id="{idPrefix}-venue-flag">
				El interruptor «Perfiles públicos» está apagado: la página del evento sigue mostrando el
				texto libre. El lugar que elijas se guarda igual y se usa cuando se prenda.
			</p>
		{/if}

		{#if chosen}
			<div class="chosen" id="{idPrefix}-venue-chosen">
				{#if editing}
					<div class="quick-edit" id="{idPrefix}-venue-edit">
						{#each EDIT_FIELDS as f (f.key)}
							<label class="field">
								<span
									>{f.label}{#if f.key === 'title'}{' '}<span class="req">*</span>{/if}</span
								>
								<input
									id="{idPrefix}-venue-edit-{f.key}"
									bind:value={edit[f.key]}
									maxlength={f.max}
									on:keydown={onEditKey}
									aria-invalid={editErrors[f.key] ? 'true' : undefined}
								/>
								{#if editErrors[f.key]}<small class="error">{editErrors[f.key]}</small>{/if}
							</label>
						{/each}
						<small
							>Cambia el lugar en todos sus eventos (como en su página). Lo que ve el público lo
							sigue decidiendo el nivel de privacidad.</small
						>
						{#if editError}<p class="error" role="alert">{editError}</p>{/if}
						<div class="actions">
							<button
								type="button"
								class="button secondary"
								id="{idPrefix}-venue-edit-save"
								disabled={editBusy}
								on:click={saveEdit}>{editBusy ? 'Guardando…' : 'Guardar'}</button
							>
							<button type="button" class="link" on:click={() => (editing = false)}>Cancelar</button
							>
						</div>
					</div>
				{:else}
					<p class="name">
						<strong>{chosen.title}</strong>
						{#each venueOptionMarks(chosen) as mark}<span class="mark">{mark}</span>{/each}
						{#if venueOptionPlace(chosen)}<small class="block">{venueOptionPlace(chosen)}</small
							>{/if}
						<button type="button" class="link" id="{idPrefix}-venue-edit-open" on:click={startEdit}
							>Editar</button
						>
					</p>
				{/if}
				<label class="field">
					<span>Qué se muestra de la dirección en este evento</span>
					<select id="{idPrefix}-venue-privacy" value={choice.privacy ?? ''} on:change={onPrivacy}>
						<option value="">{inheritPrivacyLabel(chosen.privacy)}</option>
						{#each Object.entries(VENUE_PRIVACY_LABELS) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<p class="hint">
					Quien compra entrada recibe el lugar completo en el mail y en su entrada.
					<a href="/admin/comunidad/perfiles/{chosen.slug}" target="_blank" rel="noreferrer"
						>Ver o editar el lugar</a
					>
				</p>
				<div class="actions">
					{#if !changing}
						<button type="button" class="link" on:click={startChange}>Cambiar</button>
					{/if}
					<button type="button" class="link" id="{idPrefix}-venue-remove" on:click={unlink}
						>Sacar lugar</button
					>
				</div>
			</div>
			{#if mdAddressShows}
				<p class="warning">
					⚠️ El «Dónde» en texto libre tiene una dirección escrita y el archivo es público (el repo
					es público), aunque la página muestre el lugar según su privacidad. Si el lugar no quiere
					la dirección pública, borrala de abajo.
				</p>
			{/if}
		{:else if missing}
			<p class="warning" id="{idPrefix}-venue-missing">
				⚠️ El lugar elegido ya no existe.
				<button type="button" class="link" on:click={unlink}>Sacar lugar</button>
			</p>
		{/if}

		{#if searching}
			<div class="search">
				<label class="field">
					<span>{chosen ? 'Elegí otro lugar' : 'Elegí un lugar'}</span>
					<input
						type="search"
						id="{idPrefix}-venue-search"
						bind:this={searchInput}
						bind:value={query}
						on:keydown={onSearchKey}
						placeholder="Buscá por nombre, barrio o ciudad"
						autocomplete="off"
						aria-describedby="{idPrefix}-venue-help"
					/>
				</label>
				<small id="{idPrefix}-venue-help"
					>Los lugares de Perfiles (también los ocultos y los no listados, marcados). Con un lugar,
					la página del evento muestra su nombre y dirección según la privacidad que elijas.</small
				>
				{#if results.length}
					<ul class="results" aria-label="Lugares">
						{#each results as v (v.id)}
							<li>
								<button
									type="button"
									class="option"
									aria-pressed={v.id === choice.venueId}
									on:click={() => pick(v)}
								>
									<strong>{v.title}</strong>
									{#each venueOptionMarks(v) as mark}<span class="mark">{mark}</span>{/each}
									{#if venueOptionPlace(v)}<small class="block">{venueOptionPlace(v)}</small>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="hint">
						{venues.length ? `No hay lugares con «${query.trim()}».` : 'Todavía no hay lugares.'}
					</p>
				{/if}
				{#if changing}
					<button type="button" class="link" on:click={() => (changing = false)}
						>No cambiar el lugar</button
					>
				{/if}

				{#if creating}
					<div class="create" id="{idPrefix}-venue-create">
						<label class="field">
							<span>Nombre del lugar nuevo <span class="req">*</span></span>
							<input bind:value={newName} maxlength="200" placeholder="Ej: Sala Inventada" />
						</label>
						<label class="field">
							<span>Dirección</span>
							<input bind:value={newAddress} maxlength="500" placeholder="Calle 123" />
						</label>
						<div class="listing" role="radiogroup" aria-label="En Amigues">
							{#each LISTINGS as l (l)}
								<label class="check">
									<input
										type="radio"
										name="{idPrefix}-venue-listing"
										value={l}
										bind:group={newListing}
									/>
									{VENUE_LISTING_LABELS[l].one}
									{#if l === 'unlisted'}<small>(no aparece en Amigues)</small>{/if}
								</label>
							{/each}
						</div>
						<small
							>Se crea aprobado. No listado no lo esconde del evento: la página del evento lo
							muestra según el nivel que elijas después. Lo demás (barrio, mapa, accesibilidad) lo
							completás en su página.</small
						>
						{#if createError}<p class="error" role="alert">{createError}</p>{/if}
						<div class="actions">
							<button
								type="button"
								class="button secondary"
								disabled={createBusy || !newName.trim()}
								on:click={createVenue}>{createBusy ? 'Creando…' : 'Crear y elegir'}</button
							>
							<button type="button" class="link" on:click={() => (creating = false)}
								>Cancelar</button
							>
						</div>
					</div>
				{:else}
					<button
						type="button"
						class="link"
						id="{idPrefix}-venue-new"
						on:click={() => {
							creating = true;
							newName = newName || query.trim();
						}}>+ Crear lugar</button
					>
				{/if}
			</div>
		{/if}
	{/if}

	{#if chosen || missing}
		<details class="free-text">
			<summary>Usar texto libre en vez de un lugar</summary>
			<p class="hint">
				Mientras haya un lugar elegido, la página del evento muestra el lugar y no este texto (se
				guarda igual en el archivo). Para usar el texto, sacá el lugar.
				<button type="button" class="link" on:click={unlink}>Sacar lugar</button>
			</p>
			<FieldGrid {fields} {idFor} {errors} bind:values />
		</details>
	{:else}
		{#if picker}<p class="hint or">
				O escribí el «Dónde» en texto libre (un lugar de una sola vez):
			</p>{/if}
		<FieldGrid {fields} {idFor} {errors} bind:values />
	{/if}
</fieldset>

<style>
	.block {
		display: block;
	}
	.chosen,
	.search,
	.create {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	.chosen {
		background: var(--surface-2, #f6f0f8);
		border-radius: 1em;
		padding: 0.6em 0.9em;
	}
	.name {
		margin: 0;
	}
	.mark {
		display: inline-block;
		margin-left: 0.4em;
		padding: 0 0.5em;
		border-radius: 1em;
		font-size: var(--step--1);
		background: var(--4-light, #fff3c4);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1em;
		align-items: center;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		max-height: 18em;
		overflow: auto;
	}
	/* Borde (no `outline`): la lista scrollea (`overflow: auto`) y recortaba el outline, que va por
	   afuera del botón, así que de cada fila se veían solo las esquinas redondeadas. El fondo es
	   el de las cajas suaves, para que la fila se distinga de la tarjeta. */
	.option {
		width: 100%;
		text-align: left;
		font: inherit;
		background: var(--surface-2, #f6f0f8);
		border: 1px solid var(--1-light, #ddd);
		border-radius: 0.8em;
		padding: 0.45em 0.8em;
		min-height: 2.75rem;
		cursor: pointer;
		color: inherit;
	}
	.option:hover,
	.option[aria-pressed='true'] {
		border-color: var(--accent, var(--1));
		box-shadow: inset 0 0 0 1px var(--accent, var(--1));
	}
	.option:focus-visible {
		outline-offset: -3px;
	}
	.quick-edit {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5em;
	}
	.quick-edit > :not(label) {
		grid-column: 1 / -1;
	}
	@media (max-width: 540px) {
		.quick-edit {
			grid-template-columns: 1fr;
		}
	}
	.listing {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em 1.2em;
	}
	.create {
		border-top: 1px solid var(--line, rgba(0, 0, 0, 0.08));
		padding-top: 0.6em;
	}
	.free-text summary {
		cursor: pointer;
		color: var(--2-dark);
		font-size: var(--step--1);
		min-height: 2rem;
	}
	.free-text[open] summary {
		margin-bottom: 0.5em;
	}
	.or {
		margin-top: 0.3em;
	}
</style>
