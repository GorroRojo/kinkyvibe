<script>
	/**
	 * Formulario del panel para un perfil guardado en la base (persona, proyecto o lugar). Guarda al
	 * toque (sin PRs). Si alguien guardó mientras se editaba, el servidor no guarda nada y devuelve
	 * `conflict`: acá se muestra qué cambió, con lo escrito intacto en el formulario y la versión
	 * nueva, para guardar encima a propósito.
	 *
	 * Props: `values` (ProfileFormValues de src/lib/server/amigues/editor.js), `errors` (por campo),
	 * `conflict` ({ version, changes: [{ field, label, theirs }] }), `action` (form action),
	 * `submitLabel`, `kinds` (tipos que se pueden elegir).
	 */
	import { enhance } from '$app/forms';
	import { KIND_LABELS, VISIBILITY_OPTIONS } from '$lib/utils/perfiles.js';
	import { VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';
	import VenueCoordinates from '$lib/components/amigues/VenueCoordinates.svelte';

	/** @type {import('$lib/server/amigues/editor.js').ProfileFormValues} */
	export let values;
	/** @type {Record<string, string>} */
	export let errors = {};
	/** @type {{ version: number, changes: { field: string, label: string, theirs: string }[] } | null} */
	export let conflict = null;
	export let action = '?/guardar';
	export let submitLabel = 'Guardar';
	/** @type {Record<string, string>} */
	export let kinds = KIND_LABELS;

	let busy = false;
	$: kind = values.kind;
	$: version = conflict ? conflict.version : values.version;

	/** @param {string} key */
	const err = (key) => errors?.[key];
</script>

{#if conflict}
	<div class="kv-flash warn conflict" role="alert">
		<p>
			Alguien más guardó cambios mientras editabas, así que no guardamos los tuyos. Tus cambios
			siguen abajo. Si querés quedarte con tu versión, revisá esto y volvé a guardar.
		</p>
		{#if conflict.changes.length}
			<ul>
				{#each conflict.changes as c (c.field)}
					<li><strong>{c.label}</strong>: ahora dice <q>{c.theirs || '(vacío)'}</q></li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<form
	method="POST"
	{action}
	class="kv-form"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<input type="hidden" name="version" value={version} />

	<div class="kv-grid-2">
		<label class="kv-field">
			<span>Nombre</span>
			<input
				name="title"
				required
				maxlength="200"
				bind:value={values.title}
				aria-invalid={Boolean(err('title'))}
			/>
			{#if err('title')}<small class="kv-error">{err('title')}</small>{/if}
		</label>
		<label class="kv-field">
			<span>Tipo</span>
			<select name="kind" bind:value={values.kind} aria-invalid={Boolean(err('kind'))}>
				{#each Object.entries(kinds) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
			{#if err('kind')}<small class="kv-error">{err('kind')}</small>{/if}
		</label>
	</div>

	<fieldset class="kv-field">
		<span>Quién lo puede ver</span>
		{#each VISIBILITY_OPTIONS as o (o.value)}
			<label class="kv-check">
				<input type="radio" name="visibility" value={o.value} bind:group={values.visibility} />
				{o.label} <small>{o.hint}</small>
			</label>
		{/each}
	</fieldset>

	<label class="kv-field">
		<span>Presentación (resumen)</span>
		<textarea name="bio" rows="3" maxlength="1000" bind:value={values.text.bio}></textarea>
		{#if err('bio')}<small class="kv-error">{err('bio')}</small>{/if}
	</label>

	<div class="kv-grid-2">
		<label class="kv-field">
			<span>Pronombres</span>
			<input
				name="pronouns"
				maxlength="40"
				bind:value={values.text.pronouns}
				placeholder="elle/ella"
			/>
			{#if err('pronouns')}<small class="kv-error">{err('pronouns')}</small>{/if}
		</label>
		<label class="kv-field">
			<span>Link de pronombres</span>
			<input
				name="pronouns_url"
				bind:value={values.text.pronouns_url}
				placeholder="https://pronombr.es/elle"
			/>
			{#if err('pronouns_url')}<small class="kv-error">{err('pronouns_url')}</small>{/if}
		</label>
	</div>

	<div class="kv-grid-2">
		<label class="kv-field">
			<span>Links (uno por línea; el primero es el botón)</span>
			<textarea name="links" rows="3" bind:value={values.lists.links}></textarea>
			{#if err('links')}<small class="kv-error">{err('links')}</small>{/if}
		</label>
		<label class="kv-field">
			<span>Texto del botón</span>
			<input
				name="link_text"
				maxlength="80"
				bind:value={values.text.link_text}
				placeholder="Ir a su página"
			/>
		</label>
	</div>

	<div class="kv-grid-2">
		<label class="kv-field">
			<span>Etiquetas (una por línea o separadas por comas)</span>
			<textarea name="tags" rows="3" bind:value={values.lists.tags}></textarea>
			{#if err('tags')}<small class="kv-error">{err('tags')}</small>{/if}
		</label>
		<label class="kv-field">
			<span>Autores (una por línea)</span>
			<textarea name="authors" rows="3" bind:value={values.lists.authors}></textarea>
		</label>
	</div>

	<label class="kv-field">
		<span>Texto de la página</span>
		<textarea name="body" rows="12" class="mono" bind:value={values.text.body}></textarea>
		<small
			>Markdown, como en las fichas: **negrita**, [links](https://…), @menciones y [[wiki]]. HTML
			permitido: una lista corta (sin estilos ni scripts).</small
		>
		{#if err('body')}<small class="kv-error">{err('body')}</small>{/if}
	</label>

	{#if kind === 'proyecto'}
		<label class="kv-check">
			<input type="checkbox" name="show_members" bind:checked={values.show_members} />
			Mostrar integrantes (solo los que aceptaron y se pueden ver)
		</label>
	{/if}

	{#if kind === 'lugar'}
		<fieldset class="venue">
			<legend>Lugar</legend>
			<div class="kv-grid-2">
				<label class="kv-field">
					<span>Dirección</span>
					<input name="address" maxlength="300" bind:value={values.text.address} />
					{#if err('address')}<small class="kv-error">{err('address')}</small>{/if}
				</label>
				<label class="kv-field">
					<span>Barrio</span>
					<input name="area" maxlength="100" bind:value={values.text.area} />
				</label>
				<label class="kv-field">
					<span>Ciudad</span>
					<input name="city" maxlength="100" bind:value={values.text.city} />
				</label>
				<label class="kv-field">
					<span>Privacidad de la dirección (por defecto)</span>
					<select name="venue_privacy" bind:value={values.venue_privacy}>
						<option value="">Sin elegir (dirección completa)</option>
						{#each Object.entries(VENUE_PRIVACY_LABELS) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
					<small
						>Si no elegís, se muestra la dirección completa. Cada evento la puede cambiar. Quien
						compra entrada recibe siempre la dirección.</small
					>
				</label>
			</div>
			<VenueCoordinates
				bind:lat={values.lat}
				bind:lng={values.lng}
				{errors}
				gridClass="kv-grid-2"
				fieldClass="kv-field"
				errorClass="kv-error"
				noteClass="kv-note"
			/>
			<label class="kv-field">
				<span>Cómo llegar</span>
				<textarea name="how_to_get_there" rows="3" bind:value={values.text.how_to_get_there}
				></textarea>
			</label>
			<label class="kv-field">
				<span>Accesibilidad</span>
				<textarea name="accessibility" rows="3" bind:value={values.text.accessibility}></textarea>
			</label>
		</fieldset>
	{/if}

	<details class="contact">
		<summary>Contacto y otros datos de la ficha</summary>
		<p class="kv-note">
			Los cargó cada amigue en su ficha pública. La página no los muestra (como antes).
		</p>
		<div class="kv-grid-2">
			<label class="kv-field"
				><span>Mail</span><input name="email" bind:value={values.text.email} /></label
			>
			<label class="kv-field"
				><span>Teléfono</span><input name="tel" bind:value={values.text.tel} /></label
			>
			<label class="kv-field"
				><span>Cumpleaños</span><input name="bday" bind:value={values.text.bday} /></label
			>
			<label class="kv-field"
				><span>Identidad de género</span><input
					name="gender_identity"
					bind:value={values.text.gender_identity}
				/></label
			>
			<label class="kv-field"
				><span>Ocupación</span><input name="job_title" bind:value={values.text.job_title} /></label
			>
		</div>
	</details>

	<label class="kv-check">
		<input type="checkbox" name="unlisted" bind:checked={values.unlisted} />
		No listar en /amigues (se puede abrir con el link)
	</label>

	{#if err('form')}<p class="kv-flash bad">{err('form')}</p>{/if}

	<div class="kv-row">
		<button class="kv-btn" type="submit" disabled={busy}>{busy ? 'Guardando…' : submitLabel}</button
		>
		<slot name="actions" />
	</div>
</form>

<style>
	.conflict ul {
		margin: 0.4rem 0 0;
		padding-left: 1.2rem;
		font-weight: 400;
	}
	.conflict p {
		margin: 0;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	.venue {
		border: 1px solid var(--field);
		border-radius: 1em;
		padding: 1rem;
		display: grid;
		gap: 1rem;
	}
	.venue legend {
		font-weight: 700;
		padding: 0 0.4rem;
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-size: 0.9rem;
	}
	.contact summary {
		cursor: pointer;
		font-weight: 700;
	}
	.contact[open] {
		display: grid;
		gap: 0.8rem;
	}
</style>
