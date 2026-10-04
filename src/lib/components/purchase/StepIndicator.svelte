<script>
	/**
	 * Indicador de pasos de la compra de entradas («1 Entradas · 2 Tus datos · 3 Pagar»). El paso
	 * actual lleva `aria-current="step"`. Los pasos hasta `reachable` son botones (para volver, o
	 * para ir adelante si ya se pasó por ahí: quien usa esto valida antes de cambiar); los demás,
	 * texto. Avisa el paso elegido con el evento `select` ({ detail: índice }).
	 */
	import { createEventDispatcher } from 'svelte';

	/** @type {readonly { id: string, label: string }[]} */
	export let steps = [];
	export let current = 0;
	/** El paso más lejano al que se puede saltar desde acá. */
	export let reachable = 0;

	const dispatch = createEventDispatcher();
</script>

<nav class="step-indicator" aria-label="Pasos de la compra">
	<ol>
		{#each steps as s, i (s.id)}
			<li
				class:current={i === current}
				class:done={i < current}
				aria-current={i === current ? 'step' : undefined}
			>
				{#if i !== current && i <= reachable}
					<button type="button" on:click={() => dispatch('select', i)}>
						<span class="num" aria-hidden="true">{i < current ? '✓' : i + 1}</span>
						<span class="label"
							><span class="visually-hidden">{`Paso ${i + 1}: `}</span>{s.label}<span
								class="visually-hidden">{i < current ? ' (listo)' : ''}</span
							></span
						>
					</button>
				{:else}
					<span class="step">
						<span class="num" aria-hidden="true">{i < current ? '✓' : i + 1}</span>
						<span class="label"
							><span class="visually-hidden">{`Paso ${i + 1}: `}</span>{s.label}</span
						>
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	ol {
		display: flex;
		gap: 0.3em;
		margin: 0 0 1em;
		padding: 0;
		list-style: none;
		counter-reset: none;
	}
	li {
		flex: 1 1 0;
		min-width: 0;
		position: relative;
	}
	/* La línea que une los pasos. */
	li + li::before {
		content: '';
		position: absolute;
		top: 1.05em;
		right: calc(50% + 1.3em);
		left: calc(-50% + 1.3em);
		height: 2px;
		background: color-mix(in srgb, var(--2) 30%, transparent);
	}
	li.done + li::before,
	li.current::before {
		background: var(--2);
	}
	button,
	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25em;
		width: 100%;
		margin: 0;
		padding: 0.1em 0.2em 0.2em;
		border: 0;
		border-radius: var(--radius-s);
		background: none;
		box-shadow: none;
		color: var(--muted);
		font: inherit;
		font-size: var(--step--1);
		font-weight: normal;
		line-height: 1.2;
		text-align: center;
		min-height: 44px;
	}
	button {
		cursor: pointer;
		color: var(--2-dark);
	}
	button:hover .label {
		text-decoration: underline;
	}
	button:focus-visible {
		outline: 3px solid var(--2-light);
	}
	.num {
		display: grid;
		place-items: center;
		width: 2.1em;
		height: 2.1em;
		border-radius: 50%;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: white;
		font-weight: bold;
		position: relative;
		z-index: 1;
	}
	.done .num {
		background: var(--2);
		border-color: var(--2);
		color: white;
	}
	.current .num {
		border-color: var(--1);
		background: var(--1);
		color: white;
	}
	.current .label {
		color: var(--1-ink);
		font-weight: bold;
	}
	.label {
		overflow-wrap: anywhere;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
