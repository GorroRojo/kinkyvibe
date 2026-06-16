<script>
	import { BookOpen, Info } from 'lucide-svelte';
	import { createTooltip, melt } from '@melt-ui/svelte';
	import { fade } from 'svelte/transition';

	/** Minutos estimados de lectura. @type {number} */
	export let minutes;

	const {
		elements: { trigger, content, arrow },
		states: { open }
	} = createTooltip({
		positioning: { placement: 'top' },
		openDelay: 150,
		closeDelay: 0,
		closeOnPointerDown: false, // en touch: el tap abre, no cierra al instante
		forceVisible: true,
		group: 'reading-time'
	});
</script>

{#if Number.isFinite(minutes) && minutes > 0}
	<span class="reading-time" title="Tiempo de lectura estimado">
		<BookOpen class="rt-icon" size={14} aria-hidden="true" />
		<span class="rt-label">~{minutes} min de lectura</span>
		<button
			type="button"
			class="rt-info"
			use:melt={$trigger}
			aria-label="Cómo se calcula el tiempo de lectura"
		>
			<Info size={13} aria-hidden="true" />
		</button>
	</span>

	{#if $open}
		<div use:melt={$content} class="rt-tooltip" transition:fade={{ duration: 100 }}>
			<div use:melt={$arrow} />
			<p>Tiempo de lectura estimado a ~200 palabras por minuto.</p>
		</div>
	{/if}
{/if}

<style lang="scss">
	.reading-time {
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
		font-size: var(--step--2);
		opacity: 0.75;
		white-space: nowrap;
		vertical-align: baseline;
	}
	.reading-time :global(.rt-icon) {
		color: var(--2);
		flex: none;
		translate: 0 0.06em;
	}
	.rt-info {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25em; // área de tap cómoda sin agrandar el texto
		margin: -0.25em -0.1em -0.25em -0.05em;
		background: none;
		border: 0;
		color: inherit;
		opacity: 0.7;
		cursor: help;
		border-radius: 0.3em;
	}
	.rt-info:hover,
	.rt-info:focus-visible {
		opacity: 1;
		color: var(--2);
	}
	.rt-tooltip {
		z-index: 50;
		max-width: 15rem;
		padding: 0.35em 0.6em;
		font-size: var(--step--2);
		line-height: 1.3;
		color: #222;
		background: color-mix(in srgb, var(--2) 8%, white);
		border: 1px solid var(--2-light);
		border-radius: 0.4em;
		box-shadow: 0 0.3em 0.8em -0.3em color-mix(in srgb, var(--2) 30%, transparent);
		opacity: 1;
	}
	.rt-tooltip p {
		margin: 0;
	}
	.rt-tooltip :global([data-melt-tooltip-arrow]) {
		border-top: 1px solid var(--2-light);
		border-left: 1px solid var(--2-light);
	}
	@media (prefers-reduced-motion: reduce) {
		.rt-tooltip {
			transition: none;
		}
	}
</style>
