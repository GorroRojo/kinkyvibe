<!--
	List of a content section of the panel (/admin/material, /admin/amigues): search, filters by
	state and tag, CSV, and per-post actions (edit, duplicate, view, list/unlist).
-->
<script>
	import { enhance } from '$app/forms';
	import {
		Copy,
		ExternalLink,
		Eye,
		EyeOff,
		ImageOff,
		Pencil,
		Plus,
		Search,
		SearchX,
		X
	} from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { canonicalTag, siteTags } from '$lib/utils/adminTags.js';
	import { filterContentRows, topTags } from '$lib/utils/contentPosts.js';

	/** @type {'material'|'amigues'} */
	export let category;
	/** @type {import('$lib/utils/contentPosts.js').ContentRow[]} */
	export let rows = [];
	/** @type {any} */
	export let form = null;
	export let title = '';
	export let subtitle = '';
	export let newLabel = 'Nuevo';
	export let canDuplicate = false;

	const tm = siteTags();
	/** @param {string} t */
	const canon = (t) => canonicalTag(t, tm);
	/** @param {string} t */
	const tagLabel = (t) => {
		const tag = tm.get(t);
		return `${tag?.icon ? tag.icon.trim() + ' ' : ''}${tag?.visible_name ?? t}`;
	};

	let q = '';
	/** @type {''|'listadas'|'no-listadas'|'sin-imagen'} */
	let state = '';
	/** @type {string[]} */
	let tags = [];
	/** @type {Record<string, boolean>} slugs whose visibility changed in this visit */
	let flipped = {};
	/** @type {string} */
	let busy = '';

	$: view = rows.map((r) =>
		flipped[r.slug] !== undefined ? { ...r, unlisted: flipped[r.slug] } : r
	);
	$: shown = filterContentRows(view, { q, tags, state, canon });
	$: chips = topTags(view, canon, 16);
	$: counts = {
		'': view.length,
		listadas: view.filter((r) => !r.unlisted && !r.unpublished).length,
		'no-listadas': view.filter((r) => r.unlisted || r.unpublished).length,
		'sin-imagen': view.filter((r) => !r.thumb).length
	};

	/** @type {Array<{id: ''|'listadas'|'no-listadas'|'sin-imagen', label: string}>} */
	const STATES = [
		{ id: '', label: 'Todas' },
		{ id: 'listadas', label: 'Listadas' },
		{ id: 'no-listadas', label: 'No listadas' },
		{ id: 'sin-imagen', label: 'Sin imagen' }
	];

	/** @param {string} t */
	function toggleTag(t) {
		tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
	}

	/** @type {import('$lib/admin/csv.js').CsvColumn<import('$lib/utils/contentPosts.js').ContentRow>[]} */
	const columns = [
		{ key: 'slug', label: 'Dirección' },
		{ key: 'title', label: 'Título' },
		{ key: 'published', label: 'Publicado' },
		{ key: 'updated', label: 'Actualizado' },
		{ label: 'Autores', value: (r) => r.authors.join(', ') },
		{ label: 'Etiquetas', value: (r) => r.tags.join(', ') },
		{
			label: 'Estado',
			value: (r) => (r.unpublished ? 'no publicada' : r.unlisted ? 'no listada' : 'listada')
		},
		{ key: 'link', label: 'Link' },
		{ label: 'URL', value: (r) => `https://kinkyvibe.ar/${category}/${r.slug}` }
	];
</script>

<PageHeader {title} {subtitle}>
	<svelte:fragment slot="actions">
		<CsvButton rows={shown} {columns} filename={csvFilename(category)} />
		<a class="kv-btn" href="/admin/{category}/nuevo"
			><Plus size={18} aria-hidden="true" /> {newLabel}</a
		>
	</svelte:fragment>
</PageHeader>

