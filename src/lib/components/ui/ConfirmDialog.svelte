<script context="module">
	let nextId = 0;
</script>

<script>
	/**
	 * Diálogo de confirmación centrado. Lo monta una sola vez el layout del panel y se usa con
	 * `askConfirm` de `$lib/admin/confirm.js`. Con `surface="sitio"`, la versión del sitio público
	 * (`.kv-dialog-sitio` de ./dialogo-sitio.scss y botones `.pill-btn`), para que la monte un
	 * layout público. `register={false}`: no atiende `askConfirm`; se le pregunta con su `ask()`
	 * (`bind:this`), para tener dos en la misma página (la galería /estilo). El foco arranca en «Cancelar», así un Enter
	 * distraído no confirma; Escape cancela. Con `check`, una casilla arriba de los botones
	 * (`askConfirmCheck` devuelve si quedó marcada).
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import { CircleHelp, Trash2, TriangleAlert } from '@lucide/svelte';
	import { registerConfirm } from '$lib/admin/confirm.js';
	import './dialogo-sitio.scss';

	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/**
	 * Lo que muestra antes de la primera pregunta: solo para las pruebas (el render del servidor
	 * no puede abrirlo). En el panel no se pasa.
	 * @type {import('$lib/admin/confirm.js').ConfirmOptions | null}
	 */
	export let preview = null;
	/** @type {'panel' | 'sitio'} */
	export let surface = 'panel';
	export let register = true;

	const uid = `kv-confirm-${++nextId}`;

	/** @type {import('$lib/admin/confirm.js').ConfirmOptions} */
	let opts = preview ?? { title: '' };
	/** @type {((answer: import('$lib/admin/confirm.js').ConfirmAnswer) => void) | null} */
	let settle = null;
	let checked = Boolean(preview?.check?.checked);

	/** @param {import('$lib/admin/confirm.js').ConfirmOptions} o */
	export async function ask(o) {
		settle?.({ ok: false, checked: false });
		opts = o;
		checked = Boolean(o.check?.checked);
		await tick();
		dialog?.showModal();
		return new Promise((resolve) => (settle = resolve));
	}

	/** @param {boolean} ok */
	function close(ok) {
		const done = settle;
		settle = null;
		dialog?.close();
		done?.({ ok, checked: ok && checked });
	}

	onMount(() => {
		if (register) registerConfirm(ask);
	});
	onDestroy(() => {
		if (register) registerConfirm(null);
	});

	$: tone = opts.tone ?? 'primary';
	$: sitio = surface === 'sitio';
	$: btn = sitio ? 'pill-btn' : 'kv-btn';
	$: icon = tone === 'primary' ? CircleHelp : tone === 'danger' ? Trash2 : TriangleAlert;
</script>

<dialog
	bind:this={dialog}
	class="{sitio ? 'kv-dialog-sitio' : 'kv-dialog'} {tone}"
	aria-labelledby="{uid}-title"
	aria-describedby={opts.text ? `${uid}-text` : undefined}
	on:cancel={() => close(false)}
>
	<h2 id="{uid}-title">
		<svelte:component this={icon} size={22} aria-hidden="true" />
		{opts.title}
	</h2>
	{#if opts.text}<p id="{uid}-text">{opts.text}</p>{/if}
	{#if opts.check}
		<label class="kv-confirm-check">
			<input type="checkbox" bind:checked />
			{opts.check.label}
		</label>
	{/if}
	<div class="kv-dialog-btns">
		<!-- svelte-ignore a11y-autofocus -->
		<button type="button" class="{btn} ghost" autofocus on:click={() => close(false)}
			>{opts.cancelLabel ?? 'Cancelar'}</button
		>
		<button
			type="button"
			class={btn}
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
	.kv-confirm-check {
		display: flex;
		align-items: center;
		gap: 0.5em;
		margin: 0 0 var(--space-s, 1rem);
		font-weight: 600;
		cursor: pointer;
	}
	.kv-confirm-check input {
		width: 1.15em;
		height: 1.15em;
		margin: 0;
		accent-color: var(--accent);
	}
	h2 :global(svg) {
		color: var(--accent);
	}
	.danger h2 :global(svg) {
		color: var(--bad);
	}
	.permanent h2 :global(svg) {
		color: var(--error);
	}
	/* Sitio: los colores de la marca del sitio (el panel usa --accent y --bad). */
	.kv-dialog-sitio .kv-confirm-check input {
		accent-color: var(--1);
	}
	.kv-dialog-sitio h2 :global(svg) {
		color: var(--1);
	}
	.kv-dialog-sitio.danger h2 :global(svg) {
		color: var(--1-dark);
	}
	.kv-dialog-sitio.permanent h2 :global(svg) {
		color: var(--error);
	}
</style>
