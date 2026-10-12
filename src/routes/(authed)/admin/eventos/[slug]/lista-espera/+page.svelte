<script>
	/**
	 * Pestaña «Lista de espera» de la ficha del evento (ver +page.server.js): cuentas por alcance,
	 * la fila en orden, lo terminado, y las acciones (cada una pide confirmar).
	 */
	import { enhance } from '$app/forms';
	import { BellRing, ListOrdered } from '@lucide/svelte';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { eventHref } from '$lib/admin/nav.js';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import { argDateList, argTime } from '$lib/utils/dates.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;
	$: live = data.entries.filter((x) =>
		['offered', 'waiting', 'pending_confirmation'].includes(x.status)
	);
	$: done = data.entries.filter((x) => !live.includes(x));
	$: failed = data.scopes.reduce((sum, s) => sum + s.counts.failedMails, 0);
	$: anyLive = live.length > 0;
	$: multiScope = data.scopes.length > 1;

	/** @type {Record<string, string>} */
	const STATUS = {
		pending_confirmation: 'Sin confirmar',
		waiting: 'Esperando',
		offered: 'Con lugar ofrecido',
		purchased: 'Compró',
		expired: 'Terminó',
		cancelled: 'Salió'
	};
	/** @type {Record<string, string>} */
	const END = {
		hold_expired: 'se le venció la reserva',
		left: 'salió con el link del mail',
		admin: 'desde el panel',
		closed: 'se cerró la lista',
		event_cancelled: 'se canceló el evento',
		type_removed: 'ya no existe su tipo de entrada'
	};
	/** @type {Record<string, 'ok' | 'warn' | 'info' | 'neutral' | 'bad'>} */
	const TONE = {
		pending_confirmation: 'neutral',
		waiting: 'info',
		offered: 'warn',
		purchased: 'ok',
		expired: 'neutral',
		cancelled: 'neutral'
	};
	/** @type {Record<string, string>} */
	const ORDER = {
		approved: 'aprobada',
		pending: 'pagando',
		awaiting_transfer: 'esperando la transferencia',
		cancelled: 'cancelada',
		expired: 'vencida',
		rejected: 'rechazada',
		refunded: 'reembolsada'
	};

	/** @typedef {(typeof data.entries)[number]} Entry */
	/** @param {Entry} x */
	function detail(x) {
		if (x.status === 'offered')
			return x.holdUntil
				? x.holdUntil > data.now
					? `Lugar guardado hasta ${argDateList(x.holdUntil, { now: data.now })}`
					: 'La reserva venció (la próxima pasada la cierra)'
				: 'Aviso a toda la lista (sin lugar guardado)';
		if (x.status === 'waiting')
			return `${x.position}.º en la fila · confirmó ${argDateList(x.confirmedAt ?? x.createdAt, { now: data.now })}`;
		if (x.status === 'pending_confirmation')
			return `Se anotó ${argDateList(x.createdAt, { now: data.now })}; no confirmó el mail`;
		if (x.status === 'purchased')
			return `Compró con su oferta${x.orderStatus ? ` · orden ${ORDER[x.orderStatus] ?? x.orderStatus}` : ''}`;
		const why = x.endReason ? (END[x.endReason] ?? x.endReason) : '';
		return [
			x.endedAt ? argDateList(x.endedAt, { now: data.now }) : '',
			why,
			x.endedBy ? `(${x.endedBy})` : ''
		]
			.filter(Boolean)
			.join(' · ');
	}

	/**
	 * Confirmar antes de mandar (el `enhance` de cada botón).
	 * @param {import('$lib/admin/confirm.js').ConfirmOptions} options
	 * @returns {import('@sveltejs/kit').SubmitFunction}
	 */
	const confirming =
		(options) =>
		async ({ cancel }) => {
			if (!(await askConfirm(options))) return cancel();
			return async ({ update }) => update({ reset: false });
		};
</script>