{#if form?.error}<p class="msg bad" role="alert">{form.error}</p>{/if}
{#if form?.visibility && !form.visibility.unchanged}
	<p class="msg ok" role="status">
		Listo: «{form.visibility.slug}» {form.visibility.unlisted
			? 'ya no aparece en las listas'
			: 'vuelve a aparecer en las listas'}. El sitio se actualiza en unos minutos.
	</p>
{/if}

<Card padded={false}>
	<div class="filters">
		<label class="search">
			<Search size={18} aria-hidden="true" />
			<span class="sr">Buscar</span>
			<input
				type="search"
				bind:value={q}
				placeholder="Buscar por título, autore, etiqueta…"
				id="content-q"
			/>
		</label>
		<div class="states" role="group" aria-label="Estado">
			{#each STATES as s}
				<button
					type="button"
					class="pill"
					aria-pressed={state === s.id}
					on:click={() => (state = s.id)}>{s.label} <span class="num">{counts[s.id]}</span></button
				>
			{/each}
		</div>
		<div class="tags" role="group" aria-label="Etiquetas más usadas">
			{#each chips as c}
				<button
					type="button"
					class="chip"
					aria-pressed={tags.includes(c.id)}
					on:click={() => toggleTag(c.id)}
					>{tagLabel(c.id)} <span class="num">{c.count}</span></button
				>
			{/each}
			{#if tags.length || q || state}
				<button
					type="button"
					class="chip clear"
					on:click={() => ((tags = []), (q = ''), (state = ''))}
				>
					<X size={14} aria-hidden="true" /> Limpiar
				</button>
			{/if}
		</div>
	</div>

	<p class="count muted" aria-live="polite">
		{shown.length === view.length
			? `${view.length} publicaciones`
			: `${shown.length} de ${view.length}`}
	</p>

	{#if shown.length}
		<ul class="rows">
			{#each shown as r (r.slug)}
				<li class="row">
					<a class="thumb" href="/admin/{category}/{r.slug}" tabindex="-1" aria-hidden="true">
						{#if r.thumb}<img src={r.thumb} alt="" loading="lazy" />{:else}<ImageOff
								size={20}
							/>{/if}
					</a>
					<div class="main">
						<div class="line">
							<a class="title" href="/admin/{category}/{r.slug}">{r.title}</a>
							{#if r.unpublished}<Badge tone="bad">No publicada</Badge>
							{:else if r.unlisted}<Badge tone="warn">No listada</Badge>{/if}
						</div>
						<div class="meta muted">
							<code>{r.slug}</code>
							{#if r.published}· {r.published}{/if}
							{#if r.authors.length}· {r.authors.join(', ')}{/if}
						</div>
						{#if r.tags.length}
							<div class="rtags">
								{#each r.tags.slice(0, 8) as t}<span class="mini">{tagLabel(canon(t))}</span>{/each}
								{#if r.tags.length > 8}<span class="mini more">+{r.tags.length - 8}</span>{/if}
							</div>
						{/if}
					</div>
					<div class="actions">
						<a
							class="kv-btn ghost icon"
							href="/admin/{category}/{r.slug}"
							title="Editar"
							aria-label="Editar {r.title}"><Pencil size={16} /></a
						>
						{#if canDuplicate}
							<a
								class="kv-btn ghost icon"
								href="/admin/{category}/nuevo?desde={encodeURIComponent(r.slug)}"
								title="Duplicar"
								aria-label="Duplicar {r.title}"><Copy size={16} /></a
							>
						{/if}
						<a
							class="kv-btn ghost icon"
							href="/{category}/{r.slug}"
							target="_blank"
							rel="noreferrer"
							title="Ver en el sitio"
							aria-label="Ver {r.title} en el sitio"><ExternalLink size={16} /></a
						>
						{#if !r.unpublished}
							<form
								method="POST"
								action="?/visibilidad"
								use:enhance={() => {
									busy = r.slug;
									return async ({ result, update }) => {
										busy = '';
										if (result.type === 'success') flipped = { ...flipped, [r.slug]: !r.unlisted };
										await update({ reset: false, invalidateAll: false });
									};
								}}
							>
								<input type="hidden" name="slug" value={r.slug} />
								<input type="hidden" name="unlisted" value={r.unlisted ? '0' : '1'} />
								<button
									class="kv-btn ghost icon"
									disabled={busy === r.slug}
									title={r.unlisted ? 'Volver a listar' : 'Sacar de las listas'}
									aria-label={(r.unlisted ? 'Volver a listar ' : 'Sacar de las listas ') + r.title}
								>
									{#if r.unlisted}<Eye size={16} />{:else}<EyeOff size={16} />{/if}
								</button>
							</form>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState
			icon={SearchX}
			title="Nada con esos filtros"
			text="Probá con otra búsqueda o limpiá los filtros."
		/>
	{/if}
</Card>

<style>
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.msg {
		border-radius: var(--round, 1rem);
		padding: 0.6rem 1rem;
		margin: 0 0 1rem;
	}
	.msg.ok {
		background: var(--ok-bg);
		color: var(--ok);
	}
	.msg.bad {
		background: var(--bad-bg);
		color: var(--bad);
	}
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1rem 1rem 0.4rem;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--field);
		border-radius: 3em;
		padding: 0 0.9rem;
		color: var(--muted);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.6rem 0;
		color: var(--text);
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--link);
		outline-offset: 2px;
	}
	.states,
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pill,
	.chip {
		border: 1px solid var(--field);
		background: var(--surface);
		border-radius: 2em;
		padding: 0.35rem 0.8rem;
		cursor: pointer;
		font-weight: 700;
		font-size: 0.85rem;
		min-height: 2.2rem;
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
	}
	.chip {
		font-weight: 400;
		min-height: 1.9rem;
		padding: 0.2rem 0.7rem;
	}
	.pill[aria-pressed='true'],
	.chip[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.pill .num,
	.chip .num {
		opacity: 0.7;
		font-size: 0.8em;
	}
	.chip.clear {
		color: var(--muted);
	}
	.count {
		margin: 0.3rem 1rem 0.2rem;
		font-size: 0.85rem;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 3.4rem 1fr auto;
		gap: 0.8rem;
		align-items: center;
		padding: 0.7rem 1rem;
		border-top: 1px solid var(--line);
	}
	.row:hover {
		background: var(--surface-2);
	}
	.thumb {
		width: 3.4rem;
		height: 3.4rem;
		border-radius: 0.8rem;
		overflow: hidden;
		background: var(--surface-2);
		display: grid;
		place-items: center;
		color: var(--muted);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.main {
		min-width: 0;
	}
	.line {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.title {
		font-weight: 700;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: 0.82rem;
		overflow-wrap: anywhere;
	}
	.meta code {
		font-size: 0.95em;
	}
	.rtags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.3rem;
	}
	.mini {
		font-size: 0.75rem;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 1em;
		padding: 0 0.5em;
		white-space: nowrap;
	}
	.actions {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.actions form {
		display: contents;
	}
	.icon {
		padding: 0 !important;
		width: 2.5rem;
		height: 2.5rem;
		justify-content: center;
	}
	@media (max-width: 640px) {
		.row {
			grid-template-columns: 3rem 1fr;
		}
		.thumb {
			width: 3rem;
			height: 3rem;
		}
		.actions {
			grid-column: 1 / -1;
			justify-content: flex-start;
		}
	}
</style>
