<script>
	import { onMount } from 'svelte';
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
	onMount(() => {
		mayorDeEdad = savedAnswer();
		saveAnswer(mayorDeEdad);
	});
</script>

{#if !mayorDeEdad}
	<div class="background" transition:fade>
		<div
			class="content box"
			role="dialog"
			aria-modal="true"
			aria-labelledby="age-modal-title"
			aria-describedby="age-modal-desc"
		>
			<h2 id="age-modal-title">¿Sos mayor de 18 años?</h2>
			<p id="age-modal-desc">Este sitio habla de sexualidad y BDSM.</p>
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
	/* Con tope de ancho: la caja mide lo que su contenido y en el celu no tiene que desbordar. */
	.box p {
		margin: 0.4em auto 0;
		max-width: 20em;
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
