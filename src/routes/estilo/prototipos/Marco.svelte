<script>
	/**
	 * Marco común de los prototipos (/estilo/prototipos/*): la franja «Prototipo», el volver al
	 * índice, el título y qué explora. Lleva la marca de la galería (`data-kv-estilo`) para que
	 * `node scripts/demo/guard.js bundle` avise si un prototipo llega al build de producción.
	 * Nada de esto guarda datos: todo es estado local, con datos inventados.
	 *
	 * Props: `title`, `explora` (una línea), `back` (default el índice; null en el índice).
	 * Slot default: el prototipo.
	 */
	import { ArrowLeft, FlaskConical } from '@lucide/svelte';

	/** Marca para `node scripts/demo/guard.js bundle`: si aparece en producción, algo falló. */
	const MARCA = 'kv-estilo-galeria';

	/** @type {string} */
	export let title;
	/** @type {string} */
	export let explora = '';
	/** @type {string | null} */
	export let back = '/estilo/prototipos';
</script>

<div class="marco" data-kv-estilo={MARCA}>
	<p class="franja" role="note">
		<FlaskConical size={16} aria-hidden="true" />
		<span
			><strong>Prototipo</strong> para mirar y decidir: no guarda nada y los datos son inventados.</span
		>
	</p>
	<header>
		{#if back}
			<a class="kv-link volver" href={back}><ArrowLeft size={16} aria-hidden="true" />Prototipos</a>
		{/if}
		<h1>{title}</h1>
		{#if explora}<p class="explora">{explora}</p>{/if}
	</header>
	<slot />
</div>

<style>
	.marco {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--ink);
		padding: 0 var(--space-xs) var(--space-xl);
		box-sizing: border-box;
	}
	.franja {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3xs);
		margin: 0 calc(-1 * var(--space-xs)) var(--space-s);
		padding: var(--space-3xs) var(--space-xs);
		background: var(--4-tint);
		color: var(--4-ink);
		font-size: var(--text-xs);
		text-align: center;
	}
	header {
		max-width: 40rem;
		margin: 0 auto var(--space-s);
	}
	.volver {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
	}
	h1 {
		margin: var(--space-2xs) 0 var(--space-3xs);
		font-size: var(--text-xl);
		line-height: 1.15;
	}
	.explora {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}
</style>
