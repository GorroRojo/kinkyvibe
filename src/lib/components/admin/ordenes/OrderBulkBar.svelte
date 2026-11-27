<script>
	/**
	 * La barra de varias compras de Ventas › Órdenes (plan `ordenes-editar`; lo puro en
	 * $lib/admin/orderBulk.js, el servidor en $lib/server/admin/orderActions.js). Aparece abajo,
	 * pegada, con al menos una compra elegida: cuántas, y solo las acciones que aplican a alguna
	 * (con cuántas, si no son todas). Las que no aplican se saltean y el resultado lo dice:
	 * «3 hechas, 2 salteadas (…)». Nada de plata: ni reembolsos, ni cancelar, ni transferencias.
	 *
	 * «CSV» es un formulario común (POST a `ordenes.csv` con las elegidas) y «Copiar mails» no
	 * toca el servidor. `message` (bind) es el resultado de lo último; la página lo borra cuando se
	 * elige otra cosa.
	 */
	import { deserialize } from '$app/forms';
	import { announce } from '$lib/admin/announce.js';
	import { askConfirm } from '$lib/admin/confirm.js';
	import {
		BULK_ACTIONS,
		bulkBatch,
		bulkMessage,
		chunk,
		mailList,
		mergeBulk,
		splitForAction
	} from '$lib/admin/orderBulk.js';

	/** @type {any[]} las compras elegidas */
	export let selected = [];
	/** A dónde va «CSV» (`…/ordenes.csv`). */
	export let csvHref = '';
	export let message = '';
	/** Después de una acción (la página vuelve a leer las órdenes). */
	export let onDone = async () => {};
	export let onClear = () => {};

	let busy = false;
	$: n = selected.length;
	$: actions = BULK_ACTIONS.map((a) => ({
		...a,
		count: splitForAction(a.id, selected).apply.length
	})).filter((a) => a.count > 0);

	/** @param {import('$lib/admin/orderBulk.js').BulkAction} action */
	async function run(action) {
		const { apply, skipped } = splitForAction(action, selected);
		if (action === 'reenviar') {
			const ok = await askConfirm({
				title:
					apply.length === 1
						? '¿Reenviar el mail de las entradas a 1 compra?'
						: `¿Reenviar el mail de las entradas a ${apply.length} compras?`,
				text: skipped.length
					? `${skipped.length} no ${skipped.length === 1 ? 'está aprobada' : 'están aprobadas'} y se ${skipped.length === 1 ? 'saltea' : 'saltean'}.`
					: undefined,
				confirmLabel: 'Reenviar',
				cancelLabel: 'Volver'
			});
			if (!ok) return;
		}
		busy = true;
		message = '';
		/** @type {import('$lib/admin/orderBulk.js').BulkResult} */
		let acc = { done: [], skipped };
		const batches = chunk(
			apply.map((o) => o.id),
			bulkBatch(action)
		);
		for (const [i, ids] of batches.entries()) {
			const rest = batches.slice(i + 1).flat();
			/** @type {import('$lib/admin/orderBulk.js').BulkResult | null} */
			let part = null;
			try {
				const body = new FormData();
				body.set('accion', action);
				for (const id of ids) body.append('order', id);
				const res = await fetch('?/bulk', {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				});
				const result = /** @type {any} */ (deserialize(await res.text()));
				if (result.type === 'success' && result.data?.bulk?.done) part = result.data.bulk;
			} catch {
				// Sin conexión: estas y las que faltan, sin hacer.
			}
			if (!part) {
				acc = mergeBulk(acc, {
					done: [],
					skipped: [...ids, ...rest].map((id) => ({ id, reason: 'error' }))
				});
				break;
			}
			acc = mergeBulk(acc, part, rest);
			if (part.stopped) break;
		}
		busy = false;
		message = bulkMessage(acc);
		announce(message, { force: true });
		await onDone();
	}

	function copyMails() {
		const list = mailList(selected).join(', ');
		const count = mailList(selected).length;
		const done = () => {
			message = count === 1 ? 'Copiamos 1 mail.' : `Copiamos ${count} mails.`;
			announce(message, { force: true });
		};
		const fallback = () => (message = `No se pudo copiar; acá están: ${list}`);
		try {
			// Dentro del clic: si no, Safari no deja escribir en el portapapeles.
			navigator.clipboard.writeText(list).then(done, fallback);
		} catch {
			fallback();
		}
	}
</script>

{#if n || message}
	<div class="bar" role="region" aria-label="Compras elegidas">
		{#if n}
			<div class="row">
				<strong class="count">{n === 1 ? '1 elegida' : `${n} elegidas`}</strong>
				{#each actions as a (a.id)}
					<button type="button" class="kv-btn small" disabled={busy} on:click={() => run(a.id)}
						>{a.label}{#if a.count < n}{' '}({a.count}){/if}</button
					>
				{/each}
				<form method="POST" action={csvHref}>
					{#each selected as o (o.id)}<input type="hidden" name="order" value={o.id} />{/each}
					<button type="submit" class="kv-btn ghost small" disabled={busy}>CSV</button>
				</form>
				<button type="button" class="kv-btn ghost small" disabled={busy} on:click={copyMails}
					>Copiar mails</button
				>
				<button type="button" class="kv-btn ghost small clear" disabled={busy} on:click={onClear}
					>Ninguna</button
				>
			</div>
		{/if}
		{#if busy}
			<p class="msg" role="status">Haciendo…</p>
		{:else if message}
			<p class="msg" role="status">
				{message}
				{#if !n}<button type="button" class="kv-btn ghost small" on:click={() => (message = '')}
						>Listo</button
					>{/if}
			</p>
		{/if}
	</div>
{/if}

<style>
	.bar {
		position: sticky;
		/* En el celu, arriba de la barra de navegación de abajo (panel-editor.scss). */
		bottom: calc(var(--form-sticky-bottom, 0px) + var(--space-2xs));
		z-index: 5;
		margin-top: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border: 1px solid var(--link);
		border-radius: var(--card-round);
		background: var(--surface);
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3xs) var(--space-2xs);
	}
	.row form {
		display: inline-flex;
	}
	.count {
		margin-right: var(--space-3xs);
	}
	.clear {
		margin-left: auto;
	}
	.msg {
		margin: 0;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
		min-height: 2.25rem;
	}
	@media (max-width: 40rem) {
		.count {
			flex-basis: 100%;
		}
		.clear {
			margin-left: 0;
		}
	}
</style>
