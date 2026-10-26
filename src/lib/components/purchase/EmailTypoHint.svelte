<script>
	/**
	 * «¿Quisiste decir …@gmail.com?» debajo de un campo de mail (emailTypos.js). Solo sugiere: no
	 * bloquea nada. Mira la dirección recién cuando quien la escribe sale del campo (`checked`, lo
	 * pone el campo con `on:change`), así no salta a mitad de escribir. «Sí, corregilo» cambia el
	 * mail del campo.
	 */
	import { suggestEmail } from '$lib/utils/emailTypos.js';

	/** El mail del campo (`bind:`). */
	export let email = '';
	/** El mail como quedó al salir del campo (`bind:`). */
	export let checked = '';

	$: suggestion = checked && checked === email ? suggestEmail(email) : null;

	function fix() {
		if (!suggestion) return;
		email = suggestion;
		checked = suggestion;
	}
</script>

<!-- Sin envoltorio fijo: si no hay sugerencia, no ocupa lugar (ni el gap de una grilla). -->
{#if suggestion}
	<p role="status">
		¿Quisiste decir <strong>{suggestion}</strong>?
		<button type="button" on:click={fix}>Sí, corregilo</button>
	</p>
{/if}

<style>
	p {
		margin: 0;
		font-size: var(--step--1);
		overflow-wrap: anywhere;
	}
	button {
		font: inherit;
		font-weight: bold;
		color: var(--link, var(--2-dark));
		background: none;
		border: 0;
		padding: 0.2em 0;
		text-decoration: underline;
		cursor: pointer;
		min-height: 44px;
	}
</style>
