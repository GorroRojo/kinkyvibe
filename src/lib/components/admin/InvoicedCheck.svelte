<script>
	/**
	 * La casilla «Facturada» de una compra ($lib/server/admin/invoiced.js), en Ventas › Órdenes y en
	 * Compras para facturar. Se guarda apenas se toca (acción `?/invoiced`); sin JavaScript, con
	 * «Guardar». Marcada, dice cuándo y quién: «Facturada el 2/11/26 13:43 por gorrite». No vuelve
	 * a cargar la página: `invoicedAt` e `invoicedBy` se actualizan acá (con `bind:`, la página se
	 * entera).
	 */
	import { enhance } from '$app/forms';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';
	import { announce } from '$lib/admin/announce.js';
	import { fmtDateTime } from '$lib/admin/format.js';

	/** @type {string} */
	export let orderId;
	/** @type {number | null} */
	export let invoicedAt = null;
	/** @type {string | null} */
	export let invoicedBy = null;
	export let action = '?/invoiced';

	let checked = Boolean(invoicedAt);
	$: checked = Boolean(invoicedAt);
	/** @type {'' | 'saving' | 'error'} */
	let status = '';
	let error = '';

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		status = 'saving';
		return async ({ result }) => {
			const body = /** @type {any} */ (result).data?.invoiced;
			if (result.type === 'success' && body?.ok) {
				status = '';
				invoicedAt = body.invoicedAt ?? null;
				invoicedBy = body.invoicedBy ?? null;
				announce(body.message);
			} else {
				status = 'error';
				error = body?.message ?? '';
			}
			checked = Boolean(invoicedAt);
		};
	};
</script>

<form method="POST" {action} use:enhance={submit} class="invoiced">
	<input type="hidden" name="order" value={orderId} />
	<Checkbox
		name="invoiced"
		value="1"
		bind:checked
		disabled={status === 'saving'}
		on:change={(e) => /** @type {HTMLInputElement} */ (e.currentTarget).form?.requestSubmit()}
		>{#if invoicedAt}Facturada el {fmtDateTime(invoicedAt)}{#if invoicedBy}
				por {invoicedBy}{/if}{:else}Facturada{/if}</Checkbox
	>
	<SaveStatus {status} {error} />
	<noscript><button class="kv-btn ghost small" type="submit">Guardar</button></noscript>
</form>

<style>
	.invoiced {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--space-2xs);
		font-size: var(--text-sm);
	}
</style>
