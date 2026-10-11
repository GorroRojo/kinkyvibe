<script>
	/**
	 * Prototipo «Filtros en el celu» (/estilo/prototipos/filtros-celu). Hoy, en las listas
	 * (PostList → FilterBar), «Filtrar por etiquetas» abre un panel con todo el árbol de etiquetas
	 * (TagGroup), que se arma aunque esté cerrado y en el celu ocupa varias pantallas. Acá: una
	 * barra fija arriba con las etiquetas más usadas en lo que se ve (chips que se deslizan de
	 * costado), «Filtros» con cuántos hay elegidos y «Limpiar», y el resto en una hoja con buscador
	 * que se arma recién al abrirla.
	 *
	 * Filtra de verdad, con `filterPosts` de $lib/utils/postSearch.js y el árbol de etiquetas del
	 * sitio (`$tagManager`, así los chips tienen su color y su emoji), pero sobre publicaciones
	 * inventadas y sin tocar la URL ni los stores de la lista. Solo en previews y en dev.
	 */
	import { onDestroy, tick } from 'svelte';
	import { Search, SlidersHorizontal, X } from '@lucide/svelte';
	import { Button, Segmented, Sheet, TagChip } from '$lib/components/ui';
	import PostList from '$lib/components/PostList.svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import { filterPosts } from '$lib/utils/postSearch.js';
	import { filteredTags, tagManager } from '$lib/utils/stores';
	import Marco from '../Marco.svelte';
	import ParaDecidir from '../ParaDecidir.svelte';
	import { barChips, sheetGroups, tagCounts } from './filtros.js';

	const DAY = 24 * 60 * 60 * 1000;
	/** Fecha a N días de hoy, a la hora UTC dada (22 = 19 h en Argentina), para que la lista
	 * parezca real. */
	const at = (/** @type {number} */ days, /** @type {number} */ utcHour) => {
		const d = new Date(Date.now() + days * DAY);
		d.setUTCHours(utcHour, 0, 0, 0);
		return d.toISOString();
	};

	// Publicaciones inventadas (títulos y textos de ejemplo; las etiquetas son las del árbol).
	const FAKE = [
		[
			'Taller de prueba: nudos básicos',
			['taller', 'jam de cuerdas', 'Presencial', 'AMBA', 'pago'],
			3
		],
		['Fiesta de ejemplo en Lugar Inventado', ['fiesta', 'Presencial', 'AMBA', 'pago'], 5],
		['Charla debate de muestra', ['charla debate', 'Online', 'gratis', 'español'], 6],
		['Cine de prueba: función inventada', ['cine', 'Presencial', 'Córdoba', 'a la gorra'], 8],
		['Grupo de apoyo de ejemplo', ['grupo', 'Online', 'gratis', 'español'], 9],
		['Taller de muestra en LSA', ['taller', 'Online', 'LSA', 'pago'], 11],
		['Jam de cuerdas inventada', ['jam de cuerdas', 'Presencial', 'Rosario', 'a la gorra'], 12],
		['Feria de prueba', ['feria', 'Presencial', 'AMBA', 'gratis'], 14],
		['Laboratorio de ejemplo', ['laboratorio', 'taller', 'Presencial', 'La Plata', 'pago'], 17],
		['Perfo de muestra', ['perfo', 'cabaret', 'Presencial', 'AMBA', 'pago'], 19],
		['Taller de prueba en inglés', ['taller', 'Online', 'inglés', 'pago'], 22],
		['Rancheadita inventada', ['rancheadita', 'Presencial', 'Montevideo', 'gratis'], 25],
		['Taller de prueba que ya pasó', ['taller', 'Presencial', 'AMBA', 'pago'], -10],
		['Fiesta de ejemplo que ya pasó', ['fiesta', 'Presencial', 'Córdoba', 'pago'], -20]
	];
	/** @type {any[]} */
	const posts = FAKE.map(([title, tags, days], i) => ({
		path: `/estilo/prototipos/filtros-celu#ejemplo-${i + 1}`,
		meta: {
			title,
			summary: 'Evento inventado para el prototipo: no existe.',
			tags,
			category: 'calendario',
			start: at(/** @type {number} */ (days), 22),
			end: at(/** @type {number} */ (days), 25)
		}
	}));

	/** @type {'hoy' | 'propuesta'} */
	let vista = 'propuesta';
	const VISTAS = [
		{ value: 'propuesta', label: 'Propuesta' },
		{ value: 'hoy', label: 'Cómo es hoy' }
	];
	// «Cómo es hoy» usa la lista real, que comparte el store de filtros: que no quede nada elegido.
	$: (vista, filteredTags.set([]));
	onDestroy(() => filteredTags.set([]));

	/** @type {string[]} */
	let selected = [];
	let showPast = 'ocultar';
	let sheetOpen = false;
	let query = '';

	$: base = posts.filter(
		(p) => showPast === 'mostrar' || new Date(p.meta.start).getTime() > Date.now()
	);
	$: results = filterPosts(base, { tags: selected, text: '' }, $tagManager);
	$: chips = barChips(results, selected, 8);
	$: sheetTags = [...tagCounts(results, selected).keys()];
	$: groups = sheetGroups(sheetTags, query, (tag) => {
		const t = $tagManager.get(tag);
		const parent = t?.parents?.find((p) => p !== 'root') ?? 'otras';
		return { group: parent, name: t?.visible_name };
	});
	$: active = selected.length;

	/** @type {HTMLElement | undefined} */
	let strip;
	/** @param {string} tag @param {boolean} on */
	async function toggle(tag, on) {
		selected = on ? [...selected.filter((t) => t !== tag), tag] : selected.filter((t) => t !== tag);
		// Las elegidas pasan adelante: que se vean (si no, quedan corridas a la izquierda).
		await tick();
		strip?.scrollTo({ left: 0, behavior: 'smooth' });
	}
	function clear() {
		selected = [];
	}
	const n = (/** @type {number} */ x, /** @type {string} */ one, /** @type {string} */ many) =>
		`${x} ${x === 1 ? one : many}`;
