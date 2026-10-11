<script>
	/**
	 * Barra lateral de las opciones A y C: solo las secciones, con ícono y nombre (sin sub-ítems).
	 * En la compu angosta y la tablet se vuelve un riel con el nombre debajo del ícono (el riel de
	 * Material: los nombres no se esconden). Ajustes va al pie.
	 *
	 * Props: `secciones`, `estado`, `resaltar` (ids que van en rosa lleno, como la Puerta en C),
	 * `recientes` (C: lo último que se abrió, como los «Shortcuts» de Stripe).
	 */
	import { History } from '@lucide/svelte';
	import { enlace } from './estado.js';

	/** @type {import('./datos.js').Seccion[]} */
	export let secciones;
	/** @type {import('./estado.js').Estado} */
	export let estado;
	/** @type {string[]} */
	export let resaltar = [];
	/** @type {{ label: string, s: string, t?: string, e?: string, et?: string }[]} */
	export let recientes = [];

	$: arriba = secciones.filter((x) => !x.foot);
	$: pie = secciones.filter((x) => x.foot);
</script>

<nav class="secciones" aria-label="Secciones">
	{#each [arriba, pie] as grupo, i (i)}
		<ul class:pie={i === 1} role="list">
			{#each grupo as sec (sec.id)}
				<li>
					<a
						href={enlace(estado, { s: sec.id, t: '' })}
						class:on={estado.s === sec.id}
						class:hl={resaltar.includes(sec.id)}
						aria-current={estado.s === sec.id ? 'page' : undefined}
						><svelte:component this={sec.icon} size={20} aria-hidden="true" /><span
							>{sec.label}</span
						></a
					>
				</li>
			{/each}
		</ul>
		{#if i === 0 && recientes.length}
			<div class="recientes">
				<p class="rotulo"><History size={14} aria-hidden="true" />Recientes</p>
				<ul role="list">
					{#each recientes as r (r.label)}
						<li><a class="chico" href={enlace(estado, r)}>{r.label}</a></li>
					{/each}
				</ul>
			</div>
		{/if}
	{/each}
</nav>

<style>
	.secciones {
		display: flex;
		flex-direction: column;
		flex: 1;
		width: 13rem;
		margin-top: var(--space-xs);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	ul.pie {
		margin-top: auto;
		padding-top: var(--space-2xs);
		border-top: 1px solid var(--line);
	}
	a {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: 0.5rem var(--space-xs);
		border-radius: var(--round);
		color: var(--accent);
		font-weight: 700;
		text-decoration: none;
	}
	a:hover {
		background: var(--surface-2);
	}
	a.on {
		background: var(--link-bg);
		color: var(--link);
	}
	a.hl:not(.on) {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.recientes {
		margin-top: var(--space-s);
	}
	.rotulo {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: 0 0 var(--space-3xs);
		padding: 0 var(--space-xs);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	a.chico {
		font-weight: 400;
		font-size: var(--text-xs);
		color: var(--text);
		padding: 0.3rem var(--space-xs);
	}

	/* Riel: ícono arriba, nombre abajo (siempre visible). */
	@container pantalla (max-width: 999px) {
		.secciones {
			width: 5.2rem;
		}
		a {
			flex-direction: column;
			gap: 0.15rem;
			padding: 0.45rem 0.1rem;
			font-size: var(--text-xs);
			text-align: center;
		}
		.recientes {
			display: none;
		}
	}
</style>
