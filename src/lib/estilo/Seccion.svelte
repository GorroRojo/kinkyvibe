<script>
	/**
	 * Una sección de la galería /estilo: nombre del componente, su import, cuándo usarlo y cuándo
	 * no. Slot default: los ejemplos (en filas `Estado`).
	 */
	/** @type {import('./secciones.js').Seccion} */
	export let seccion;

	/**
	 * Texto con `código` entre comillas invertidas, en partes para dibujar.
	 * @param {string} text
	 */
	const partes = (text) => text.split('`').map((t, i) => ({ t, code: i % 2 === 1 }));
</script>

<section class="seccion" id={seccion.id} aria-labelledby="{seccion.id}-titulo">
	<header>
		<h2 id="{seccion.id}-titulo">{seccion.nombre}</h2>
		<code class="importa">{seccion.importa}</code>
	</header>
	<div class="uso">
		<div>
			<h3>Cuándo usarlo</h3>
			<p>
				{#each partes(seccion.cuando) as p}{#if p.code}<code>{p.t}</code>{:else}{p.t}{/if}{/each}
			</p>
		</div>
		<div>
			<h3>Cuándo no</h3>
			<p>
				{#each partes(seccion.cuandoNo) as p}{#if p.code}<code>{p.t}</code>{:else}{p.t}{/if}{/each}
			</p>
		</div>
	</div>
	<div class="ejemplos">
		<slot />
	</div>
</section>

<style>
	.seccion {
		background: var(--surface);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
		padding: var(--space-s);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		scroll-margin-top: var(--space-xl);
		min-width: 0;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2xs) var(--space-xs);
	}
	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.importa {
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}
	.uso {
		display: grid;
		gap: var(--space-xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
	}
	h3 {
		margin: 0 0 var(--space-3xs);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	p {
		margin: 0;
		font-size: var(--text-sm);
	}
	.ejemplos {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}
	code {
		background: var(--surface-2, var(--hover));
		border-radius: var(--radius-s);
		padding: 0 var(--space-3xs);
	}
</style>
