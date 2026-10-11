<script>
	/**
	 * «Avisar a les compradores» después de cambiar la fecha de un evento (dateChange.js,
	 * docs/mails.md). Nunca manda solo: el botón pide confirmación y manda a la acción
	 * `dateChangeSend` de la pestaña «Mail a compradores» (una tanda; el cron sigue con el resto).
	 *
	 * - `mode="notice"`: el aviso de arriba de la ficha, con «No hace falta» (deja de mostrarse).
	 * - `mode="card"`: dentro de «Mail a compradores» («Avisar el cambio de fecha»), siempre que
	 *   haya un cambio, también después de «No hace falta» o de avisar.
	 *
	 * Sin JavaScript, los formularios van directo a esa pestaña, que muestra el resultado.
	 */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { CalendarClock, Send } from '@lucide/svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { eventHref } from '$lib/admin/nav.js';
	import { argDateTimeLong } from '$lib/utils/dates.js';

	/** @type {{ version: number, oldStart: string | null, newStart: string, people: number, orders: number, notified: number, requested: boolean, dismissed: boolean, over: boolean, notice: boolean }} */
	export let offer;
	/** @type {string} */
	export let slug;
	/** @type {'notice' | 'card'} */
	export let mode = 'notice';
	/** Lo que contestó la última acción (el layout lo guarda para seguir mostrándolo). */
	/** @type {{ ok: boolean, message: string } | null} */
	export let result = null;

	let busy = false;

	$: action = `${eventHref(slug, 'mail')}?/`;
	$: who =
		offer.people === 1 ? 'a la persona que compró' : `a las ${offer.people} personas que compraron`;
	$: count = offer.people === 1 ? '1 persona' : `${offer.people} personas`;

	/** @param {string | null} iso */
	function when(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : argDateTimeLong(d);
	}

	/** @param {boolean} confirm @returns {import('@sveltejs/kit').SubmitFunction} */
	const submit =
		(confirm) =>
		async ({ cancel }) => {
			if (
				confirm &&
				!(await askConfirm({
					title: `¿Mandar el aviso del cambio de fecha a ${count}?`,
					text: 'Les llega un mail con la fecha nueva y el calendario actualizado. Quien ya lo recibió no lo recibe de nuevo.',
					confirmLabel: 'Avisar'
				}))
			) {
				cancel();
				return;
			}
			busy = true;
			return async ({ result: r }) => {
				busy = false;
				const data = r.type === 'success' || r.type === 'failure' ? r.data?.dateChange : null;
				result = data ?? { ok: false, message: 'No se pudo (error del servidor). Probá de nuevo.' };
				await invalidateAll();
			};
		};
</script>

<div class="date-change" class:card={mode === 'card'}>
	{#if mode === 'notice'}
		{#if offer.notice}
			<Notice tone="warn" role={null}>
				<span class="text">
					<strong>Cambiaste la fecha. ¿Avisamos {who}?</strong>
					<span class="dates"
						>{#if offer.oldStart}{`Antes: ${when(offer.oldStart)} · `}{/if}Ahora: {when(
							offer.newStart
						)}</span
					>
				</span>
				<span class="buttons">
					<form method="POST" action="{action}dateChangeSend" use:enhance={submit(true)}>
						<input type="hidden" name="version" value={offer.version} />
						<button type="submit" class="kv-btn small" disabled={busy}>
							<Send size={16} aria-hidden="true" />
							{busy ? 'Mandando…' : 'Avisar a les compradores'}
						</button>
					</form>
					<form method="POST" action="{action}dateChangeDismiss" use:enhance={submit(false)}>
						<input type="hidden" name="version" value={offer.version} />
						<button type="submit" class="kv-btn small ghost" disabled={busy}>No hace falta</button>
					</form>
				</span>
			</Notice>
		{/if}
	{:else}
		<p class="muted small">
			<CalendarClock size={15} aria-hidden="true" />
			La fecha cambió{#if offer.oldStart}{' de '}<strong>{when(offer.oldStart)}</strong>{/if}
			a <strong>{when(offer.newStart)}</strong>.
			{#if offer.notified}Ya les llegó el aviso a {offer.notified === 1
					? '1 compra'
					: `${offer.notified} compras`}.{/if}
		</p>
		<form method="POST" action="{action}dateChangeSend" use:enhance={submit(true)}>
			<input type="hidden" name="version" value={offer.version} />
			<button type="submit" class="kv-btn" disabled={busy || !offer.people}>
				{#if offer.people}<Send size={16} aria-hidden="true" />{/if}
				{busy
					? 'Mandando…'
					: offer.people
						? `Avisar el cambio de fecha (${count})`
						: '✓ Todes ya recibieron el aviso'}
			</button>
		</form>
		<p class="muted small">
			Les llega a quienes compraron antes del cambio (compras aprobadas; las reembolsadas o
			canceladas no), con la fecha nueva y el calendario actualizado. Tocarlo dos veces no manda
			nada de nuevo; si la fecha vuelve a cambiar, se puede avisar otra vez. Manda de a tandas: si
			son muches, el resto sale solo en las próximas vueltas del cron.
		</p>
	{/if}
	{#if result}
		<Notice tone={result.ok ? 'ok' : 'error'} compact>{result.message}</Notice>
	{/if}
</div>

<style>
	.date-change {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		margin: 0 0 1rem;
	}
	.date-change.card {
		margin: 0;
	}
	.date-change :global(.kv-notice-text) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1 1 18rem;
	}
	.dates {
		font-size: var(--text-xs);
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.buttons form {
		margin: 0;
	}
	.small {
		font-size: var(--text-xs);
		margin: 0;
	}
	.muted {
		color: var(--muted);
	}
</style>
