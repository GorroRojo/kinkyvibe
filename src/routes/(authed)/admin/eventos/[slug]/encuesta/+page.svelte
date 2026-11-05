<script>
	/**
	 * Ficha del evento › Mails › Encuesta (docs/formularios.md): prenderla o apagarla para este
	 * evento, cuándo sale, cómo va y el mail. Solo piezas compartidas del panel.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { Inbox, Pencil } from '@lucide/svelte';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { Button, Card, Notice, Switch } from '$lib/components/ui';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {any} */
	export let form;

	let on = data.on;
	/** @type {'' | 'saving' | 'saved' | 'error'} */
	let status = '';
	/** @type {HTMLFormElement} */
	let toggle;
	/** @param {number} n @param {string} one @param {string} many */
	const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
	$: srcdoc = data.mail.html;
</script>

<div class="kv-stack encuesta">
	<Card title="Encuesta de después del evento">
		<form
			bind:this={toggle}
			method="POST"
			action="?/setOpen"
			use:enhance={() => {
				status = 'saving';
				return async ({ result, update }) => {
					status = result.type === 'success' ? 'saved' : 'error';
					if (result.type !== 'success') on = data.on;
					await update({ reset: false });
				};
			}}
		>
			<Switch
				name="open"
				bind:checked={on}
				label="Mandar la encuesta un día después del evento"
				onLabel="Se manda"
				offLabel="Apagada para este evento"
				{status}
				error={form?.open?.message ?? ''}
				on:change={() => toggle.requestSubmit()}
			/>
		</form>
		{#if data.cancelled}
			<Notice tone="warn" compact role={null}>El evento está cancelado: la encuesta no sale.</Notice
			>
		{:else if data.due === null}
			<p class="kv-note">El evento no tiene fecha: no se sabe cuándo sale.</p>
		{:else if !on}
			<p class="kv-note">Este evento no la manda.</p>
		{:else if data.late}
			<p class="kv-note">
				Ya pasó el plazo: salía el {fmtDateTime(data.due)} y no se manda más de 3 días tarde.
			</p>
		{:else if data.started}
			<p class="kv-note">Está saliendo desde el {fmtDateTime(data.due)}, en tandas.</p>
		{:else}
			<p class="kv-note">
				Sale el {fmtDateTime(data.due)} a quienes tengan una compra confirmada, con un link personal que
				sirve una vez.
			</p>
		{/if}
		<p>
			Le llegó a {count(data.stats.sent, 'persona', 'personas')}{#if data.stats.pending}
				· por salir: {data.stats.pending}{/if}{#if data.stats.failed}
				· fallaron: {data.stats.failed}{/if}. {count(data.responses, 'respuesta', 'respuestas')}.
		</p>
		<div class="kv-row">
			<form method="POST" action="?/edit" use:enhance>
				<Button type="submit" variant="secondary" icon={Pencil}>Ver y editar las preguntas</Button>
			</form>
			{#if data.survey}
				<Button
					variant="secondary"
					icon={Inbox}
					href="/admin/comunidad/formularios/{data.survey.id}/respuestas">Ver las respuestas</Button
				>
			{/if}
		</div>
		<p class="kv-note">
			Es anónima por defecto: no se guarda quién contestó. Las respuestas las ven les admins y les
			organizadores del evento.
		</p>
	</Card>

	<Card title="Así se ve el mail">
		<p class="kv-note">Asunto: <strong>{data.mail.subject}</strong></p>
		<iframe title="Vista previa del mail de la encuesta" sandbox="" {srcdoc}></iframe>
	</Card>
</div>

<style>
	.encuesta {
		max-width: 48rem;
	}
	iframe {
		width: 100%;
		height: 34rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		background: white;
	}
</style>
