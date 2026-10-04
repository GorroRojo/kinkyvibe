<!--
	«Recargar datos de prueba» (modo demo, solo deploys de preview; ver docs/demo.md). El layout
	lo importa solo dentro de `if (PREVIEW)`, una constante de compilación: no está en el bundle
	de producción.
-->
<script>
	import { invalidateAll } from '$app/navigation';

	/** @type {'idle' | 'confirm' | 'loading' | 'done' | 'error'} */
	let state = 'idle';
	/** @type {any} */
	let result = null;
	let message = '';

	async function reload() {
		state = 'loading';
		try {
			const res = await fetch('/api/preview-seed', { method: 'POST' });
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.message ?? `Error ${res.status}`);
			result = body;
			state = 'done';
			await invalidateAll();
		} catch (e) {
			message = /** @type {Error} */ (e).message;
			state = 'error';
		}
	}
</script>

<span class="demo-reload">
	{#if state === 'confirm'}
		<span class="confirm" role="alert">
			¿Borrar los datos de prueba (los eventos <code>demo-*</code> con sus órdenes, entradas e
			ingresos) y cargarlos de nuevo con fechas de hoy?
			<button type="button" class="yes" on:click={reload}>Sí, recargar</button>
			<button type="button" on:click={() => (state = 'idle')}>Cancelar</button>
		</span>
	{:else if state === 'loading'}
		<span role="status">Recargando los datos de prueba…</span>
	{:else}
		<button type="button" on:click={() => (state = 'confirm')}>Recargar datos de prueba</button>
		{#if state === 'done' && result}
			<span role="status" class="result">
				Listo: {result.events} eventos, {result.orders} órdenes, {result.tickets} entradas ({result.checkedIn}
				con ingreso), {result.pendingTransfers} transferencias por confirmar.
			</span>
		{:else if state === 'error'}
			<span role="alert" class="result">No se pudo: {message}</span>
		{/if}
	{/if}
</span>

<style>
	.demo-reload {
		display: inline;
		margin-left: 0.5em;
	}
	button {
		font: inherit;
		padding: 0.1em 0.6em;
		border: 1px solid #8a7000;
		border-radius: 0.3em;
		background: #fffbe0;
		color: inherit;
		cursor: pointer;
	}
	button.yes {
		background: #4a3b00;
		color: #fff3b0;
	}
	.result {
		margin-left: 0.5em;
	}
</style>
