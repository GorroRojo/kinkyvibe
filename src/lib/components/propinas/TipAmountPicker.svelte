<script>
	/**
	 * Elegir el monto de una propina: botones con los montos sugeridos y "Otro monto" (abre un
	 * campo). Funciona sin JavaScript: son radios y el campo se muestra con CSS (`:has`).
	 * Manda `amount` (un monto sugerido u `otro`) y `custom` (el monto escrito).
	 * Props: `presets` (montos sugeridos), `selected` (el elegido, o 'otro'), `custom` (texto),
	 * `error` (mensaje debajo), `idPrefix` (para ids únicos si hay más de uno en la página).
	 */
	import { formatARS } from '$lib/utils/money.js';
	import { TIP_MAX, TIP_MIN, TIP_PRESETS } from '$lib/utils/propinas.js';

	/** @type {readonly number[]} */
	export let presets = TIP_PRESETS;
	/** @type {string} */
	export let selected = String(presets[1] ?? presets[0] ?? 'otro');
	export let custom = '';
	export let error = '';
	export let idPrefix = 'propina';
</script>

<fieldset class="picker" aria-describedby={error ? `${idPrefix}-amount-error` : undefined}>
	<legend>Elegí un monto</legend>
	<div class="chips">
		{#each presets as p}
			<label class="chip">
				<input type="radio" name="amount" value={String(p)} bind:group={selected} />
				<span>{formatARS(p)}</span>
			</label>
		{/each}
		<label class="chip">
			<input type="radio" name="amount" value="otro" bind:group={selected} />
			<span>Otro monto</span>
		</label>
	</div>
	<label class="custom">
		<span>¿Cuánto?</span>
		<input
			name="custom"
			type="text"
			inputmode="numeric"
			autocomplete="off"
			maxlength="12"
			placeholder="Ej.: $ 3.000"
			bind:value={custom}
			on:focus={() => (selected = 'otro')}
		/>
		<small>Entre {formatARS(TIP_MIN)} y {formatARS(TIP_MAX)}.</small>
	</label>
	{#if error}<p class="error" id="{idPrefix}-amount-error" role="alert">{error}</p>{/if}
</fieldset>

<style>
	.picker {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6em;
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
			grid-template-columns: repeat(4, minmax(0, 1fr));
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
	.custom {
		display: none;
		gap: 0.25em;
	}
	.picker:has(input[value='otro']:checked) .custom {
		display: grid;
	}
	.custom span {
		font-weight: 700;
	}
	.custom input {
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
		max-width: 14rem;
	}
	.custom small {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.error {
		margin: 0;
		color: var(--1-ink);
		font-weight: 700;
	}
</style>
