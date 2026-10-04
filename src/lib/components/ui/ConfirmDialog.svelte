<script>
	/**
	 * Diálogo de confirmación centrado. Lo monta una sola vez el layout del panel y se usa con
	 * `askConfirm` de `$lib/admin/confirm.js`. El foco arranca en «Cancelar», así un Enter
	 * distraído no confirma; Escape cancela.
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import { CircleHelp, Trash2, TriangleAlert } from '@lucide/svelte';
	import { registerConfirm } from '$lib/admin/confirm.js';

	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/** @type {import('$lib/admin/confirm.js').ConfirmOptions} */
	let opts = { title: '' };
	/** @type {((ok: boolean) => void) | null} */
	let settle = null;

	/** @param {import('$lib/admin/confirm.js').ConfirmOptions} o */
	async function ask(o) {
		settle?.(false);
		opts = o;
		await tick();
		dialog?.showModal();
		return new Promise((resolve) => (settle = resolve));
	}

	/** @param {boolean} ok */
	function close(ok) {
		const done = settle;
		settle = null;
		dialog?.close();
		done?.(ok);
	}

	onMount(() => registerConfirm(ask));
	onDestroy(() => registerConfirm(null));

	$: tone = opts.tone ?? 'primary';
	$: icon = tone === 'primary' ? CircleHelp : tone === 'danger' ? Trash2 : TriangleAlert;
</script>

<dialog
	bind:this={dialog}
	class="kv-dialog {tone}"
	aria-labelledby="kv-confirm-title"
	aria-describedby={opts.text ? 'kv-confirm-text' : undefined}
	on:cancel={() => close(false)}
>
	<h2 id="kv-confirm-title">
		<svelte:component this={icon} size={22} aria-hidden="true" />
		{opts.title}
	</h2>
	{#if opts.text}<p id="kv-confirm-text">{opts.text}</p>{/if}
	<div class="kv-dialog-btns">
		<!-- svelte-ignore a11y-autofocus -->
		<button type="button" class="kv-btn ghost" autofocus on:click={() => close(false)}
			>{opts.cancelLabel ?? 'Cancelar'}</button
		>
		<button
			type="button"
			class="kv-btn"
			class:danger={tone === 'danger'}
			class:permanent={tone === 'permanent'}
			on:click={() => close(true)}
			>{#if tone !== 'primary'}<svelte:component
					this={icon}
					size={16}
					aria-hidden="true"
				/>{/if}{opts.confirmLabel ?? 'Sí, seguir'}</button
		>
	</div>
</dialog>

<style>
	h2 :global(svg) {
		color: var(--accent);
	}
	.danger h2 :global(svg) {
		color: var(--bad);
	}
	.permanent h2 :global(svg) {
		color: var(--error);
	}
</style>
