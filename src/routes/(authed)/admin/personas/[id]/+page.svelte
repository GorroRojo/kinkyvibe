<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { Check, Trash2 } from '@lucide/svelte';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { fmtDate, fmtDateTime } from '$lib/admin/format.js';
	import { formatARS } from '$lib/utils/money.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	export let data;
	export let form;

	$: p = data.person;
	/** @type {Record<string, string>} */
	const METHOD = {
		mercadopago: 'Mercado Pago',
		transferencia: 'Transferencia',
		gratis: 'Sin cargo'
	};
	let body = '';
</script>

<PageHeader
	title={p.names[0] ?? p.email}
	subtitle={p.pronouns.join(' · ')}
	back={{ href: '/admin/personas', label: 'Personas' }}
>
	<svelte:fragment slot="meta">
		{#if p.attended.length >= 2}<Badge tone="ok">vuelve</Badge>{/if}
		{#if p.attended.length === 1}<Badge tone="info">primera vez</Badge>{/if}
	</svelte:fragment>
	<p class="muted email"><a href="mailto:{p.email}">{p.email}</a></p>
	{#if p.names.length > 1}<p class="muted">También como: {p.names.slice(1).join(', ')}</p>{/if}
</PageHeader>

<div class="kv-stats">
	<Stat label="Vino a" value={p.attended.length} sub="de {p.bought.length} eventos comprados" />
	<Stat label="Gastado" value={formatARS(p.spent)} sub="{p.orders} compras" />
	<Stat
		label="No vino"
		value={p.noShows.length}
		tone={p.noShows.length ? 'warn' : ''}
		sub="eventos pasados sin check-in"
	/>
	<Stat
		label="Primera / última vez"
		value={p.firstVisit ? fmtDate(p.firstVisit) : '—'}
		sub={p.lastVisit ? `última: ${fmtDate(p.lastVisit)}` : 'todavía no vino'}
	/>
</div>

<div class="kv-grid-2 layout">
	<Card title="Compras y entradas">
		<ul class="orders">
			{#each data.orders as o (o.id)}
				<li>
					<div class="kv-row">
						<a class="event" href={eventPanelLink(o.slug, { tickets: true })}>{o.event}</a>
						{#if o.status === 'refunded'}<Badge tone="bad">reembolsada</Badge>{/if}
					</div>
					<small class="muted">
						{fmtDate(o.start)} · {o.reference} · {o.quantity} × {formatARS(o.total / o.quantity)}
						= <b>{formatARS(o.total)}</b> · {METHOD[o.method] ?? o.method} · comprada {fmtDateTime(
							o.createdAt
						)}
						{#if o.name !== p.names[0]}· a nombre de {o.name}{/if}
					</small>
					{#if o.tickets.length}
						<ul class="tickets">
							{#each o.tickets as t, i (i)}
								<li>
									{t.name}{#if t.pronouns}
										<span class="muted">({t.pronouns})</span>{/if}
									<code>{t.code}</code>
									{#if t.checkedInAt}
										<Badge tone="ok"
											><Check size={12} aria-hidden="true" /> entró {fmtDateTime(
												t.checkedInAt
											)}</Badge
										>
									{:else if o.start && Date.parse(o.start) < data.now && o.status === 'approved'}
										<Badge tone="warn">no entró</Badge>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</Card>

	<Card title="Notas internas">
		<p class="kv-note">
			Solo las ven les admins. Nada de datos sensibles (DNI, salud, etc.): alcanza con lo que ayude
			a recibir mejor a esta persona.
		</p>
		{#if form?.note}
			<p class="kv-flash" class:bad={!form.note.ok} role="status">{form.note.message}</p>
		{/if}
		<form
			class="kv-form"
			method="POST"
			action="?/addNote"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') body = '';
				}}
		>
			<label class="kv-field">
				<span>Nueva nota</span>
				<textarea name="body" rows="3" maxlength="2000" bind:value={body}></textarea>
			</label>
			<div><button class="kv-btn" type="submit" disabled={!body.trim()}>Guardar nota</button></div>
		</form>
		{#if data.notes.length}
			<ul class="notes">
				{#each data.notes as n (n.id)}
					<li>
						<p>{n.body}</p>
						<div class="kv-row">
							<small class="muted">{fmtDateTime(n.createdAt)} · {n.createdBy}</small>
							<form
								method="POST"
								action="?/deleteNote"
								use:enhance={({ cancel }) => {
									if (!confirm('¿Borrar esta nota?')) cancel();
								}}
							>
								<input type="hidden" name="id" value={n.id} />
								<button class="kv-btn ghost small" type="submit" aria-label="Borrar nota">
									<Trash2 size={14} aria-hidden="true" /> Borrar
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
</div>

<style>
	.email {
		margin: 0.2rem 0 0;
		overflow-wrap: anywhere;
	}
	.orders,
	.tickets,
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.orders > li {
		padding: 0.7rem 0;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.orders > li:first-child {
		border-top: 0;
		padding-top: 0;
	}
	.event {
		font-weight: 700;
	}
	.tickets li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.5rem;
		align-items: center;
		font-size: 0.9rem;
		padding: 0.15rem 0;
	}
	.notes li {
		background: var(--surface-2);
		border-radius: 0.8rem;
		padding: 0.6rem 0.8rem;
		margin-top: 0.5rem;
	}
	.notes p {
		margin: 0 0 0.3rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.notes .kv-row {
		justify-content: space-between;
	}
</style>
