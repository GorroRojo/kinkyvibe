<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	let mayorDeEdad = true;
	onMount(() => {
		mayorDeEdad = localStorage.getItem('mayorDeEdad') === 'true';
		localStorage.setItem('mayorDeEdad', '' + mayorDeEdad);
	});
</script>

{#if !mayorDeEdad}
	<div class="background" transition:fade|global>
		<div class="content box">
			<h2>¿Sos mayor de 18 años?</h2>
			<div class="button-group">
				<button
					class="button"
					on:click={() => {
						mayorDeEdad = true;
						localStorage.setItem('mayorDeEdad', '' + mayorDeEdad);
					}}>Sí</button
				>
				<a class="button" href="https://instagram.com/kinkyvibeargentina">No</a>
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
