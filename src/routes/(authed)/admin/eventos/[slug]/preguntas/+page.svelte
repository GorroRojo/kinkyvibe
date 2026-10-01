<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import SignupFieldForm from '$lib/components/admin/SignupFieldForm.svelte';
	import SignupFieldList from '$lib/components/admin/SignupFieldList.svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { FIELD_KIND_LABELS } from '$lib/utils/signupFields.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;
	$: chosen = new Set(data.chosen);
</script>

<svelte:head><title>Preguntas · {e.title} · Panel</title></svelte:head>

<div class="kv-stack preguntas">
	<p class="kv-note">
		Se preguntan al comprar o inscribirse, después de los datos de siempre. Las respuestas son datos
		de quien compra: se ven solo en <a href="/admin/eventos/{encodeURIComponent(e.slug)}/ordenes"
			>Órdenes</a
		> y en su CSV.
	</p>

	<Card title="Preguntas generales">
		<p class="kv-note">
			Las que se definen una vez en <a href="/admin/eventos/roles">Eventos › Roles y preguntas</a>.
			Marcá las que usa este evento.
		</p>
		{#if form?.general}
			<p class="kv-flash" class:bad={!form.general.ok} role="status">{form.general.message}</p>
		{/if}
		{#if data.general.length === 0}
			<p class="kv-note">Todavía no hay preguntas generales.</p>
		{:else}
			<form class="kv-form" method="POST" action="?/setGeneral" use:enhance>
				<ul class="general">
					{#each data.general as f (f.id)}
						<li>
							<label class="kv-check">
								<input type="checkbox" name="general" value={f.id} checked={chosen.has(f.id)} />
								<span>{f.label}</span>
								<Badge tone="neutral">{FIELD_KIND_LABELS[f.kind]}</Badge>
								{#if f.required}<Badge tone="info">obligatoria</Badge>{/if}
							</label>
						</li>
					{/each}
				</ul>
				<div class="kv-row"><button class="kv-btn" type="submit">Guardar elección</button></div>
			</form>
		{/if}
	</Card>

	<Card title="Preguntas de este evento">
		{#if form?.field?.message}
			<p class="kv-flash" class:bad={!form.field.ok} role="status">{form.field.message}</p>
		{/if}
		<SignupFieldList
			fields={data.own}
			csvName={csvFilename(e.slug, 'preguntas')}
			empty="Este evento no tiene preguntas propias."
		/>
		<h3>Agregar una pregunta</h3>
		<SignupFieldForm {form} idPrefix="evento" />
	</Card>
</div>

<style>
	.preguntas {
		max-width: 48rem;
	}
	.general {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.general .kv-check {
		flex-wrap: wrap;
	}
	h3 {
		margin: 1.2rem 0 0.5rem;
		font-size: 1rem;
	}
</style>