</script>

<Marco
	title="Filtros en el celu"
	explora="Una barra corta y fija en lugar del panel largo de «Filtrar por etiquetas». Probalo con el ancho de un celu: tocá chips, abrí «Filtros» y buscá una etiqueta."
>
	<div class="selector">
		<Segmented options={VISTAS} bind:value={vista} label="Qué mirar" />
	</div>

	<div class="pantalla">
		<h2 class="titulo-lista">Calendario</h2>
		{#if vista === 'hoy'}
			<p class="nota">
				La lista de verdad (PostList) con las mismas publicaciones inventadas. «Filtrar por
				etiquetas» abre el árbol entero.
			</p>
			<PostList posts={base} syncUrl={false} />
		{:else}
			<div class="barra" role="region" aria-label="Filtros">
				<div class="fila">
					<button
						type="button"
						class="filtros-btn"
						class:on={active > 0}
						aria-haspopup="dialog"
						on:click={() => (sheetOpen = true)}
					>
						<SlidersHorizontal size={16} aria-hidden="true" />
						Filtros
						{#if active > 0}<span class="cuenta" aria-label={n(active, 'elegido', 'elegidos')}
								>{active}</span
							>{/if}
					</button>
					<ul class="chips" aria-label="Etiquetas más usadas" bind:this={strip}>
						{#each chips as tag (tag)}
							<li>
								<TagChip
									{tag}
									name="chip-barra"
									checkbox
									selected={selected.includes(tag)}
									on:change={(e) => toggle(tag, /** @type {any} */ (e.target).checked)}
								/>
							</li>
						{/each}
						<li>
							<button type="button" class="mas" on:click={() => (sheetOpen = true)}>
								Más filtros
							</button>
						</li>
					</ul>
				</div>
				<!-- Siempre ocupa su línea: elegir o sacar el primer filtro no mueve la lista. -->
				<div class="estado">
					<span aria-live="polite">{n(results.length, 'resultado', 'resultados')}</span>
					{#if active > 0}
						<button type="button" class="limpiar" on:click={clear}>
							<X size={14} aria-hidden="true" />Limpiar ({active})
						</button>
					{/if}
				</div>
			</div>

			{#if results.length === 0}
				<div class="vacio">
					<p>No encontramos nada con esos filtros.</p>
					<Button surface="sitio" variant="secondary" on:click={clear}>Limpiar filtros</Button>
				</div>
			{:else}
				<ul class="posts">
					{#each results as post (post.path)}
						<li><PostListItem {post} /></li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>

	<ParaDecidir
		items={[
			{
				pregunta: '¿Qué chips van en la barra?',
				propuesta:
					'las 8 etiquetas más usadas en lo que se ve ahora (cambian al filtrar), con las elegidas siempre adelante.'
			},
			{
				pregunta: '¿Varias etiquetas suman o restan?',
				propuesta: 'como hoy: cada etiqueta elegida achica la lista (tiene que tener todas).'
			},
			{
				pregunta: '¿Dónde van «Ver como lista | grilla» y «Eventos pasados»?',
				propuesta: '«Eventos pasados» dentro de la hoja; «Ver como» queda afuera de este prototipo.'
			},
			{
				pregunta: '¿La barra queda fija al bajar en todas las listas o solo en el calendario?'
			},
			{
				pregunta: '¿En compu se mantiene el árbol en su columna (como hoy) o va la misma barra?',
				propuesta: 'solo cambia el celu; en pantallas anchas sigue el árbol.'
			},
			{
				pregunta: '¿El buscador de texto de arriba de la lista se queda aparte o entra en la hoja?'
			}
		]}
	/>
</Marco>

<Sheet bind:open={sheetOpen} title="Filtros">
	{#if sheetOpen}
		<!-- Se arma recién al abrir: con la hoja cerrada no hay árbol de etiquetas en la página. -->
		<div class="hoja">
			<label class="buscar">
				<Search size={18} aria-hidden="true" />
				<span class="visually-hidden">Buscar una etiqueta</span>
				<input type="search" placeholder="Buscar una etiqueta" bind:value={query} />
			</label>

			<div class="pasados">
				<span>Eventos pasados</span>
				<Segmented
					options={[
						{ value: 'mostrar', label: 'Mostrar' },
						{ value: 'ocultar', label: 'Ocultar' }
					]}
					bind:value={showPast}
					label="Eventos pasados"
				/>
			</div>

			{#each groups as g (g.group)}
				<section class="grupo">
					<h3>{$tagManager.get(g.group)?.visible_name ?? g.group}</h3>
					<ul class="grupo-chips">
						{#each g.tags as tag (tag)}
							<li>
								<TagChip
									{tag}
									name="chip-hoja"
									checkbox
									selected={selected.includes(tag)}
									on:change={(e) => toggle(tag, /** @type {any} */ (e.target).checked)}
								/>
							</li>
						{/each}
					</ul>
				</section>
			{:else}
				<p class="nada">Ninguna etiqueta con «{query}» en esta lista.</p>
			{/each}

			<div class="pie">
				<Button surface="sitio" variant="secondary" disabled={active === 0} on:click={clear}>
					Limpiar{active > 0 ? ` (${active})` : ''}
				</Button>
				<Button surface="sitio" on:click={() => (sheetOpen = false)}>
					Ver {n(results.length, 'resultado', 'resultados')}
				</Button>
			</div>
		</div>
	{/if}
</Sheet>

<style>
	.selector {
		max-width: 40rem;
		margin: 0 auto var(--space-s);
	}
	.pantalla {
		max-width: 40rem;
		margin: 0 auto;
	}
	.titulo-lista {
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-2xl);
		color: var(--1);
		text-align: center;
	}
	.nota {
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.barra {
		position: sticky;
		top: 0;
		z-index: 5;
		margin: 0 calc(-1 * var(--space-xs));
		padding: var(--space-3xs) var(--space-xs) 0;
		background: var(--bg);
		box-shadow: 0 0.4em 0.6em -0.6em rgba(0, 0, 0, 0.25);
	}
	.fila {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.filtros-btn,
	.mas,
	.limpiar {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
		border-radius: var(--radius-pill);
	}
	.filtros-btn,
	.mas {
		flex: none;
		min-height: var(--tap);
		padding: 0 0.9em;
		color: var(--1-ink);
		background: var(--surface);
		border: 1px solid var(--1);
		font-weight: 700;
		white-space: nowrap;
	}
	.filtros-btn.on {
		background: var(--1-tint);
	}
	.cuenta {
		background: var(--1);
		color: white;
		border-radius: var(--radius-pill);
		min-width: 1.4em;
		padding: 0 0.4em;
		font-size: 0.85em;
		text-align: center;
	}
	.chips {
		list-style: none;
		margin: 0;
		padding: 0 var(--space-xs) 0 0;
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		overflow-x: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		/* fundido a la derecha: hay más de costado */
		mask-image: linear-gradient(to right, black calc(100% - 2em), transparent);
	}
	.chips li {
		flex: none;
	}
	.mas {
		font-weight: 400;
		border-style: dashed;
	}
	.estado {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: var(--tap);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.limpiar {
		min-height: var(--tap);
		padding: 0 0.6em;
		border: 0;
		background: none;
		color: var(--2-dark);
		text-decoration: underline;
	}
	.posts {
		list-style: none;
		margin: var(--space-2xs) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.vacio {
		text-align: center;
		padding: var(--space-m) 0;
	}
	.hoja {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.buscar {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: 0 var(--space-xs);
		min-height: var(--tap);
		border: 1px solid var(--field);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--muted);
	}
	.buscar:focus-within {
		border-color: var(--focus-field);
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.buscar input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: none;
		font: inherit;
		font-size: var(--text-field);
		color: var(--ink);
	}
	.pasados {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		font-size: var(--text-sm);
	}
	.grupo h3 {
		margin: 0 0 var(--space-3xs);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.grupo h3::first-letter {
		text-transform: uppercase;
	}
	.grupo-chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.nada {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.pie {
		position: sticky;
		bottom: calc(-1 * var(--space-s));
		display: flex;
		justify-content: space-between;
		gap: var(--space-2xs);
		padding: var(--space-2xs) 0 var(--space-s);
		margin-bottom: calc(-1 * var(--space-s));
		background: var(--surface);
		border-top: 1px solid var(--line);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
