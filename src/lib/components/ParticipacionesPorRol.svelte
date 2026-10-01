<script>
	/**
	 * En la página de un perfil: los eventos y publicaciones que lo nombran, por rol ("Organiza":
	 * sus eventos). Lo arma el servidor (src/lib/server/personas/, solo para perfiles públicos).
	 *
	 * Props: `groups` ({ rol, items: { title, path, category, date }[] }[]).
	 */
	import { TIMEZONE } from '$lib/utils/dates.js';

	/** @type {{ rol: string, items: { title: string, path: string, category: string, date: string | null }[] }[]} */
	export let groups = [];

	/** @type {Record<string, string>} */
	const CATEGORY = { calendario: 'Evento', material: 'Material', wiki: 'Wiki' };

	/** @param {string | null} d */
	function day(d) {
		if (!d) return '';
		const t = new Date(d);
		return Number.isNaN(t.getTime())
			? ''
			: t.toLocaleDateString('es-AR', { dateStyle: 'medium', timeZone: TIMEZONE });
	}
</script>

{#if groups.length}
	<section class="participa" aria-labelledby="participa-titulo">
		<h2 id="participa-titulo">Participa en</h2>
		{#each groups as g (g.rol)}
			<h3>{g.rol}</h3>
			<ul>
				{#each g.items as item (item.path)}
					<li>
						<a href={item.path}>{item.title}</a>
						<small
							>{CATEGORY[item.category] ?? ''}{#if day(item.date)}&nbsp;· {day(
									item.date
								)}{/if}</small
						>
					</li>
				{/each}
			</ul>
		{/each}
	</section>
{/if}

<style>
	.participa {
		margin-block: 1.2em;
	}
	h2 {
		margin: 0 0 0.3em;
	}
	h3 {
		margin: 0.8em 0 0.2em;
		font-size: var(--step-0);
		color: var(--2-dark);
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
	}
	li {
		margin: 0.2em 0;
		overflow-wrap: anywhere;
	}
	small {
		color: var(--muted, #666);
		margin-left: 0.4em;
	}
</style>
