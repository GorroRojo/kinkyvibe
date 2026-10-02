<script>
	/**
	 * "Deshacer rechazo" de una transferencia cancelada (action `?/reopen` de la página). Si ya no
	 * hay lugar en su tipo o tramo, el servidor contesta `needsConfirmation` y se pregunta con el
	 * `OverrideDialog` de la página (solo el botón, sin casilla; decisión de gorrite); si le admin
	 * confirma, se reenvía con la clave en `override`. Sin `confirm()` previo: se puede volver a
	 * cancelar.
	 *
	 *   <ReopenTransferButton id={o.id} reference={o.reference} dialog={overrideDialog} />
	 */
	import { enhance } from '$app/forms';
	import { Undo2 } from '@lucide/svelte';

	/** Id de la orden. @type {string} */
	export let id;
	/** Referencia (KV-…), para el aviso. @type {string} */
	export let reference;
	/** @type {import('./OverrideDialog.svelte').default | undefined} */
	export let dialog;

	let busy = false;

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = ({ formElement }) => {
		busy = true;
		return async ({ result, update }) => {
			// La clave vale para un solo envío.
			formElement.querySelector('input[name=override]')?.remove();
			const needs =
				result.type === 'failure'
					? /** @type {any} */ (result.data)?.transfer?.needsConfirmation
					: null;
			busy = false;
			if (!needs || !dialog) return update();
			const key = await dialog.ask(needs, {
				title: `No hay lugar para volver a reservar ${reference}`
			});
			if (!key) return;
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = 'override';
			input.value = key;
			formElement.append(input);
			formElement.requestSubmit();
		};
	};
</script>

<form method="POST" action="?/reopen" use:enhance={submit}>
	<input type="hidden" name="order" value={id} />
	<button class="kv-btn ghost small" type="submit" disabled={busy}>
		<Undo2 size={16} aria-hidden="true" /> Deshacer rechazo
	</button>
</form>
