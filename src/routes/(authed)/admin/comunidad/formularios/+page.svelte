<script>
	/**
	 * Comunidad › Formularios (docs/formularios.md): formularios propios, encuestas de los eventos y
	 * plantillas para copiar. Solo piezas compartidas del panel.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { ClipboardList, Copy, Eye, Inbox, Pencil, Plus, SlidersHorizontal } from '@lucide/svelte';
	import { fmtDate } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { Badge, Button, Card, EmptyState, Field, Notice } from '$lib/components/ui';
	import { ACCESS_LABELS, PRIVACY_LABELS } from '$lib/utils/formularios.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {any} */
	export let form;

	let title = '';
	/** @param {number} n @param {string} one @param {string} many */
	const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
</script>

<PageHeader
	title="Formularios"
	subtitle="Formularios propios, la encuesta de después de cada evento y plantillas para copiar."
>
	<svelte:fragment slot="actions">
		<Button
			variant="secondary"
			icon={SlidersHorizontal}
			href="/admin/comunidad/formularios/por-defecto">Cómo salen por defecto</Button
		>
	</svelte:fragment>
</PageHeader>

<div class="kv-stack formularios">
	{#if data.deleted}
		<Notice tone="ok" compact
			>Listo: se borró. Lo recuperás, con sus respuestas, desde <a href="/admin/ajustes/actividad"
				>Ajustes › Actividad</a
			>.</Notice
		>
	{/if}
	<div id="nuevo"></div>
	<Card title="Formulario nuevo">
		<form class="kv-row create" method="POST" action="?/create" use:enhance>
			<Field
				id="formulario-nuevo"
				label="Nombre"
				name="title"
				bind:value={title}
				placeholder="Ej.: Pedido de beca"
			/>
			<Button type="submit" icon={Plus}>Crear</Button>
		</form>
		<p class="kv-note">O empezá desde una plantilla (abajo).</p>
		{#if form?.create && !form.create.ok}
			<Notice tone="error" compact>{form.create.message}</Notice>
		{/if}
	</Card>

	<Card title="Formularios" icon={ClipboardList}>
		{#if data.forms.length === 0}
			<EmptyState
				icon={ClipboardList}
				title="Todavía no hay formularios"
				text="Creá uno o copiá una plantilla."
			/>
		{:else}
			<ul class="list">
				{#each data.forms as f (f.id)}
					<li>
						<div class="what">
							<a class="name" href="/admin/comunidad/formularios/{f.id}">{f.title}</a>
							<span class="meta">
								<Badge tone={f.open ? 'ok' : 'neutral'}>{f.open ? 'Abierto' : 'Cerrado'}</Badge>
								<Badge tone="info">{PRIVACY_LABELS[f.privacy]}</Badge>
								<Badge>{ACCESS_LABELS[f.access]}</Badge>
							</span>
							<small class="kv-note">
								kinkyvibe.ar{f.path} · {count(f.questions, 'pregunta', 'preguntas')} ·
								{count(f.responses, 'respuesta', 'respuestas')}{#if f.eventTitle}
									· {f.eventTitle}{/if}
							</small>
						</div>
						<span class="actions">
							<Button
								variant="secondary"
								size="small"
								icon={Pencil}
								href="/admin/comunidad/formularios/{f.id}">Editar</Button
							>
							<Button
								variant="secondary"
								size="small"
								icon={Inbox}
								href="/admin/comunidad/formularios/{f.id}/respuestas">Respuestas</Button
							>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<Card title="Encuestas de los eventos">
		<p class="kv-note">
			{data.surveyText} Se crea sola la primera vez (copiando la plantilla «¿Cómo la pasaste?») y cada
			evento la prende o la apaga en su ficha › Mails › Encuesta. Cómo sale se cambia en
			<a href="/admin/comunidad/formularios/por-defecto">Cómo salen por defecto</a>.
		</p>
		{#if data.surveys.length === 0}
			<p class="kv-note">Todavía ningún evento tiene encuesta.</p>
		{:else}
			<ul class="list">
				{#each data.surveys as f (f.id)}
					<li>
						<div class="what">
							<a class="name" href="/admin/comunidad/formularios/{f.id}">{f.eventTitle}</a>
							<span class="meta">
								<Badge tone={f.open ? 'ok' : 'neutral'}>{f.open ? 'Se manda' : 'Apagada'}</Badge>
								<Badge tone="info">{PRIVACY_LABELS[f.privacy]}</Badge>
							</span>
							<small class="kv-note"
								>{count(f.responses, 'respuesta', 'respuestas')} · cambiada el {fmtDate(
									f.updatedAt
								)}</small
							>
						</div>
						<span class="actions">
							<Button
								variant="secondary"
								size="small"
								icon={Inbox}
								href="/admin/comunidad/formularios/{f.id}/respuestas">Respuestas</Button
							>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<Card title="Plantillas">
		<p class="kv-note">
			Para copiar y editar. Cambiar una plantilla no cambia los formularios que ya se copiaron.
		</p>
		<ul class="list">
			{#each data.templates as f (f.id)}
				<li id={f.slug}>
					<div class="what">
						<span class="name">{f.title}</span>
						<span class="meta">
							<Badge tone="info">{PRIVACY_LABELS[f.privacy]}</Badge>
							<Badge>{ACCESS_LABELS[f.access]}</Badge>
						</span>
						<small class="kv-note">{count(f.questions, 'pregunta', 'preguntas')}</small>
					</div>
					<span class="actions">
						<form method="POST" action="?/copy" use:enhance>
							<input type="hidden" name="id" value={f.id} />
							<Button type="submit" size="small" icon={Copy}>Usar esta plantilla</Button>
						</form>
						<Button
							variant="secondary"
							size="small"
							icon={Eye}
							href="/admin/comunidad/formularios/{f.id}">Ver y editar</Button
						>
					</span>
				</li>
			{/each}
		</ul>
	</Card>
</div>

<style>
	.formularios {
		max-width: 56rem;
	}
	.create {
		align-items: flex-end;
	}
	.create :global(.kv-field) {
		flex: 1 1 16rem;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2xs) var(--space-xs);
		padding: var(--space-2xs) 0;
		border-top: 1px solid var(--line);
	}
	li:first-child {
		border-top: 0;
	}
	/* Desde el buscador («Plantilla: …»): la plantilla elegida, marcada. */
	li:target {
		background: var(--link-bg);
		border-radius: var(--radius-s);
		padding-inline: var(--space-2xs);
	}
	.what {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1 1 18rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.name {
		font-weight: 700;
	}
	.meta,
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
</style>
