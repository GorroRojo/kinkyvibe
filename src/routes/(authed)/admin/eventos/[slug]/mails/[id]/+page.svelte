<script>
	/**
	 * Plantilla de un mail solo para este evento (pestaña Mails › Plantillas de la ficha). El
	 * editor y la vista previa están en MailTemplateEditor; acá lo vacío = la plantilla general.
	 */
	import { page } from '$app/stores';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import MailTemplateEditor from '$lib/components/admin/MailTemplateEditor.svelte';

	export let data;
	export let form;

	$: slug = encodeURIComponent($page.params.slug ?? '');
	// Taller con una sola entrada: el recordatorio sale una vez por parte; la vista previa, la elegida.
	let part = data.parts[0]?.slug ?? '';
	$: query = part && part !== data.parts[0]?.slug ? `?parte=${encodeURIComponent(part)}` : '';
</script>

<section class="head">
	<a class="back" href="/admin/eventos/{slug}/mails">← Plantillas del evento</a>
	<h2>
		{data.def.label}
		{#if data.saved}<Badge tone="info">propio de este evento</Badge>{:else if data.hasGeneral}<Badge
				>plantilla general</Badge
			>{:else}<Badge>original</Badge>{/if}
	</h2>
	<p class="muted">{data.def.when}</p>
	{#if data.parts.length}
		<label class="part">
			Parte
			<select bind:value={part}>
				{#each data.parts as p (p.slug)}
					<option value={p.slug}>{p.label}</option>
				{/each}
			</select>
		</label>
	{/if}
</section>

{#if !data.dbAvailable}
	<p class="kv-flash bad">No hay base de datos disponible: se usan los textos de siempre.</p>
{/if}

<MailTemplateEditor
	def={data.def}
	limits={data.limits}
	mode="event"
	saved={data.saved}
	inherited={data.inherited}
	recipients={data.recipients}
	{form}
	previewUrl="/admin/eventos/{slug}/mails/{data.def.id}/vista-previa{query}"
	resetLabel="Volver a la plantilla general"
	resetConfirm="¿Sacar lo propio de este evento y volver a la plantilla general?"
/>

<style>
	.head h2 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
		margin: 0.3rem 0 0.2rem;
	}
	.head p {
		margin: 0;
	}
	.back {
		font-size: var(--text-sm);
	}
	.part {
		display: inline-flex;
		gap: var(--space-2xs);
		align-items: center;
		margin-top: var(--space-2xs);
	}
</style>
