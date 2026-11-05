<script>
	import { onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	let mayorDeEdad = true;
	// localStorage puede tirar error (modo privado, datos bloqueados): entonces se pregunta igual,
	// solo que la respuesta no se recuerda.
	function savedAnswer() {
		try {
			return localStorage.getItem('mayorDeEdad') === 'true';
		} catch {
			return false;
		}
	}
	/** @param {boolean} value */
	function saveAnswer(value) {
		try {
			localStorage.setItem('mayorDeEdad', '' + value);
		} catch {
			// sin almacenamiento: no se recuerda
		}
	}
	onMount(async () => {
		mayorDeEdad = savedAnswer();
		saveAnswer(mayorDeEdad);
		// El foco entra al diálogo (en «Sí»): si no, un lector de pantalla puede leer la página tapada
		// sin enterarse de la pregunta, y con Tab se llegaba al fondo.
		if (!mayorDeEdad) {
			await tick();
			focusables()[0]?.focus();
		}
	});

	/** Los botones del diálogo (se buscan por su título: así el marcado no cambia). */
	function focusables() {
		const dialog = document.getElementById('age-modal-title')?.closest('[role="dialog"]');
		return /** @type {HTMLElement[]} */ ([...(dialog?.querySelectorAll('button, a[href]') ?? [])]);
	}

	/**
	 * Tab y Mayús+Tab dan la vuelta adentro del diálogo mientras está abierto. Escape no hace nada,
	 * como antes (cerrar no es contestar).
	 * @param {KeyboardEvent} e
	 */
	function trapTab(e) {
		if (mayorDeEdad || e.key !== 'Tab') return;
		const items = focusables();
		if (!items.length) return;
		const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
		const next = i === -1 ? 0 : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
		e.preventDefault();
		items[next].focus();
	}
</script>

{#if !mayorDeEdad}
	<div class="background" transition:fade>
		<div class="content box" role="dialog" aria-modal="true" aria-labelledby="age-modal-title">
			<h2 id="age-modal-title">¿Sos mayor de 18 años?</h2>
			<div class="button-group">
				<button
					class="button tap-target"
					on:click={() => {
						mayorDeEdad = true;
						saveAnswer(true);
					}}>Sí</button
				>
				<a class="button tap-target" href="https://instagram.com/kinkyvibeargentina">No</a>
			</div>
		</div>
	</div>
{/if}

<svelte:window on:keydown={trapTab} />

<style>
	.background {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: all;
		background: color-mix(in srgb, black 60%, transparent);
		z-index: 3;
	}
	.box {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		padding: 1em;
		max-width: max-content;
		border-radius: 0.3em;
		background: white;
		color: black;
		z-index: 4;
		pointer-events: all;
	}
	.box h2 {
		margin-top: 0.3em;
	}
	.button-group {
		display: flex;
		gap: 1em;
		justify-content: center;
		margin-top: 1em;
	}
	.button {
		padding: 0.3em 1em;
		font-size: var(--step-0);
		border: 0;
		flex: 1 1;
		outline: 0;
		background: var(--1);
		color: white;
		cursor: pointer;
		border-radius: 0.3em;
		transition: 100ms;
	}
</style>
