<script>
	/**
	 * Investigación para la navegación del panel (/estilo/prototipos/panel-nav/investigacion):
	 * hallazgos con su fuente y qué significan para el panel, los patrones que sirven y lo que hay
	 * que evitar. Los datos están en ../investigacion.js.
	 */
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import Marco from '../../Marco.svelte';
	import ParaDecidir from '../../ParaDecidir.svelte';
	import { OPCIONES } from '../datos.js';
	import { ANTIPATRONES, HALLAZGOS, PATRONES, PATRON_DE } from '../investigacion.js';

	const DECIDIR = [
		{
			pregunta: '¿Probamos las opciones con une o dos organizadores antes de elegir?',
			propuesta:
				'una prueba corta. Recomiendo cinco minutos por persona: pedirles las cinco tareas de la tabla de clics en el preview y mirar dónde dudan.'
		}
	];
</script>

<Marco
	title="Navegación del panel: investigación"
	explora="Cómo resuelven otros paneles muchas secciones con sub-páginas, qué dice la investigación de usabilidad y qué significa para el nuestro."
	back="/estilo/prototipos/panel-nav"
>
	<ParaDecidir items={DECIDIR} />

	<section class="bloque">
		<h2>Hallazgos</h2>
		<ol class="hallazgos">
			{#each HALLAZGOS as h (h.id)}
				<li id={h.id}>
					<h3>{h.titulo}</h3>
					<p>{h.detalle}</p>
					<p class="panel"><strong>Para el panel:</strong> {h.panel}</p>
					<p class="fuentes">
						Fuentes:
						{#each h.fuentes as f, i (f.url)}{#if i}{' · '}{/if}<a
								class="kv-link"
								href={f.url}
								rel="noopener noreferrer"
								target="_blank">{f.label}</a
							>{/each}
					</p>
				</li>
			{/each}
		</ol>
	</section>

	<section class="bloque">
		<h2>Lo que le sirve a un equipo chico</h2>
		<p class="nota">El celu en la puerta, la compu para planificar.</p>
		<ul class="lista si">
			{#each PATRONES as p (p)}<li><CircleCheck size={18} aria-hidden="true" />{p}</li>{/each}
		</ul>
	</section>

	<section class="bloque">
		<h2>Lo que hay que evitar</h2>
		<ul class="lista no">
			{#each ANTIPATRONES as a (a)}<li><CircleX size={18} aria-hidden="true" />{a}</li>{/each}
		</ul>
	</section>

	<section class="bloque">
		<h2>Cómo se traduce en las tres opciones</h2>
		<ul class="opciones">
			{#each OPCIONES as o (o.slug)}
				<li>
					<a class="kv-link" href="/estilo/prototipos/panel-nav/{o.slug}"
						><strong>{o.letra}. {o.nombre}</strong></a
					>: {PATRON_DE[/** @type {keyof typeof PATRON_DE} */ (o.slug)].patron}.
				</li>
			{/each}
		</ul>
		<p class="nota">
			Se descartó una cuarta idea, «todas las páginas en tejas», como opción propia: la
			investigación sobre íconos y sobre niveles la desaconseja. Quedó como variante de B para
			verla.
		</p>
	</section>
</Marco>

<style>
	.bloque {
		max-width: 46rem;
		margin: var(--space-l) auto 0;
	}
	h2 {
		font-size: var(--text-lg);
		margin: 0 0 var(--space-2xs);
	}
	.nota {
		margin: 0 0 var(--space-2xs);
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.hallazgos {
		margin: 0;
		padding-left: 1.4em;
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.hallazgos li {
		scroll-margin-top: var(--space-s);
	}
	.hallazgos li::marker {
		font-weight: 700;
		color: var(--1-ink);
	}
	h3 {
		margin: 0 0 var(--space-3xs);
		font-size: var(--text-base);
		color: var(--1-ink);
	}
	.hallazgos p {
		margin: 0 0 var(--space-3xs);
		font-size: var(--text-sm);
	}
	.panel {
		padding: var(--space-2xs) var(--space-xs);
		background: var(--surface);
		border-left: 4px solid var(--2);
		border-radius: var(--radius-s);
	}
	.fuentes {
		color: var(--muted);
		font-size: var(--text-xs) !important;
	}
	.lista {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		font-size: var(--text-sm);
	}
	.lista li {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
	}
	.lista :global(svg) {
		flex: none;
		margin-top: 0.15em;
	}
	.si :global(svg) {
		color: var(--3-dark);
	}
	.no :global(svg) {
		color: var(--1-dark);
	}
	.opciones {
		margin: 0 0 var(--space-2xs);
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
	}
</style>