<svelte:head><title>Lista de espera · {e.title} · Panel</title></svelte:head>

<div class="waitlist-tab">
	{#if !data.enabled}
		<Notice tone="warn" role={null}>
			<span
				>La lista de espera está apagada (prueba). Se prende en <a
					href="/admin/ajustes/interruptores">Ajustes → Interruptores</a
				>; mientras tanto nadie se puede anotar y no se ofrece ningún lugar.</span
			>
		</Notice>
	{/if}
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible (o falta la migración 0053).</p>
	{/if}
	{#if form?.action}
		<p class="kv-flash" class:bad={!form.action.ok} role="status">{form.action.message}</p>
	{/if}

	{#if !data.list && !data.scopes.length}
		<EmptyState
			title="Este evento no tiene lista de espera"
			text="Se prende en Editar → Entradas → «Lista de espera»: por evento o por tipo de entrada."
		>
			<a class="kv-btn" href={eventHref(e.slug, 'editar')}>Ir a Editar</a>
		</EmptyState>
	{:else}
		<section class="scopes" aria-label="Cuentas de la lista">
			{#each data.scopes as s (s.key)}
				<article class="scope">
					<h2>
						{s.name}{#if s.orphan}
							<Badge tone="warn">ya no está en la lista</Badge>{/if}
					</h2>
					<p class="big">
						<b>{s.counts.waiting}</b>
						{s.counts.waiting === 1 ? 'persona esperando' : 'personas esperando'}
					</p>
					<ul class="counts">
						{#if s.counts.offered}
							<li>
								<b>{s.counts.offered}</b> con lugar guardado{#if s.counts.nextHoldUntil}
									hasta las {argTime(s.counts.nextHoldUntil)}{/if}
							</li>
						{/if}
						{#if s.counts.broadcast}<li><b>{s.counts.broadcast}</b> avisades a la vez</li>{/if}
						<li><b>{s.counts.purchased}</b> compraron</li>
						<li><b>{s.counts.expired}</b> terminaron</li>
						<li><b>{s.counts.left + s.counts.removed}</b> salieron</li>
						{#if s.counts.pending}<li><b>{s.counts.pending}</b> sin confirmar</li>{/if}
					</ul>
				</article>
			{/each}
		</section>

		<div class="actions">
			<form
				method="POST"
				action="?/ofrecer"
				use:enhance={confirming({
					title: '¿Ofrecer ahora?',
					text: 'Si hay un lugar libre y nadie tiene uno guardado, se lo ofrecemos ya a la próxima persona de la fila (sin esperar al cron).',
					confirmLabel: 'Ofrecer ahora'
				})}
			>
				<button class="kv-btn" type="submit" disabled={!data.enabled}
					><BellRing size={16} aria-hidden="true" /> Ofrecer ahora</button
				>
			</form>
			<form
				method="POST"
				action="?/cerrar"
				use:enhance={confirming({
					title: '¿Cerrar la lista?',
					text: 'Quien espera o tiene un lugar ofrecido sale de la lista y le llega «se cerró la lista». Quien compró no cambia. Para que nadie más se anote, después apagala en Editar.',
					confirmLabel: 'Cerrar la lista',
					tone: 'danger'
				})}
			>
				<button class="kv-btn ghost" type="submit" disabled={!anyLive}>Cerrar la lista</button>
			</form>
			<CsvButton href="/admin/eventos/{encodeURIComponent(e.slug)}/lista-espera.csv" />
		</div>

		{#if failed}
			<Notice tone="warn">
				<span
					>{failed === 1
						? '1 mail de la lista no salió'
						: `${failed} mails de la lista no salieron`} (después de 3 intentos).</span
				>
				<form method="POST" action="?/reintentar" use:enhance class="push">
					<button class="kv-btn small" type="submit">Volver a probar</button>
				</form>
			</Notice>
		{/if}

		<Card title="La fila">
			{#if !live.length}
				<p class="muted">Nadie esperando por ahora.</p>
			{:else}
				<ol class="entries">
					{#each live as x (x.id)}
						<li class="entry">
							<div class="who">
								<span class="email">{x.email}</span>
								<Badge tone={TONE[x.status]}>{STATUS[x.status]}</Badge>
								{#if multiScope && x.scopeName}<Badge tone="neutral">{x.scopeName}</Badge>{/if}
								{#if x.failedMails}<Badge tone="bad">mail sin salir</Badge>{/if}
							</div>
							<p class="detail">{detail(x)}</p>
							<div class="row-actions">
								{#if x.status === 'offered'}
									<form
										method="POST"
										action="?/terminar"
										use:enhance={confirming({
											title: '¿Terminar su reserva?',
											text: 'Su link deja de servir y el lugar pasa a la próxima persona de la fila. No le llega un mail.',
											confirmLabel: 'Terminar y pasar a la siguiente',
											tone: 'danger'
										})}
									>
										<input type="hidden" name="id" value={x.id} />
										<button class="kv-btn small" type="submit"
											>Terminar la reserva y pasar a la siguiente</button
										>
									</form>
								{/if}
								<form
									method="POST"
									action="?/sacar"
									use:enhance={confirming({
										title: '¿Sacar de la lista?',
										text:
											x.status === 'offered'
												? 'Pierde el lugar ofrecido y el lugar pasa a la próxima persona.'
												: 'Pierde su lugar en la fila. No le llega un mail.',
										confirmLabel: 'Sacar de la lista',
										tone: 'danger'
									})}
								>
									<input type="hidden" name="id" value={x.id} />
									<button class="kv-btn ghost small" type="submit">Sacar de la lista</button>
								</form>
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</Card>

		{#if done.length}
			<Card title="Compraron y terminaron">
				<ul class="entries done">
					{#each done as x (x.id)}
						<li class="entry">
							<div class="who">
								<span class="email">{x.email}</span>
								<Badge tone={TONE[x.status]}>{STATUS[x.status]}</Badge>
								{#if multiScope && x.scopeName}<Badge tone="neutral">{x.scopeName}</Badge>{/if}
								{#if x.failedMails}<Badge tone="bad">mail sin salir</Badge>{/if}
							</div>
							<p class="detail">{detail(x)}</p>
						</li>
					{/each}
				</ul>
				{#if data.endedHidden}
					<p class="muted small">
						<ListOrdered size={14} aria-hidden="true" />
						Y {data.endedHidden} más: están en el CSV.
					</p>
				{/if}
			</Card>
		{/if}
	{/if}
</div>

<style>
	.waitlist-tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
		min-width: 0;
	}
	.scopes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
		gap: var(--space-xs);
	}
	.scope {
		background: var(--surface);
		border-radius: var(--card-round);
		padding: var(--space-xs) var(--space-s);
		min-width: 0;
	}
	.scope h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4em;
		margin: 0 0 0.2em;
		font-size: var(--text-md, 1rem);
	}
	.big {
		margin: 0;
	}
	.big b {
		font-size: 1.8em;
		margin-right: 0.15em;
	}
	.counts {
		list-style: none;
		margin: 0.3em 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.2em 0.9em;
		font-size: 0.92em;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em;
	}
	.actions form {
		margin: 0;
	}
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.entry {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		padding: 0.6em 0;
		border-top: 1px solid var(--line, #ddd);
		min-width: 0;
	}
	.entry:first-child {
		border-top: 0;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3em 0.5em;
	}
	.email {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.detail {
		margin: 0;
		font-size: 0.92em;
		color: var(--text-muted, inherit);
	}
	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
	}
	.row-actions form {
		margin: 0;
	}
	.push {
		margin: 0 0 0 auto;
	}
	.muted {
		margin: 0;
		color: var(--text-muted, inherit);
	}
	.small {
		font-size: 0.9em;
	}
</style>
