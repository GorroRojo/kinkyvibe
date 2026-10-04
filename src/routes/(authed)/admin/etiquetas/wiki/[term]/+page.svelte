<script>
	/**
	 * Etiquetas › «Entrada de la Kinkipedia» de una etiqueta: título, resumen, autores, etiquetas
	 * y el texto de /wiki/<dirección>. Se guarda en la base al momento (sin GitHub). Ver
	 * +page.server.js.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { actorLabel } from '$lib/admin/cuentas.js';
	import { askConfirm } from '$lib/admin/confirm.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;

	$: tag = data.tag;
	// Después de un error, el formulario muestra lo que se había escrito.
	$: values = structuredClone(form?.wiki?.values ?? data.values);
	let busy = false;
	$: pageHref = `/wiki/${encodeURIComponent(tag.slug)}`;
</script>

<PageHeader
	title="Kinkipedia: {tag.key}"
	subtitle={pageHref}
	back={{ href: '/admin/etiquetas', label: 'Etiquetas' }}
>
	<svelte:fragment slot="meta">
		{#if !data.exists}<Badge tone="info">sin entrada todavía</Badge>{/if}
		{#if tag.hidden}<Badge tone="info">etiqueta oculta</Badge>{/if}
	</svelte:fragment>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href={pageHref} target="_blank" rel="noopener">Ver página</a>
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	{#if form?.wiki}
		<p class="kv-flash" class:bad={!form.wiki.ok} class:warn={form.wiki.conflict} role="status">
			{form.wiki.message}
		</p>
	{/if}

	<Card title="Entrada de la Kinkipedia">
		<p class="kv-note">
			Los cambios se publican al guardar. Última edición de la etiqueta: {fmtDateTime(
				tag.updatedAt
			)} por {actorLabel(tag.updatedBy)}. El nombre, las madres y la descripción corta de la
			etiqueta se cambian en <a href="/admin/etiquetas">Etiquetas</a>.
		</p>
		<form
			method="POST"
			action="?/guardar"
			class="kv-form"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<input type="hidden" name="version" value={values.version} />
			<label class="kv-field">
				<span>Título</span>
				<input name="title" maxlength="200" bind:value={values.title} placeholder={tag.key} />
			</label>
			<label class="kv-field">
				<span>Resumen</span>
				<textarea name="summary" rows="2" maxlength="1000" bind:value={values.summary}></textarea>
				<small>Aparece en el glosario de la Kinkipedia y en el buscador.</small>
			</label>
			<div class="kv-grid-2">
				<label class="kv-field">
					<span>Autores (una por línea)</span>
					<textarea name="authors" rows="3" bind:value={values.authors}></textarea>
				</label>
				<label class="kv-field">
					<span>Otras etiquetas (una por línea)</span>
					<textarea name="tags" rows="3" bind:value={values.tags}></textarea>
				</label>
			</div>
			<label class="kv-field">
				<span>Texto</span>
				<textarea name="body" rows="18" class="mono" bind:value={values.body}></textarea>
				<small
					>Markdown: ## títulos, **negrita**, _cursiva_, [links](https://…), @menciones y [[otra
					etiqueta]] para enlazar a la Kinkipedia.</small
				>
			</label>
			<div class="kv-row">
				<button class="kv-btn" type="submit" disabled={busy}>
					{busy ? 'Guardando…' : 'Guardar y publicar'}
				</button>
			</div>
		</form>
	</Card>

	{#if data.exists}
		<Card title="Sacar la entrada">
			<form
				method="POST"
				action="?/sacar"
				class="kv-row"
				use:enhance={async ({ cancel }) => {
					const ok = await askConfirm({
						title: 'Sacar la entrada de la Kinkipedia',
						text: `La página ${pageHref} vuelve a mostrar solo la etiqueta. El texto queda en el historial de la etiqueta.`,
						confirmLabel: 'Sacar la entrada',
						tone: 'danger'
					});
					if (!ok) cancel();
					return async ({ update }) => update({ reset: false });
				}}
			>
				<input type="hidden" name="version" value={values.version} />
				<span class="kv-note">La etiqueta queda; solo se saca su texto de la Kinkipedia.</span>
				<button class="kv-btn ghost danger small" type="submit">Sacar la entrada</button>
			</form>
		</Card>
	{/if}
</div>

<style>
	.mono {
		font-family: ui-monospace, monospace;
		font-size: var(--text-sm);
	}
</style>
