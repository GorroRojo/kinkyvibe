<script>
	/**
	 * Elegir a dónde va la propina: "Para KinkyVibe" (por defecto) o "Para el Fondo". Dos botones
	 * como los de los montos (`TipAmountPicker`); funciona sin JavaScript (son radios). Manda
	 * `destination`. La plata entra igual a la misma cuenta: solo cambia cómo se cuenta (las del
	 * Fondo suman a los aportes al Fondo KinkyVibe). El servidor valida el valor.
	 * Props: `selected` (el elegido), `error` (mensaje debajo), `idPrefix` (ids únicos).
	 */
	import {
		TIP_DEFAULT_DESTINATION,
		TIP_DESTINATIONS,
		TIP_DESTINATION_LABELS
	} from '$lib/utils/propinas.js';

	/** @type {string} */
	export let selected = TIP_DEFAULT_DESTINATION;
	export let error = '';
	export let idPrefix = 'propina';
</script>

<fieldset
	class="picker"
	aria-describedby="{idPrefix}-destination-hint{error ? ` ${idPrefix}-destination-error` : ''}"
>
	<legend>¿Para quién es?</legend>
	<div class="chips">
		{#each TIP_DESTINATIONS as d}
			<label class="chip">
				<input type="radio" name="destination" value={d} bind:group={selected} />
				<span>{TIP_DESTINATION_LABELS[d]}</span>
			</label>
		{/each}
	</div>
	<small id="{idPrefix}-destination-hint">
		El <a href="https://fondo.kinkyvibe.ar" target="_blank" rel="noopener">Fondo KinkyVibe</a> baja el
		precio de lo que hacemos para todo el mundo.
	</small>
	{#if error}<p class="error" id="{idPrefix}-destination-error" role="alert">{error}</p>{/if}
</fieldset>

<style>
	.picker {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5em;
		min-width: 0;
	}
	legend {
		font-weight: 700;
		padding: 0;
		margin-bottom: 0.5em;
	}
	.chips {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5em;
	}
	@media (min-width: 30rem) {
		.chips {
			grid-template-columns: repeat(2, minmax(0, 12rem));
		}
	}
	.chip {
		position: relative;
		display: block;
	}
	.chip input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.chip span {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: var(--tap);
		padding: 0.4em 0.6em;
		border: 2px solid var(--2);
		border-radius: var(--round-pill);
		background: var(--surface);
		color: var(--2-dark);
		font-weight: 700;
		text-align: center;
		transition:
			background 150ms,
			color 150ms;
	}
	.chip:hover span {
		background: var(--2-tint);
	}
	.chip input:checked + span {
		background: var(--2-dark);
		border-color: var(--2-dark);
		color: white;
	}
	.chip input:focus-visible + span {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	small {
		color: var(--muted);
		font-size: var(--step--1);
	}
	small a {
		color: var(--2-dark);
	}
	.error {
		margin: 0;
		color: var(--1-ink);
		font-weight: 600;
	}
</style>
