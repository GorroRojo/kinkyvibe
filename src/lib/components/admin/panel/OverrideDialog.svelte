<script>
	/**
	 * Diálogo en la página (nunca `window.confirm`) para pasar un límite de entradas: el cupo, el
	 * máximo por compra, la venta cerrada o un evento solo anticipadas. Lo muestra una página del
	 * panel cuando el servidor contesta `needsConfirmation` (ver $lib/server/tickets/overrides.js):
	 *
	 *   <OverrideDialog bind:this={overrideDialog} />
	 *   …
	 *   const key = await overrideDialog.ask(result.data.needsConfirmation);
	 *   if (key) { formData.set('override', key); reenviar el formulario }
	 *
	 * `ask` devuelve la clave de confirmación si la persona confirma, o `null` si cancela.
	 *
	 * Paso explícito: el botón que confirma está deshabilitado hasta tildar "Entiendo…" (nada de
	 * confirmar con un Enter distraído; pedido de gorrite: aviso claro + segundo paso).
	 */
	import { tick } from 'svelte';
	import { TriangleAlert } from '@lucide/svelte';

	/** Texto del botón que confirma. */
	export let confirmLabel = 'Sí, pasar el límite';

	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/** @type {{ message: string }[]} */
	let limits = [];
	let title = '';
	/** @type {((key: string | null) => void) | null} */
	let settle = null;
	let key = '';
	/** Tildó "Entiendo que paso el límite". */
	let understood = false;

	/**
	 * @param {{ limits: { message: string }[], key: string }} needs
	 * @param {{ title?: string }} [options]
	 * @returns {Promise<string | null>}
	 */
	export async function ask(needs, options = {}) {
		settle?.(null);
		limits = needs.limits ?? [];
		key = needs.key;
		understood = false;
		title =
			options.title ??
			(limits.length === 1 ? 'Esto pasa un límite de venta' : 'Esto pasa límites de venta');
		await tick();
		dialog?.showModal();
		return new Promise((resolve) => (settle = resolve));
	}

	/** @param {string | null} value */
	function close(value) {
		const done = settle;
		settle = null;
		dialog?.close();
		done?.(value);
	}
</script>

<dialog
	bind:this={dialog}
	class="override"
	aria-labelledby="kv-override-title"
	aria-describedby="kv-override-list"
	on:cancel={() => close(null)}
>
	<h2 id="kv-override-title"><TriangleAlert size={22} aria-hidden="true" /> {title}</h2>
	<ul id="kv-override-list">
		{#each limits as l}<li>{l.message}</li>{/each}
	</ul>
	<p class="note">
		Como admin podés seguir igual. Queda anotado en el registro de actividad, con quién fue y por
		cuánto se pasó.
	</p>
	<label class="understood">
		<input type="checkbox" bind:checked={understood} />
		Entiendo que esto pasa {limits.length === 1 ? 'el límite' : 'los límites'} y lo hago igual.
	</label>
	<div class="btns">
		<!-- svelte-ignore a11y-autofocus -->
		<button type="button" class="btn ghost" autofocus on:click={() => close(null)}>Cancelar</button>
		<button type="button" class="btn" disabled={!understood} on:click={() => close(key)}
			>{confirmLabel}</button
		>
	</div>
</dialog>

<style>
	.override {
		border: 0;
		border-radius: var(--card-round, 1rem);
		background: var(--surface, white);
		color: var(--text, #333);
		box-shadow: var(--shadow, 0 0.1em 0.3em rgba(0, 0, 0, 0.1));
		padding: 1.2rem 1.3rem;
		width: min(28rem, calc(100vw - 32px));
		border-top: 0.4rem solid var(--warn, #7a5b00);
	}
	.override::backdrop {
		background: var(--scrim, rgba(0, 0, 0, 0.4));
		backdrop-filter: blur(3px);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.6rem;
		font-size: 1.2rem;
	}
	ul {
		margin: 0 0 0.8rem;
		padding: 0.6rem 0.8rem 0.6rem 1.8rem;
		background: var(--warn-bg, #fff3c4);
		border-radius: var(--card-round, 1rem);
	}
	li + li {
		margin-top: 0.3rem;
	}
	.note {
		margin: 0 0 1rem;
		color: var(--muted, #666);
		font-size: 0.95rem;
	}
	.understood {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
		margin: 0 0 1rem;
		font-weight: 700;
		cursor: pointer;
	}
	.understood input {
		width: 1.2rem;
		height: 1.2rem;
		flex: none;
		margin-top: 0.1rem;
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		border: 0;
		border-radius: 3em;
		padding: 0.5em 1.1em;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		background: var(--accent, hsl(319, 90%, 60%));
		color: var(--accent-ink, white);
	}
	.btn.ghost {
		background: transparent;
		color: var(--accent, hsl(319, 90%, 60%));
		box-shadow: inset 0 0 0 2px var(--accent, hsl(319, 90%, 60%));
	}
</style>
