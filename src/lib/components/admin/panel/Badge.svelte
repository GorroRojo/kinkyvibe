<script>
	/**
	 * Etiqueta chica de estado ("chip").
	 * Props: `tone`: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' (default 'neutral'), `title`.
	 * Slot default: el texto.
	 */
	/** @type {'neutral' | 'ok' | 'warn' | 'bad' | 'info'} */
	export let tone = 'neutral';
	/** @type {string | undefined} */
	export let title = undefined;
</script>

<span class="badge {tone}" {title}><slot /></span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: 1em;
		padding: 0.1em 0.6em;
		white-space: nowrap;
		background: var(--surface-2);
		color: var(--text);
	}
	.ok {
		background: var(--ok-bg);
		color: var(--ok);
	}
	.warn {
		background: var(--warn-bg);
		color: var(--warn);
	}
	.bad {
		background: var(--bad-bg);
		color: var(--bad);
	}
	.info {
		background: var(--info-bg);
		color: var(--info);
	}
</style>
