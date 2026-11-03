<script>
	/**
	 * Etiquetas › «Enlaces que faltan»: lo que los textos nombran con `[[…]]`, `@` o `#` y no existe,
	 * de lo que más se escribe a lo que menos (la lista de qué escribir para hacer crecer la
	 * Kinkipedia). Lista y detalle (gorrite, 3/11/2026, opción C): a la izquierda los nombres con una
	 * barrita de cuántas veces se escriben; al elegir uno, a la derecha (abajo en el celular) qué
	 * falta, el botón para crearlo y los textos que lo escriben, con su editor y su página.
	 *
	 * El nombre elegido va en la URL (`?nombre=`): los nombres son links, así que se puede compartir
	 * y anda sin JavaScript. Sin `?nombre=`, en la compu se ve el primero; en el celular, solo la
	 * lista (el detalle de ese primero se esconde con CSS). Un `?nombre=` que ya no falta lo avisa.
	 */
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		BookMarked,
		BookOpen,
		CalendarDays,
		ExternalLink,
		FileText,
		Pencil,
		Plus,
		Unlink,
		Users
	} from '@lucide/svelte';
	import { Card, EmptyState, Notice, PageHeader } from '$lib/components/ui';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @type {Record<string, string>} */
	const TYPE_LABEL = {
		evento: 'Evento',
		material: 'Material',
		perfil: 'Perfil',
		etiqueta: 'Kinkipedia'
	};
	/** @type {Record<string, any>} */
	const TYPE_ICON = {
		evento: CalendarDays,
		material: BookOpen,
		perfil: Users,
		etiqueta: BookMarked
	};
	/** @type {Record<string, string>} */
	const VISIBILITY_LABEL = { members: 'solo con cuenta', hidden: 'oculto' };

	/** Debajo de este ancho la lista y el detalle van uno abajo del otro (igual que el CSS). */
	const NARROW = '(max-width: 760px)';

	/** @param {string} name */
	const hrefOf = (name) => `?nombre=${encodeURIComponent(name)}`;

	$: max = Math.max(1, ...data.items.map((i) => i.count));
	$: wanted = $page.url.searchParams.get('nombre');
	$: chosen = wanted === null ? undefined : data.items.find((i) => i.name === wanted);
	// Sin elegir (o con un nombre que ya no falta), el primero: se ve solo en la compu.
	$: current = chosen ?? data.items[0];
	$: byDefault = !chosen;

	/** @type {HTMLElement | undefined} */
	let list;
	/** @type {HTMLElement | undefined} */
	let heading;

	// En el celular, al elegir un nombre: la lista se queda en ese nombre y el foco (y la vista)
	// pasa al detalle, que está abajo. En la compu el foco sigue en la lista (data-sveltekit-keepfocus).
	afterNavigate(async ({ type }) => {
		if (type !== 'link' || !chosen || !matchMedia(NARROW).matches) return;
		await tick();
		list?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
		heading?.focus();
	});
</script>

<PageHeader
	title="Enlaces que faltan"
	subtitle="Elegí un nombre para ver dónde se escribe y crear su página."
/>

