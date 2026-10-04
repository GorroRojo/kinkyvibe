<script>
	import { argDateLog } from '$lib/utils/dates.js';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { enhance } from '$app/forms';
	import { Check, Send, X } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import DeleteLink from '$lib/components/admin/panel/DeleteLink.svelte';
	import ConfirmDraft from '$lib/components/admin/agenda/ConfirmDraft.svelte';
	import { eventHref } from '$lib/admin/nav.js';
	import { describeSchedule } from '$lib/utils/eventDraft.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** `stream`: lo que devuelven las actions del link (la de «Confirmar» no lo trae). */
	/** @type {import('./$types').ActionData & { stream?: any }} */
	export let form;

	$: e = data.event;
	$: done = data.checklist.filter((c) => c.ok).length;
	let confirming = false;

	/** @param {number} ms */
	function time(ms) {
		return argDateLog(ms);
	}
	/** @param {number} n */
	const people = (n) => (n === 1 ? '1 persona' : `${n} personas`);
</script>

<svelte:head><title>{e.title} · Panel</title></svelte:head>

{#if form?.confirm}
	<p class="flash" class:error={!form.confirm.ok} role="status">{form.confirm.message}</p>
{/if}
{#if data.draft && !form?.confirm?.ok}
	<form
		class="confirm"
		method="POST"
		action="?/confirmar"
		use:enhance={() => {
			confirming = true;
			return async ({ update }) => {
				await update();
				confirming = false;
			};
		}}
	>
		<ConfirmDraft
			missing={data.missing}
			busy={confirming}
			submit
			editHref={eventHref(e.slug, 'editar')}
		/>
	</form>
{/if}

<div class="grid">
	<Card title="Checklist">
		<p class="muted small">{done} de {data.checklist.length} listos</p>
		<ul class="checklist">
			{#each data.checklist as c (c.id)}
				<li class:ok={c.ok}>
					<span class="mark" aria-hidden="true">
						{#if c.ok}<Check size={16} strokeWidth={3} />{:else}<X size={16} strokeWidth={3} />{/if}
					</span>
					<div>
						<strong>{c.label}</strong><span class="sr-only">: {c.ok ? 'listo' : 'falta'}</span>
						<p>
							{c.detail}
							{#if c.href}<a href={eventHref(e.slug, c.href)}>Arreglarlo</a>{/if}
						</p>
					</div>
				</li>
			{/each}
		</ul>
	</Card>

	<Card title="Datos">
		<dl class="kv">
			<dt>Cuándo</dt>
			<dd class="first-up">{describeSchedule(e.start, e.end) || 'Sin fecha'}</dd>
			<dt>Lugar</dt>
			{#if data.venue}
				<dd id="venue-row">
					<a href="/admin/comunidad/perfiles/{data.venue.slug}">{data.venue.title}</a>
					<small class="muted block">Se muestra: {data.venue.privacy}</small>
					<a class="small-link" href="{eventHref(e.slug, 'editar')}#sec-lugar">Cambiar</a>
				</dd>
				{#if e.locationName || e.location}<dt>Texto libre</dt>
					<dd>
						{[e.locationName, e.location].filter(Boolean).join(' — ')}
						<small class="muted block"
							>{data.venue.flagOn
								? 'No se muestra: manda el lugar.'
								: 'Se muestra hasta que se prenda «Perfiles públicos».'}</small
						>
					</dd>{/if}
			{:else}
				<dd id="venue-row">
					{e.locationName || '—'}
					<a class="small-link" href="{eventHref(e.slug, 'editar')}#sec-lugar">Elegir un lugar</a>
				</dd>
				{#if e.location}<dt>Dirección</dt>
					<dd>{e.location}</dd>{/if}
			{/if}
			<dt>Región</dt>
			<dd>{e.place || '—'}</dd>
			<dt>Organizan</dt>
			<dd>{e.authors.join(', ') || '—'}</dd>
			{#if e.link}<dt>Link</dt>
				<dd><a href={e.link} target="_blank" rel="noreferrer">{e.link}</a></dd>{/if}
			{#if e.summary}<dt>Resumen</dt>
				<dd>{e.summary}</dd>{/if}
			<dt>Archivo</dt>
			<dd><code>calendario/{e.slug}.md</code></dd>
		</dl>
		<p><a class="kv-btn ghost" href={eventHref(e.slug, 'editar')}>Editar los datos</a></p>
	</Card>

	{#if data.online && e.sellsTickets}
		<section class="stream" aria-label="Link de la transmisión">
			<Card title="Link de la transmisión" tag="div">
				<p class="muted small">
					Evento online: las entradas llevan este link en lugar de un QR (no hay control de
					ingreso). El link no está en el repo: se guarda solo acá. Si lo cargás antes de que
					alguien compre, le llega en el mail de las entradas.
				</p>
				{#if form?.stream}
					<p class="flash" class:error={!form.stream.ok} role="status">{form.stream.message}</p>
				{/if}
				{#if data.stream}
					<form method="POST" action="?/setLink" use:enhance class="stream-form">
						<label>
							<span>Link (https://…)</span>
							<input
								type="text"
								inputmode="url"
								name="link"
								value={form?.stream && 'value' in form.stream
									? form.stream.value
									: (data.stream.link ?? '')}
								placeholder="https://…"
								autocomplete="off"
								spellcheck="false"
							/>
						</label>
						<button type="submit" class="kv-btn">Guardar link</button>
					</form>
					{#if data.stream.link}
						<p class="muted small">
							Guardado {data.stream.updatedAt ? time(data.stream.updatedAt) : ''}{data.stream
								.updatedBy
								? ` por ${data.stream.updatedBy}`
								: ''}. Ya lo tienen {data.stream.approvedOrders - data.stream.pending} de {data
								.stream.approvedOrders}
							{data.stream.approvedOrders === 1 ? 'compra' : 'compras'}.
						</p>
						<form
							method="POST"
							action="?/sendLink"
							use:enhance={async ({ cancel }) => {
								if (
									data.stream?.pending &&
									!(await askConfirm({
										title: `¿Mandar el link por mail a ${people(data.stream.pending)}?`,
										confirmLabel: 'Mandar'
									}))
								)
									cancel();
							}}
						>
							<button type="submit" class="kv-btn send-link" disabled={!data.stream.pending}>
								{#if data.stream.pending}<Send size={16} aria-hidden="true" />{/if}
								{data.stream.pending
									? `Enviar el link a todes (${people(data.stream.pending)})`
									: '✓ Todes ya recibieron este link'}
							</button>
						</form>
						<p class="muted small">
							Solo le escribe a quien todavía no recibió este link (tocarlo dos veces no manda nada
							de nuevo). Si cambiás el link, se puede mandar el nuevo a todes. Manda de a tandas (<a
								href="/admin/ajustes/mails">Ajustes → Mails</a
							>): si son muches, el resto sale solo en las próximas vueltas del cron.
						</p>
					{/if}
				{:else}
					<p class="flash error">No se pudo leer la base de datos.</p>
				{/if}
			</Card>
		</section>
	{/if}
</div>

<DeleteLink kind="calendario" slug={e.slug} label="Borrar evento…" />

<style>
	.confirm {
		margin-bottom: 1rem;
	}
	.flash[role='status'] {
		margin-bottom: 1rem;
	}
	.grid {
		display: grid;
		gap: var(--space-xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		align-items: start;
	}
	.small {
		font-size: var(--text-xs);
		margin: 0;
	}
	.checklist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.checklist li {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
	}
	.checklist p {
		margin: 0.1rem 0 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--warn-bg);
		color: var(--warn);
	}
	.ok .mark {
		background: var(--ok-bg);
		color: var(--ok);
	}
	.kv {
		display: grid;
		grid-template-columns: 6.5rem minmax(0, 1fr);
		gap: 0.4rem var(--space-xs);
		margin: 0;
	}
	.kv dt {
		color: var(--muted);
	}
	.kv dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.block {
		display: block;
	}
	.small-link {
		font-size: var(--text-xs);
	}
	.first-up::first-letter {
		text-transform: uppercase;
	}
	.flash {
		background: var(--ok-bg);
		color: var(--text);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		margin: 0;
	}
	.flash.error {
		background: var(--error-bg);
		color: var(--error);
	}
	.stream-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: flex-end;
	}
	.stream-form label {
		flex: 1 1 14rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.stream-form input {
		padding: var(--space-2xs) var(--space-xs);
		min-height: 2.75rem;
		box-sizing: border-box;
		border-radius: 3em;
		border: 1px solid var(--field);
		background: var(--surface);
		min-width: 0;
	}
	.send-link {
		width: 100%;
		justify-content: center;
		white-space: normal;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
