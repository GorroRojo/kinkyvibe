<script>
	/**
	 * El DNI de quien compró una orden, en las listas del panel (Órdenes, Transferencias): solo los
	 * últimos 3 dígitos («DNI •••.957») y «Mostrar», que pide el completo a la acción `?/dni` de la
	 * página (queda en el registro de actividad, como en la puerta y en la ficha de la persona).
	 * Anda sin JavaScript: la acción vuelve con `form.dni` y se muestra igual.
	 */
	import { enhance } from '$app/forms';
	import { formatDni } from '$lib/admin/orderFormat.js';

	/** @type {string} */
	export let orderId;
	/** Últimos 3 dígitos del DNI ('' si no hay DNI). */
	/** @type {string} */
	export let tail;
	/** El `form` de la página (para el caso sin JavaScript). */
	/** @type {any} */
	export let form = null;

	/** @type {string | null} */
	let revealed = null;
	/** @type {string} */
	let message = '';
	let busy = false;

	$: key = `orden:${orderId}`;
	$: shown = revealed ?? (form?.dni?.ok && form.dni.key === key ? String(form.dni.value) : null);
	$: failed =
		message || (form?.dni && !form.dni.ok && form.dni.key === key ? form.dni.message : '');

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const reveal = () => {
		busy = true;
		message = '';
		return async ({ result }) => {
			busy = false;
			const d = /** @type {any} */ (result).data?.dni;
			if (result.type === 'success' && d?.ok) revealed = String(d.value);
			else message = d?.message ?? 'No se pudo ver el DNI.';
		};
	};
</script>

{#if tail}
	{#if shown}
		<span class="dni">DNI {formatDni(shown)}</span>
	{:else}
		<span class="dni-wrap">
			<span class="dni" title="El DNI completo se pide aparte y queda registrado"
				>DNI •••.{tail}</span
			>
			<form method="POST" action="?/dni" use:enhance={reveal}>
				<input type="hidden" name="orden" value={orderId} />
				<button
					type="submit"
					class="kv-btn ghost small"
					disabled={busy}
					aria-label="Mostrar el DNI completo (queda registrado)">Mostrar</button
				>
			</form>
			{#if failed}<small class="error">{failed}</small>{/if}
		</span>
	{/if}
{/if}

<style>
	.dni {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.dni-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	form {
		display: inline;
	}
	.error {
		color: var(--muted);
	}
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
	}
</style>
