<script>
	/**
	 * Etiqueta chica de estado: siempre con ícono, nunca solo texto (decisión de gorrite).
	 * Props: `tone`: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' (default 'neutral'), `title`,
	 * `filled` (default false: relleno del color, texto blanco, como las etiquetas marcadas),
	 * `icon` (componente de Lucide; si no se pasa, va el del tono: ✓ ok, ⚠ warn, ! bad, i info,
	 * ○ neutral). Si el slot ya trae su propio ícono de Lucide, el automático no se muestra.
	 * Color: cuando se comparan muchas, el tono dice qué significa; cuando son pocas, que combine
	 * con el componente.
	 */
	import { Circle, CircleAlert, CircleCheck, Info, TriangleAlert } from '@lucide/svelte';

	/** @type {'neutral' | 'ok' | 'warn' | 'bad' | 'info'} */
	export let tone = 'neutral';
	/** @type {string | undefined} */
	export let title = undefined;
	export let filled = false;
	/** @type {any} */
	export let icon = null;

	const TONE_ICONS = {
		neutral: Circle,
		ok: CircleCheck,
		warn: TriangleAlert,
		bad: CircleAlert,
		info: Info
	};
	$: auto = icon ?? TONE_ICONS[tone] ?? Circle;
</script>

<span class="badge {tone}" class:filled {title}
	><span class="auto" aria-hidden="true"><svelte:component this={auto} size={12} /></span><slot
	/></span
>

<style>
	.badge {
		--c: var(--muted);
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		font-size: var(--text-xs);
		line-height: 1.2;
		border-radius: 2em;
		padding: 0.15em 0.6em 0.15em 0.45em;
		white-space: nowrap;
		border: 1px solid var(--c);
		color: var(--c);
		background: transparent;
	}
	.auto {
		display: inline-flex;
	}
	/* El slot ya trae su ícono: no repetir. */
	.badge:has(> :global(svg)) > .auto {
		display: none;
	}
	.ok {
		--c: var(--ok);
	}
	.warn {
		--c: var(--warn);
	}
	.bad {
		--c: var(--bad);
	}
	.info {
		--c: var(--info);
	}
	.filled {
		background: var(--c);
		color: var(--surface);
	}
	.filled.bad {
		background: var(--1);
		border-color: var(--1);
		color: white;
	}
	.filled.info {
		background: var(--2);
		border-color: var(--2);
		color: white;
	}
</style>
