<script>
	/**
	 * Etiqueta chica de estado, como los chips de etiquetas del sitio (píldora con borde).
	 * Props: `tone`: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' (default 'neutral'), `title`,
	 * `filled` (default false: relleno del color, texto blanco, como las etiquetas marcadas).
	 * Slot default: el texto (puede llevar un ícono de Lucide de 14 px).
	 */
	/** @type {'neutral' | 'ok' | 'warn' | 'bad' | 'info'} */
	export let tone = 'neutral';
	/** @type {string | undefined} */
	export let title = undefined;
	export let filled = false;
</script>

<span class="badge {tone}" class:filled {title}><slot /></span>

<style>
	.badge {
		--c: var(--muted);
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		font-size: 0.8rem;
		line-height: 1.2;
		border-radius: 2em;
		padding: 0.15em 0.6em;
		white-space: nowrap;
		border: 1px solid var(--c);
		color: var(--c);
		background: transparent;
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
