<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { RotateCcw } from '@lucide/svelte';
	import { fieldErrors } from '$lib/admin/ajustes.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { areaBackLink } from '$lib/admin/nav.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import { listPreview, sectionTexts, shortText, upcomingDescription } from '$lib/utils/seo.js';
	import { OG_CARDS, ogCardText } from '$lib/utils/ogCards.js';
	import { argDateTimeLong } from '$lib/utils/dates.js';

	export let data;
	export let form;

	$: errors = fieldErrors(form);

	/** Lo que está escrito en cada campo (lo guardado o el original). @type {Record<string, string>} */
	let values = {};
	/** @param {Record<string, string>} saved */
	const fromSaved = (saved) =>
		Object.fromEntries(data.fields.map((f) => [f.key, saved[f.key] ?? f.value]));
	$: values = form?.values ? { ...fromSaved(data.saved), ...form.values } : fromSaved(data.saved);

	/** @param {string} key */
	const original = (key) => data.fields.find((f) => f.key === key)?.value ?? '';
	$: changedCount = data.fields.filter((f) => (values[f.key] ?? '') !== f.value).length;

	/** Las páginas de la vista previa. */
	const PAGES = /** @type {const} */ ([
		{ id: 'home', label: 'Inicio', card: 'default', path: '/' },
		{ id: 'calendario', label: 'Calendario', card: 'calendario', path: '/calendario' },
		{ id: 'material', label: 'Material', card: 'material', path: '/material' },
		{ id: 'amigues', label: 'Amigues', card: 'amigues', path: '/amigues' },
		{ id: 'filtrada', label: 'Amigues · terapia', card: 'amigues', path: '/amigues?tags=terapia' },
		{ id: 'todo', label: 'Todo el contenido', card: 'default', path: '/todo' },
		{ id: 'wiki', label: 'Kinkipedia', card: 'wiki', path: '/wiki' }
	]);
	let pageId = 'calendario';
	$: shown = PAGES.find((p) => p.id === pageId) ?? PAGES[0];

	/** Dos eventos de ejemplo para la descripción del calendario. */
	const day = 24 * 3600 * 1000;
	const SAMPLE = [
		{ meta: { title: 'Taller de ejemplo', start: new Date(Date.now() + 3 * day).toISOString() } },
		{ meta: { title: 'Juntada de ejemplo', start: new Date(Date.now() + 9 * day).toISOString() } }
	];
	const FILTER = {
		tags: [{ id: 'terapia', name: 'terapia' }],
		text: '',
		kind: null,
		kindLabel: null
	};
	const NO_FILTER = { tags: [], text: '', kind: null, kindLabel: null };

	/**
	 * Título y descripción de la página elegida con lo que está escrito.
	 * @param {string} id
	 * @param {Record<string, string>} t
	 */
	function previewOf(id, t) {
		if (id === 'home') return { title: t['home.title'], description: t['home.description'] };
		if (id === 'wiki') return { title: t['wiki.title'], description: t['wiki.description'] };
		if (id === 'filtrada') return listPreview('amigues', FILTER, undefined, t);
		const section = /** @type {'calendario' | 'material' | 'amigues' | 'todo'} */ (id);
		const s = sectionTexts(section, t);
		const description =
			id === 'calendario'
				? upcomingDescription(SAMPLE, s.description, Date.now(), t['calendario.upcomingPrefix'])
				: s.description;
		return listPreview(section, NO_FILTER, { title: s.heading, description }, t);
	}
	$: preview = previewOf(shown.id, values);
	$: image = data.images?.[shown.card] || '/' + OG_CARDS[shown.card].file;
	$: cardWords = ogCardText(shown.card, values);
	$: cardSaved = ogCardText(shown.card, fromSaved(data.saved));
	$: cardChanged = cardWords.name !== cardSaved.name || cardWords.subtitle !== cardSaved.subtitle;
</script>

<PageHeader
	back={areaBackLink('ajustes-vistas-previas')}
	title="Vistas previas al compartir"
	subtitle="Lo que se ve cuando alguien pega un link del sitio en WhatsApp, Telegram, Instagram o X: el título, la descripción y lo que va escrito en la imagen."
/>

