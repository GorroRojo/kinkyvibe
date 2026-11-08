<script>
	/**
	 * Ficha del evento › Mails › Encuesta (docs/formularios.md): prenderla o apagarla para este
	 * evento, cuándo sale, cómo va, su mail (con vista previa) y borrarla. Links a todos los
	 * formularios y a «Cómo salen por defecto». Solo piezas compartidas del panel.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { ClipboardList, Inbox, Pencil, SlidersHorizontal, Trash2 } from '@lucide/svelte';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import FormMailEditor from '$lib/components/admin/forms/FormMailEditor.svelte';
	import { Button, Card, Notice, Switch } from '$lib/components/ui';
	import { AUDIENCE_LABELS, PRIVACY_LABELS } from '$lib/utils/formularios.js';

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
	$: mail = form?.mail ?? null;
</script>

<div class="kv-stack encuesta">
	<Card title="Encuesta de después del evento">
		{#if data.deleted}
			<Notice tone="warn" compact role={null}
				>La encuesta de este evento está borrada: no sale. La recuperás (con sus respuestas) desde <a
					href="/admin/ajustes/actividad">Ajustes › Actividad</a
				>.</Notice
			>
		{:else}
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
					label="Mandar la encuesta {data.delayText}"
					onLabel="Se manda"
					offLabel="Apagada para este evento"
					{status}
					error={form?.open?.message ?? ''}
					on:change={() => toggle.requestSubmit()}
				/>
			</form>
			{#if data.cancelled}
				<Notice tone="warn" compact role={null}
					>El evento está cancelado: la encuesta no sale.</Notice
				>
			{:else if data.due === null}
				<p class="kv-note">El evento no tiene fecha: no se sabe cuándo sale.</p>
			{:else if !on}
				<p class="kv-note">Este evento no la manda.</p>
			{:else if data.before}
				<p class="kv-note">
					No sale: tocaba el {fmtDateTime(data.due)}, antes de que se prendieran los formularios.
				</p>
			{:else if data.started}
				<p class="kv-note">
					Está saliendo desde el {fmtDateTime(data.due)}, en tandas. Sale aunque sea tarde.
				</p>
			{:else}
				<p class="kv-note">
					Sale el {fmtDateTime(data.due)} a quienes tengan una compra confirmada, con un link personal
					que sirve una vez.
				</p>
			{/if}
			<p>
				Le llegó a {count(data.stats.sent, 'persona', 'personas')}{#if data.stats.pending}
					· por salir: {data.stats.pending}{/if}{#if data.stats.failed}
					· fallaron: {data.stats.failed}{/if}. {count(data.responses, 'respuesta', 'respuestas')}.
			</p>
			<div class="kv-row">
				<form method="POST" action="?/edit" use:enhance>
					<Button type="submit" variant="secondary" icon={Pencil}>Ver y editar las preguntas</Button
					>
				</form>
				{#if data.survey}
					<Button
						variant="secondary"
						icon={Inbox}
						href="/admin/comunidad/formularios/{data.survey.id}/respuestas"
						>Ver las respuestas</Button
					>
				{/if}
			</div>
			<p class="kv-note">
				Privacidad: {PRIVACY_LABELS[data.privacy]}. Ven las respuestas: {AUDIENCE_LABELS[
					data.audience
				].toLowerCase()}.
			</p>
		{/if}
		<p class="kv-note more">
			<a href="/admin/comunidad/formularios"
				><ClipboardList size={16} aria-hidden="true" /> Todos los formularios</a
			>
			<a href="/admin/comunidad/formularios/por-defecto"
				><SlidersHorizontal size={16} aria-hidden="true" /> Cómo salen por defecto</a
			>
		</p>
	</Card>

	{#if !data.deleted}
		<Card title="El mail de la encuesta">
			<p class="kv-note">Solo para este evento. Vacío, va el de «Cómo salen por defecto».</p>
			<FormMailEditor
				subject={mail?.subject ?? data.survey?.mailSubject ?? ''}
				body={mail?.body ?? data.survey?.mailBody ?? ''}
				fallbackSubject={data.fallback.subject}
				fallbackBody={data.fallback.body}
				kind="survey"
				idPrefix="encuesta-mail"
				preview={mail?.preview ?? data.mail}
				errors={mail?.errors ?? {}}
				message={mail?.message ?? ''}
				ok={mail?.ok ?? true}
			/>
		</Card>

		{#if data.survey}
			<form
				class="remove"
				method="POST"
				action="?/delete"
				use:enhance={async ({ cancel }) => {
					const ok = await askConfirm({
						title: '¿Borrar la encuesta de este evento?',
						text: 'Deja de salir para este evento. Las respuestas no se pierden: la recuperás con todo desde Ajustes › Actividad.',
						confirmLabel: 'Borrar',
						tone: 'danger'
					});
					if (!ok) return cancel();
				}}
			>
				<Button type="submit" variant="danger" size="small" icon={Trash2}>Borrar la encuesta</Button
				>
			</form>
		{/if}
	{/if}
</div>

<style>
	.encuesta {
		max-width: 48rem;
	}
	.more {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs) var(--space-s);
	}
	.more a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.remove {
		margin-top: var(--space-xs);
	}
</style>
