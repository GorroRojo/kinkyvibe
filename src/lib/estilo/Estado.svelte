<script>
	/** Una fila de ejemplos de la galería /estilo: el nombre del estado y los ejemplos al lado. */
	/** @type {string} */
	export let label;
</script>

<div class="estado">
	<span class="nombre">{label}</span>
	<div class="muestras"><slot /></div>
</div>

<style>
	.estado {
		display: grid;
		grid-template-columns: minmax(0, 7rem) minmax(0, 1fr);
		gap: var(--space-2xs) var(--space-xs);
		align-items: center;
		padding-top: var(--space-2xs);
		border-top: 1px solid var(--line);
	}
	.nombre {
		font-size: var(--text-xs);
		color: var(--muted);
		font-weight: 700;
	}
	.muestras {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
		min-width: 0;
	}
	@container galeria (max-width: 30rem) {
		.estado {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