<div class="layout">
	<form
		class="kv-form settings"
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		{#if !data.dbAvailable}
			<p class="kv-flash bad">No hay base de datos disponible: se usan los textos originales.</p>
		{/if}
		{#if form?.message}
			<p class="kv-flash" role="status">{form.message}</p>
		{:else if form?.error}
			<p class="kv-flash bad" role="alert">{form.error}</p>
		{/if}
		<p class="kv-note">
			Cada campo trae el texto original; si lo cambiás, «Volver al original» lo deja como estaba (se
			aplica al guardar). Donde dice <code>{'{x}'}</code>, ahí va lo que cambia (la etiqueta o lo
			que se buscó), y tiene que quedar. Las imágenes se vuelven a dibujar solas al guardar, con las
			portadas de los próximos eventos.
			{#if data.updatedAt}
				Último cambio: {argDateTimeLong(data.updatedAt)}{data.updatedBy
					? `, por ${data.updatedBy}`
					: ''}.
			{/if}
		</p>

		{#each data.groups as group (group.id)}
			<Card title={group.label}>
				{#each data.fields.filter((f) => f.group === group.id) as field (field.key)}
					{@const changed = (values[field.key] ?? '') !== field.value}
					<div class="kv-field text-field">
						<label for={'f-' + field.key}>
							{field.label}
							{#if field.card}<span class="tag">en la imagen</span>{/if}
							{#if changed}<span class="tag changed">cambiado</span>{/if}
						</label>
						{#if field.max > 90}
							<textarea
								id={'f-' + field.key}
								name={field.key}
								rows="3"
								maxlength={field.max}
								bind:value={values[field.key]}
								aria-invalid={errors[field.key] ? 'true' : undefined}></textarea>
						{:else}
							<input
								id={'f-' + field.key}
								type="text"
								name={field.key}
								maxlength={field.max}
								autocomplete="off"
								bind:value={values[field.key]}
								aria-invalid={errors[field.key] ? 'true' : undefined}
							/>
						{/if}
						{#if errors[field.key]}<small class="kv-error field-error">{errors[field.key]}</small
							>{/if}
						<small class="kv-note">
							{#if field.help}{field.help}{/if}
							{(values[field.key] ?? '').length}/{field.max}.
						</small>
						{#if changed}
							<div class="original">
								<small class="kv-note">Original: «{field.value}»</small>
								<button
									type="button"
									class="kv-btn ghost small"
									on:click={() => (values = { ...values, [field.key]: original(field.key) })}
								>
									<RotateCcw size={14} aria-hidden="true" /> Volver al original
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</Card>
		{/each}

		<div class="actions">
			<button class="kv-btn" type="submit">Guardar</button>
			{#if changedCount}
				<button type="button" class="kv-btn ghost" on:click={() => (values = fromSaved({}))}>
					<RotateCcw size={16} aria-hidden="true" /> Volver todos al original
				</button>
				<span class="kv-note">{changedCount} cambiados.</span>
			{/if}
		</div>
	</form>

	<aside class="preview" aria-label="Vista previa">
		<Card title="Así se ve en WhatsApp">
			<label class="kv-field">
				<span>Página</span>
				<select bind:value={pageId}>
					{#each PAGES as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
				</select>
			</label>
			<div class="chat">
				<div class="bubble">
					<div class="wa-card">
						<img src={image} alt="" width="1200" height="630" />
						<div class="wa-text">
							<strong>{preview.title}</strong>
							<span>{shortText(preview.description)}</span>
							<small>kinkyvibe.ar</small>
						</div>
					</div>
					<p class="wa-link">https://kinkyvibe.ar{shown.path}</p>
				</div>
			</div>
			{#if cardChanged}
				<p class="kv-note">
					La imagen todavía dice «{[cardSaved.name, cardSaved.subtitle]
						.filter(Boolean)
						.join(' · ')}»: al guardar dice «{[cardWords.name, cardWords.subtitle]
						.filter(Boolean)
						.join(' · ')}».
				</p>
			{/if}
			<p class="kv-note">
				WhatsApp corta la descripción en unas dos líneas. Los eventos del calendario son de ejemplo.
			</p>
		</Card>
	</aside>
</div>

<style>
	.layout {
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 22rem;
			align-items: start;
		}
		.preview {
			position: sticky;
			top: 1rem;
		}
	}
	.text-field textarea,
	.text-field input {
		width: 100%;
	}
	.tag {
		display: inline-block;
		margin-inline-start: 0.4em;
		padding: 0 0.45em;
		border-radius: 999px;
		font-size: 0.75em;
		background: var(--surface-2, hsl(262 30% 92%));
		color: var(--text-2, inherit);
	}
	.tag.changed {
		background: hsl(50 100% 80%);
		color: hsl(50 100% 15%);
	}
	.original {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.chat {
		padding: 1rem;
		border-radius: 0.75rem;
		background: #efeae2;
	}
	.bubble {
		max-width: 20rem;
		margin-inline-start: auto;
		padding: 0.25rem;
		border-radius: 0.5rem;
		background: #d9fdd3;
		color: #111b21;
		box-shadow: 0 1px 0.5px rgb(0 0 0 / 0.13);
	}
	.wa-card {
		overflow: hidden;
		border-radius: 0.4rem;
		background: #d1f4cc;
	}
	.wa-card img {
		display: block;
		width: 100%;
		height: auto;
	}
	.wa-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.4rem 0.6rem 0.5rem;
		font-size: 0.8rem;
		line-height: 1.3;
	}
	.wa-text span {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		color: #3b4a54;
	}
	.wa-text small {
		color: #667781;
	}
	.wa-link {
		margin: 0.3rem 0.4rem 0.2rem;
		font-size: 0.8rem;
		color: #027eb5;
		overflow-wrap: anywhere;
	}
</style>