{#if wanted !== null && !chosen}
	<Notice tone="warn" compact role={null}>
		<code>{wanted}</code> ya no falta (o no se escribe así).
	</Notice>
{/if}

{#if data.items.length}
	<div class="split" class:chosen={!byDefault}>
		<Card padded={false} tag="div">
			<nav aria-label="Nombres que faltan" bind:this={list}>
				<ul class="names">
					{#each data.items as item (item.name)}
						<li>
							<a
								href={hrefOf(item.name)}
								class:on={item === current}
								class:default={item === current && byDefault}
								aria-current={item === current && !byDefault ? 'true' : undefined}
								data-sveltekit-noscroll
								data-sveltekit-keepfocus
							>
								<span class="nm">{item.name}</span>
								<span class="bar" aria-hidden="true"
									><span style:width="{(item.count / max) * 100}%"></span></span
								>
								<span class="c"
									>{item.count}<span class="visually-hidden"
										>{` ${item.count === 1 ? 'vez' : 'veces'}`}</span
									></span
								>
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</Card>

		{#if current}
			<div class="detail-wrap" class:default={byDefault}>
				<Card padded>
					<div class="detail">
						<p class="kicker">
							{current.form === 'mencion'
								? 'Mención a un perfil que no existe'
								: 'Página de la Kinkipedia que no existe'}
						</p>
						<h2 class="huge" tabindex="-1" bind:this={heading}><code>{current.name}</code></h2>
						<p class="sum">
							Escrito <strong>{current.count} {current.count === 1 ? 'vez' : 'veces'}</strong>
							en
							<strong
								>{current.sources.length}
								{current.sources.length === 1 ? 'texto' : 'textos'}</strong
							>.
						</p>
						<!-- Al formulario de siempre con el nombre ya cargado: nada se guarda hasta confirmarlo. -->
						<a class="kv-btn create" href={current.create.href}
							><Plus size={18} aria-hidden="true" /> {current.create.label}</a
						>
						<h3>Dónde se escribe</h3>
						<ul class="srcs">
							{#each current.sources as s (s.id)}
								<li>
									<span class="ic" aria-hidden="true"
										><svelte:component this={TYPE_ICON[s.type] ?? FileText} size={16} /></span
									>
									<span class="tt">
										<span class="ti">{s.title}</span>
										<span class="me"
											>{[TYPE_LABEL[s.type] ?? s.type, VISIBILITY_LABEL[s.visibility]]
												.filter(Boolean)
												.join(' · ')}</span
										>
									</span>
									{#if s.editHref}
										<a
											class="kv-btn ghost small icon"
											href={s.editHref}
											title="Editar"
											aria-label="Editar {s.title}"><Pencil size={14} aria-hidden="true" /></a
										>
									{/if}
									{#if s.path}
										<a
											class="kv-btn ghost small icon"
											href={s.path}
											target="_blank"
											rel="noreferrer"
											title="Ver la página"
											aria-label="Ver la página de {s.title} (se abre en otra pestaña)"
											><ExternalLink size={14} aria-hidden="true" /></a
										>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				</Card>
			</div>
		{/if}
	</div>
{:else}
	<EmptyState
		icon={Unlink}
		title="No falta nada"
		text="Todos los enlaces de los textos llevan a algo."
	/>
{/if}

<p class="note">
	Se revisaron {data.scanned} textos{data.truncated
		? ' (los editados más recientemente; hay más)'
		: ''}
	con {data.references} enlaces. Un nombre que lleva a algo oculto no falta: existe.
</p>

<style>
	.split {
		display: grid;
		grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
		gap: var(--space-xs);
		align-items: start;
	}
	.names {
		list-style: none;
		margin: 0;
		padding: var(--space-3xs);
	}
	.names a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 4rem 3ch;
		align-items: center;
		gap: var(--space-2xs);
		min-height: var(--tap);
		padding: 0 var(--space-2xs);
		border-radius: var(--radius-s);
		color: var(--text);
		text-decoration: none;
	}
	.names a:hover {
		background: var(--surface-2);
	}
	.names a:focus-visible {
		outline: 2px solid var(--focus-field);
		outline-offset: -2px;
	}
	.names a.on {
		background: var(--link-bg);
		color: var(--link);
		font-weight: 700;
	}
	.nm {
		font-family: monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--bar-track);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.c {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.detail {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2xs);
	}
	.kicker {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.huge {
		margin: 0;
		font-size: var(--text-xl);
		overflow-wrap: anywhere;
	}
	.huge:focus {
		outline: none;
	}
	.huge:focus-visible {
		outline: 2px solid var(--focus-field);
		outline-offset: 2px;
	}
	.sum {
		margin: 0;
	}
	.create {
		margin-block: var(--space-3xs);
	}
	.detail h3 {
		font-size: var(--text-sm);
		color: var(--muted);
		margin: var(--space-xs) 0 0;
	}
	.srcs {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
	}
	.srcs li {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-3xs) 0;
		border-bottom: 1px solid var(--line);
	}
	.srcs li:last-child {
		border-bottom: 0;
	}
	.ic {
		display: grid;
		place-items: center;
		width: 2em;
		height: 2em;
		border-radius: var(--radius-s);
		background: var(--surface-2);
		color: var(--muted);
		flex: none;
	}
	.tt {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.ti {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.me {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.note {
		color: var(--muted);
		font-size: var(--text-sm);
		max-width: 70ch;
		margin-top: var(--space-s);
	}
	/* Celular: uno abajo del otro. Sin elegir, solo la lista (el primero no se marca ni se abre);
	   con uno elegido, la lista se achica y se desplaza para dejar el detalle a la vista. */
	@media (max-width: 760px) {
		.split {
			grid-template-columns: minmax(0, 1fr);
		}
		.split.chosen nav {
			max-height: 14rem;
			overflow-y: auto;
		}
		.names a.default {
			background: none;
			color: var(--text);
			font-weight: 400;
		}
		.detail-wrap.default {
			display: none;
		}
	}
</style>
