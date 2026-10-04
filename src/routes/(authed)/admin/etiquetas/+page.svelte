<script>
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import {
		AlertTriangle,
		ArrowRightLeft,
		BookOpen,
		CircleCheck,
		Eye,
		FolderInput,
		GitMerge,
		LoaderCircle,
		Pencil,
		Plus,
		Save,
		Search,
		Trash2,
		Undo2,
		X
	} from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import TagTreeNode from '$lib/components/admin/tags/TagTreeNode.svelte';
	import TagGraph from '$lib/components/admin/tags/TagGraph.svelte';
	import RenameChoice from '$lib/components/admin/tags/RenameChoice.svelte';
	import { normalizeText } from '$lib/utils/adminTags.js';
	import { USAGE_CATEGORIES, analyzeTags, applyTagOps, describeOp } from '$lib/utils/tagConfig.js';
	import { SYSTEM_TAGS, isSystemTag } from '$lib/utils/systemTags.js';

	/** @type {import('./$types').PageData} */
	export let data;

	const CAT_LABEL = /** @type {Record<string, string>} */ ({
		calendario: 'Eventos',
		material: 'Material',
		amigues: 'Amigues',
		wiki: 'Kinkipedia'
	});

	/* ---------- pending changes, applied live to the tree ---------- */
	/** @type {import('$lib/utils/tagConfig.js').TagOp[]} */
	let ops = [];
	let opError = '';
	$: current = applyTagOps(
		data.entries.map((value) => ({ value })),
		ops
	).map((e) => e.value);
	$: view = analyzeTags(current, data.usage, data.wikiPosts);
	$: byId = new Map(view.nodes.map((n) => [n.id, n]));
	$: allNames = view.nodes
		.map((n) => n.id)
		.filter((id) => id !== 'root')
		.sort((a, b) => a.localeCompare(b, 'es'));

	/**
	 * Queues an operation if it applies cleanly.
	 * @param {import('$lib/utils/tagConfig.js').TagOp} op
	 * @param {string} [select] tag to select afterwards
	 */
	function queue(op, select) {
		try {
			applyTagOps(
				data.entries.map((value) => ({ value })),
				[...ops, op]
			);
		} catch (e) {
			opError = e instanceof Error ? e.message : String(e);
			return false;
		}
		opError = '';
		ops = [...ops, op];
		preview = null;
		if (select !== undefined) selectTag(select);
		return true;
	}
	function undo() {
		ops = ops.slice(0, -1);
		preview = null;
	}

	/* ---------- tree ---------- */
	/** @type {Record<string, boolean>} */
	let open = { root: true };
	let q = '';
	$: nq = normalizeText(q);
	$: matches = nq
		? view.nodes
				.filter(
					(n) =>
						n.id !== 'root' &&
						[n.id, n.name, ...n.aka, ...n.variants].some((s) => normalizeText(s).includes(nq))
				)
				.sort((a, b) => b.total - a.total)
				.slice(0, 60)
		: [];
	/** @param {string} id */
	function toggle(id) {
		open = { ...open, [id]: !(open[id] ?? false) };
	}
	/**
	 * @param {string} id
	 * @param {string | null} from
	 * @param {string} to
	 */
	function onMove(id, from, to) {
		queue({ type: 'move', id, from, to }, id);
		open = { ...open, [to]: true };
	}

	/* ---------- selection & detail form ---------- */
	let selected = '';
	/** @type {{icon: string, visible_name: string, color: string, image: string, description: string, related: string}} */
	let fields = { icon: '', visible_name: '', color: '', image: '', description: '', related: '' };
	let renameTo = '';
	// Con la base, por defecto se renombra en las publicaciones sin dejar alias (RenameChoice).
	let keepAlias = !data.dbMode;
	let mergeInto = '';
	let moveTo = '';
	let newAlias = '';
	let childName = '';
	/** @param {string} id */
	function selectTag(id) {
		selected = id;
		// In the one-column layout the detail is above the tree: bring it into view.
		if (id && typeof matchMedia !== 'undefined' && matchMedia('(max-width: 1000px)').matches)
			tick().then(() => document.querySelector('.side')?.scrollIntoView({ behavior: 'smooth' }));
		const n = byIdNow().get(id);
		fields = {
			icon: n?.icon ?? '',
			visible_name: n && n.name !== id ? n.name : '',
			color: current.find((e) => e.id === id && !e.aliasOf)?.color ?? '',
			image: current.find((e) => e.id === id && !e.aliasOf)?.image ?? '',
			description: n?.description ?? '',
			related: (current.find((e) => e.id === id && !e.aliasOf)?.related ?? []).join(', ')
		};
		renameTo = '';
		keepAlias = !data.dbMode;
		mergeInto = '';
		moveTo = '';
		newAlias = '';
		childName = '';
	}
	// `byId` is reactive; read it fresh right after an op is queued.
	const byIdNow = () =>
		new Map(
			analyzeTags(
				applyTagOps(
					data.entries.map((value) => ({ value })),
					ops
				).map((e) => e.value),
				data.usage,
				data.wikiPosts
			).nodes.map((n) => [n.id, n])
		);
	$: node = byId.get(selected);
	$: undeclared = view.undeclared.find((u) => u.id === selected);
	$: maxCount = Math.max(
		1,
		...USAGE_CATEGORIES.map((c) => node?.counts[c] ?? undeclared?.counts[c] ?? 0)
	);

	function saveFields() {
		if (!node) return;
		const entry = current.find((e) => e.id === selected && !e.aliasOf) ?? {};
		/** @type {Record<string, any>} */
		const set = {};
		if (fields.icon.trim() !== (entry.icon ?? '').trim()) set.icon = fields.icon;
		if (fields.visible_name.trim() !== (entry.visible_name ?? ''))
			set.visible_name = fields.visible_name;
		if (fields.color.trim() !== (entry.color ?? '')) set.color = fields.color;
		if (fields.image.trim() !== (entry.image ?? '')) set.image = fields.image;
		if (fields.description.trim() !== (entry.description ?? ''))
			set.description = fields.description;
		const rel = fields.related
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (rel.join('\n') !== (entry.related ?? []).join('\n')) set.related = rel;
		if (!Object.keys(set).length) {
			opError = 'No cambiaste nada.';
			return;
		}
		queue({ type: 'update', id: selected, set }, selected);
	}

	/* ---------- preview & save ---------- */
	/** @typedef {{total: number, files: Array<{path: string, added: number, removed: number, more: number, hunks: Array<{oldStart: number, newStart: number, lines: Array<{t: string, s: string}>}>}>}} PreviewFiles */
	/** @type {null | (PreviewFiles & {summary: string[], warnings?: string[], posts?: PreviewFiles | null})} */
	let preview = null;
	let busy = '';
	let saveError = '';
	/** @type {null | {commit: string, publish?: any, summary: string[], files: number, posts?: number}} */
	let saved = null;
	/**
	 * @param {string} action
	 * @returns {Promise<any>}
	 */
	async function post(action) {
		const body = new FormData();
		body.set('ops', JSON.stringify(ops));
		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		/** @type {any} */
		return deserialize(await response.text());
	}
	async function doPreview() {
		busy = 'preview';
		saveError = '';
		try {
			const r = await post('previsualizar');
			if (r.type === 'success') preview = r.data.preview;
			else saveError = r.data?.error ?? 'No se pudo armar la vista previa.';
		} catch (e) {
			saveError = 'No se pudo armar la vista previa.';
		}
		busy = '';
	}
	async function doSave() {
		busy = 'save';
		saveError = '';
		try {
			const r = await post('guardar');
			if (r.type === 'success') {
				saved = r.data.saved;
				ops = [];
				preview = null;
				await invalidateAll();
				if (selected) selectTag(byIdNow().has(selected) ? selected : '');
			} else saveError = r.data?.error ?? 'No se pudo guardar.';
		} catch (e) {
			saveError = 'No se pudo guardar.';
		}
		busy = '';
	}

	/* ---------- issues ---------- */
	/** @typedef {'sueltas'|'sin-declarar'|'sin-usar'|'rotas'} IssueTab */
	/** @type {Array<[IssueTab, string]>} */
	const ISSUE_TABS = [
		['sin-declarar', 'Sin declarar'],
		['sueltas', 'Fuera del árbol'],
		['sin-usar', 'Sin usar'],
		['rotas', 'Referencias rotas']
	];
	/** @type {IssueTab} */
	let issueTab = 'sin-declarar';
	$: issueCounts = {
		sueltas: view.orphans.length,
		'sin-declarar': view.undeclared.length,
		'sin-usar': view.unused.length,
		rotas: view.broken.length
	};
	$: csvRows = view.nodes
		.filter((n) => n.id !== 'root')
		.map((n) => ({ ...n, parentsText: n.parents.join(', ') }));
	/** @type {import('$lib/admin/csv.js').CsvColumn<any>[]} */
	const csvColumns = [
		{ key: 'id', label: 'Etiqueta' },
		{ key: 'name', label: 'Nombre visible' },
		{ key: 'parentsText', label: 'Madres' },
		{ label: 'Alias', value: (n) => [...n.aka, ...n.variants].join(', ') },
		...USAGE_CATEGORIES.map((c) => ({
			label: CAT_LABEL[c],
			value: (/** @type {any} */ n) => n.counts[c] ?? 0
		})),
		{ key: 'total', label: 'Total' }
	];
</script>

<PageHeader
	title="Etiquetas"
	subtitle="El árbol de etiquetas del sitio, cuánto se usa cada una y la Kinkipedia. Arrastrá una etiqueta sobre otra para moverla."
>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href="/admin/etiquetas/importar">Importar a la base</a>
		<CsvButton rows={csvRows} columns={csvColumns} filename="etiquetas.csv" />
	</svelte:fragment>
</PageHeader>

{#if data.dbMode}
	<p class="note">
		Las etiquetas se leen de la base (interruptor «Etiquetas desde la base»): los cambios se guardan
		al momento, sin commits (salvo renombrar en las publicaciones, que las cambia con un commit).
		Los textos de la Kinkipedia siguen en sus publicaciones.
	</p>
{/if}
{#if data.mock}
	<p class="note warn">
		Modo de prueba (<code>npm run dev:admin</code>): los «commits» van a una carpeta temporal.
	</p>
{/if}
{#if saved}
	<p class="note ok" role="status">
		<CircleCheck size={18} aria-hidden="true" />
		{#if data.dbMode}Guardado en la base ({saved.files} cambio{saved.files === 1
				? ''
				: 's'}):{:else}Guardado ({saved.files} archivo{saved.files === 1 ? '' : 's'}):{/if}
		{saved.summary.join('; ')}.
		{#if data.dbMode}En menos de un minuto se ve en el sitio.{#if saved.posts}
				Además, un commit cambia {saved.posts} publicaci{saved.posts === 1 ? 'ón' : 'ones'}: se ve
				cuando termine de publicarse el sitio.
				{#if saved.publish}<PublishStatus pr={saved.publish} />{:else if saved.commit}<a
						href={saved.commit}
						target="_blank"
						rel="noreferrer">Ver el commit</a
					>{/if}{/if}{:else if saved.publish}<PublishStatus pr={saved.publish} />{:else}<a
				href={saved.commit}
				target="_blank"
				rel="noreferrer">Ver el commit</a
			>. El sitio se actualiza en unos minutos.{/if}
	</p>
{/if}

<datalist id="tag-names">
	{#each allNames as n}<option value={n}></option>{/each}
</datalist>

<div class="layout">
	<Card padded={false}>
		<div class="tree-head">
			<label class="search">
				<Search size={18} aria-hidden="true" />
				<input
					type="search"
					bind:value={q}
					placeholder="Buscar etiqueta o alias…"
					aria-label="Buscar etiqueta"
				/>
			</label>
		</div>
		{#if nq}
			<ul class="flat">
				{#each matches as n (n.id)}
					<li>
						<button type="button" class:sel={selected === n.id} on:click={() => selectTag(n.id)}>
							<span class="dot" style:background={n.color ?? 'var(--line)'}></span>
							{n.icon}
							{n.name}
							{#if n.name !== n.id}<small>{n.id}</small>{/if}
							<span class="count">{n.total}</span>
						</button>
					</li>
				{:else}
					<li class="muted pad">Ninguna etiqueta se llama así.</li>
				{/each}
			</ul>
		{:else}
			<ul class="tree" role="tree" aria-label="Árbol de etiquetas">
				<TagTreeNode
					id="root"
					{byId}
					{open}
					{selected}
					onSelect={selectTag}
					{onMove}
					onToggle={toggle}
				/>
			</ul>
		{/if}
	</Card>

	<div class="side">
		{#if ops.length || opError || saveError}
			<Card title="Cambios sin guardar">
				{#if opError}<p class="err" role="alert">
						<AlertTriangle size={16} aria-hidden="true" />
						{opError}
					</p>{/if}
				{#if ops.length}
					<ol class="ops">
						{#each ops as op}<li>{describeOp(op)}</li>{/each}
					</ol>
					<div class="actions">
						<button type="button" class="kv-btn ghost" on:click={undo}
							><Undo2 size={16} /> Deshacer el último</button
						>
						<button
							type="button"
							class="kv-btn ghost"
							on:click={() => ((ops = []), (preview = null))}><X size={16} /> Descartar</button
						>
						<button type="button" class="kv-btn" on:click={doPreview} disabled={busy !== ''}>
							{#if busy === 'preview'}<LoaderCircle size={16} class="spin" />{:else}<Eye
									size={16}
								/>{/if} Vista previa
						</button>
					</div>
				{/if}
				{#if saveError}<p class="err" role="alert">{saveError}</p>{/if}
				{#if preview}
					<div class="preview">
						{#if data.dbMode}
							<p>
								Cambia{preview.total === 1 ? '' : 'n'}
								<strong>{preview.total} etiqueta{preview.total === 1 ? '' : 's'}</strong> en la base:
							</p>
							{#each preview.warnings ?? [] as w}<p class="err">
									<AlertTriangle size={16} aria-hidden="true" />
									{w}
								</p>{/each}
						{:else}
							<p>
								<strong>Un solo commit</strong> que cambia {preview.total} archivo{preview.total ===
								1
									? ''
									: 's'}:
							</p>
						{/if}
						{#each preview.files as f}
							<details open={preview.files.length <= 3}>
								<summary
									><code>{f.path}</code> <span class="plus">+{f.added}</span>
									<span class="minus">−{f.removed}</span></summary
								>
								{#each f.hunks as h}
									<pre class="diff">{#each h.lines as l}<span
												class="l{l.t === '+' ? ' add' : l.t === '-' ? ' del' : ''}">{l.t}{l.s}</span
											>{/each}</pre>
								{/each}
								{#if f.more}<p class="muted">… y {f.more} bloques más.</p>{/if}
							</details>
						{/each}
						{#if preview.total > preview.files.length}<p class="muted">
								… y {preview.total - preview.files.length} archivos más.
							</p>{/if}
						{#if preview.posts}
							<p>
								{#if preview.posts.total}
									Y <strong>un commit</strong> que cambia
									<strong
										>{preview.posts.total} publicaci{preview.posts.total === 1
											? 'ón'
											: 'ones'}</strong
									> (el nombre viejo deja de existir):
								{:else}
									Ninguna publicación usa el nombre viejo: no hace falta cambiar ninguna.
								{/if}
							</p>
							{#each preview.posts.files as f}
								<details open={preview.posts.files.length <= 3}>
									<summary
										><code>{f.path}</code> <span class="plus">+{f.added}</span>
										<span class="minus">−{f.removed}</span></summary
									>
									{#each f.hunks as h}
										<pre class="diff">{#each h.lines as l}<span
													class="l{l.t === '+' ? ' add' : l.t === '-' ? ' del' : ''}"
													>{l.t}{l.s}</span
												>{/each}</pre>
									{/each}
								</details>
							{/each}
							{#if preview.posts.total > preview.posts.files.length}<p class="muted">
									… y {preview.posts.total - preview.posts.files.length} publicaciones más.
								</p>{/if}
						{/if}
						<button type="button" class="kv-btn" on:click={doSave} disabled={busy !== ''}>
							{#if busy === 'save'}<LoaderCircle size={16} class="spin" />{:else}<Save
									size={16}
								/>{/if} Confirmar y guardar
						</button>
					</div>
				{/if}
			</Card>
		{/if}

		{#if node && selected !== 'root'}
			{@const n = node}
			<Card>
				<div class="detail-head">
					<span class="big-dot" style:background={n.color ?? 'var(--line)'}></span>
					<h2>{n.icon} {n.name}</h2>
					{#if n.name !== n.id}<code>{n.id}</code>{/if}
					{#if !n.declared}<Badge tone="info" title="Aparece como hija pero no tiene entrada propia"
							>sin entrada</Badge
						>{/if}
				</div>
				<TagGraph node={n} {byId} onSelect={selectTag} />

				<div class="usage">
					{#each USAGE_CATEGORIES as c}
						<div class="bar">
							<span>{CAT_LABEL[c]}</span>
							<span class="track"
								><span style:width="{((n.counts[c] ?? 0) / maxCount) * 100}%"></span></span
							>
							<a href="/todo?tags={encodeURIComponent(n.id)}" class="num">{n.counts[c] ?? 0}</a>
						</div>
					{/each}
				</div>

				<div class="chips">
					<span class="lbl">Otros nombres</span>
					{#each n.aka as a}
						<span class="chip"
							>{a}<button
								type="button"
								aria-label="Sacar {a}"
								on:click={() => queue({ type: 'removeAlias', id: n.id, alias: a }, n.id)}
								><X size={12} /></button
							></span
						>
					{/each}
					{#each n.variants as a}
						<span class="chip variant" title="Variante de escritura (aliasOf)"
							>{a}<button
								type="button"
								aria-label="Sacar {a}"
								on:click={() => queue({ type: 'removeAlias', id: n.id, alias: a }, n.id)}
								><X size={12} /></button
							></span
						>
					{/each}
					<form
						class="inline"
						on:submit|preventDefault={() =>
							newAlias.trim() && queue({ type: 'addAlias', id: n.id, alias: newAlias }, n.id)}
					>
						<input
							class="kv-input"
							bind:value={newAlias}
							placeholder="Agregar alias"
							aria-label="Nuevo alias"
						/>
						<button class="kv-btn ghost small" aria-label="Agregar alias"><Plus size={14} /></button
						>
					</form>
				</div>

				<form class="grid" on:submit|preventDefault={saveFields}>
					<label
						>Ícono <input class="kv-input" bind:value={fields.icon} placeholder="Ej.: 🪢" /></label
					>
					<label
						>Nombre visible <input
							class="kv-input"
							bind:value={fields.visible_name}
							placeholder={n.id}
						/></label
					>
					<label
						>Color <input
							class="kv-input"
							bind:value={fields.color}
							placeholder="(el de su madre)"
						/></label
					>
					<label
						>Imagen (series) <input
							class="kv-input"
							bind:value={fields.image}
							placeholder="Ej.: serie.webp (de src/lib/assets)"
						/></label
					>

					<label
						>Relacionadas <input
							class="kv-input"
							bind:value={fields.related}
							placeholder="separadas por coma"
							list="tag-names"
						/></label
					>
					<label class="wide"
						><span><BookOpen size={14} aria-hidden="true" /> Definición en la Kinkipedia</span>
						<textarea
							bind:value={fields.description}
							rows="4"
							placeholder="Usá [[otra etiqueta]] para enlazar."></textarea>
					</label>
					<div class="wide actions">
						{#if n.wiki}
							<a class="kv-btn ghost" href="/edit/wiki/{n.wiki}"
								><Pencil size={16} /> Editar la entrada de la Kinkipedia</a
							>
						{/if}
						<a
							class="kv-btn ghost"
							href="/wiki/{encodeURIComponent(n.id)}"
							target="_blank"
							rel="noreferrer">Ver en la Kinkipedia</a
						>
						<button class="kv-btn"><Save size={16} /> Agregar a los cambios</button>
					</div>
				</form>

				{#if isSystemTag(n.id)}
					<p class="system-note">
						<AlertTriangle size={14} aria-hidden="true" />
						Etiqueta del sistema: {SYSTEM_TAGS[n.id]}. El sitio la usa por su nombre, así que no se
						puede renombrar ni fusionar con otra. Sí podés cambiarle el nombre visible, el ícono o
						la descripción.
					</p>
				{/if}
				<div class="ops-forms">
					{#if !isSystemTag(n.id)}
						<form
							on:submit|preventDefault={() =>
								renameTo.trim() &&
								queue({ type: 'rename', from: n.id, to: renameTo, keepAlias }, renameTo.trim())}
						>
							<label
								><span><Pencil size={14} /> Renombrar</span><input
									class="kv-input"
									bind:value={renameTo}
									placeholder="Nombre nuevo"
								/></label
							>
							<RenameChoice
								dbMode={data.dbMode}
								bind:keepAlias
								idPrefix="renombrar-{n.id}"
								uses={n.total}
							/>
							<button class="kv-btn ghost small"
								>{data.dbMode && keepAlias
									? 'Renombrar'
									: 'Renombrar en todas las publicaciones'}</button
							>
						</form>
					{/if}
					<form
						on:submit|preventDefault={() =>
							moveTo.trim() &&
							queue(
								{ type: 'move', id: n.id, from: n.parents[0] ?? null, to: moveTo.trim() },
								n.id
							)}
					>
						<label
							><span
								><FolderInput size={14} /> Mover {n.parents[0]
									? `(sale de «${n.parents[0]}»)`
									: ''}</span
							><input
								class="kv-input"
								bind:value={moveTo}
								list="tag-names"
								placeholder="Nueva madre"
							/></label
						>
						<div class="row">
							<button class="kv-btn ghost small">Mover</button>
							{#each n.parents as p}
								<button
									type="button"
									class="kv-btn ghost small"
									on:click={() => queue({ type: 'move', id: n.id, from: p, to: null }, n.id)}
									><Trash2 size={14} /> Sacar de «{p}»</button
								>
							{/each}
						</div>
					</form>
					{#if !isSystemTag(n.id)}
						<form
							on:submit|preventDefault={() =>
								mergeInto.trim() &&
								queue({ type: 'merge', from: n.id, into: mergeInto.trim() }, mergeInto.trim())}
						>
							<label
								><span><GitMerge size={14} /> Fusionar con</span><input
									class="kv-input"
									bind:value={mergeInto}
									list="tag-names"
									placeholder="Etiqueta que queda"
								/></label
							>
							<button class="kv-btn ghost small">Fusionar (esta pasa a ser alias)</button>
						</form>
					{/if}
					<form
						on:submit|preventDefault={() =>
							childName.trim() &&
							queue({ type: 'create', id: childName, parent: n.id }, childName.trim())}
					>
						<label
							><span><Plus size={14} /> Etiqueta hija nueva</span><input
								class="kv-input"
								bind:value={childName}
								placeholder="Nombre"
							/></label
						>
						<button class="kv-btn ghost small">Crear</button>
					</form>
				</div>
			</Card>
		{:else if undeclared}
			{@const u = undeclared}
			<Card title="«{u.id}» no está en el árbol">
				<p>
					La usan {u.total} publicaciones ({Object.entries(u.counts)
						.map(([c, n]) => `${CAT_LABEL[c] ?? c}: ${n}`)
						.join(', ')}), pero el sitio la muestra como etiqueta sin categoría.
				</p>
				<div class="ops-forms">
					<form
						on:submit|preventDefault={() =>
							moveTo.trim() && queue({ type: 'create', id: u.id, parent: moveTo.trim() }, u.id)}
					>
						<label
							><span><FolderInput size={14} /> Agregar al árbol dentro de</span><input
								class="kv-input"
								bind:value={moveTo}
								list="tag-names"
								placeholder="Etiqueta madre"
							/></label
						>
						<button class="kv-btn ghost small">Agregar</button>
					</form>
					<form
						on:submit|preventDefault={() =>
							mergeInto.trim() &&
							queue({ type: 'merge', from: u.id, into: mergeInto.trim() }, mergeInto.trim())}
					>
						<label
							><span><ArrowRightLeft size={14} /> Cambiarla por</span><input
								class="kv-input"
								bind:value={mergeInto}
								list="tag-names"
								placeholder="Etiqueta existente"
							/></label
						>
						<button class="kv-btn ghost small">Reemplazar en las publicaciones</button>
					</form>
				</div>
			</Card>
		{:else}
			<Card title="Nueva etiqueta">
				<form
					class="ops-forms"
					on:submit|preventDefault={() =>
						childName.trim() &&
						queue(
							{ type: 'create', id: childName, parent: moveTo.trim() || undefined },
							childName.trim()
						)}
				>
					<label>Nombre <input class="kv-input" bind:value={childName} /></label>
					<label
						>Dentro de <input
							class="kv-input"
							bind:value={moveTo}
							list="tag-names"
							placeholder="(opcional)"
						/></label
					>
					<button class="kv-btn small"><Plus size={14} /> Crear</button>
				</form>
				<p class="muted">Elegí una etiqueta del árbol para ver sus relaciones y editarla.</p>
			</Card>
		{/if}

		<Card title="Para revisar">
			<div class="tabs" role="tablist">
				{#each ISSUE_TABS as [id, label]}
					<button
						type="button"
						role="tab"
						aria-selected={issueTab === id}
						on:click={() => (issueTab = id)}
						>{label} <span class="num">{issueCounts[id]}</span></button
					>
				{/each}
			</div>
			<ul class="issues">
				{#if issueTab === 'sin-declarar'}
					{#each view.undeclared as u}<li>
							<button type="button" on:click={() => selectTag(u.id)}>{u.id}</button>
							<span class="muted">{u.total}</span>
						</li>{:else}<li class="muted">Nada.</li>{/each}
				{:else if issueTab === 'sueltas'}
					{#each view.orphans as id}<li>
							<button type="button" on:click={() => selectTag(id)}
								>{byId.get(id)?.name ?? id}</button
							>
						</li>{:else}<li class="muted">Nada.</li>{/each}
				{:else if issueTab === 'sin-usar'}
					{#each view.unused as id}<li>
							<button type="button" on:click={() => selectTag(id)}
								>{byId.get(id)?.name ?? id}</button
							>
						</li>{:else}<li class="muted">Nada.</li>{/each}
				{:else}
					{#each view.broken as b}<li>
							<button type="button" on:click={() => selectTag(b.from)}>{b.from}</button> →
							<code>{b.to}</code>
							<span class="muted"
								>({b.kind === 'related' ? 'relacionada' : 'alias'} que no existe)</span
							>
						</li>{:else}<li class="muted">Nada.</li>{/each}
				{/if}
			</ul>
		</Card>
	</div>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		gap: var(--space-xs);
		align-items: start;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}
	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.side {
			order: -1;
		}
	}
	.note {
		display: flex;
		gap: var(--space-2xs);
		align-items: center;
		flex-wrap: wrap;
		border-radius: var(--round);
		padding: var(--space-2xs) var(--space-xs);
		margin: 0 0 1rem;
	}
	.note.ok {
		background: var(--ok-bg);
		color: var(--ok);
	}
	.note.warn {
		background: var(--warn-bg);
		color: var(--warn);
	}
	.tree-head {
		padding: var(--space-xs) var(--space-xs) 0.4rem;
	}
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		border: 1px solid var(--field);
		border-radius: 3em;
		padding: 0 var(--space-xs);
		color: var(--muted);
		background: var(--surface);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: var(--space-2xs) 0;
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--accent);
	}
	.tree,
	.flat {
		list-style: none;
		margin: 0;
		padding: var(--space-3xs) var(--space-2xs) var(--space-xs);
		max-height: 78vh;
		overflow: auto;
	}
	.flat button {
		width: 100%;
		display: flex;
		gap: 0.4rem;
		align-items: center;
		border: 0;
		background: none;
		padding: var(--space-2xs);
		border-radius: var(--radius-s);
		cursor: pointer;
		text-align: left;
		min-height: 2.4rem;
	}
	.flat button:hover,
	.flat button.sel {
		background: var(--link-bg);
	}
	.flat small {
		color: var(--muted);
	}
	.flat .count {
		margin-left: auto;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		flex: none;
	}
	.pad {
		padding: var(--space-2xs);
	}
	.detail-head {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		flex-wrap: wrap;
	}
	.detail-head h2 {
		margin: 0;
		font-size: var(--text-base);
	}
	.big-dot {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
	}
	.usage {
		display: grid;
		gap: var(--space-3xs);
	}
	.bar {
		display: grid;
		grid-template-columns: 6.5rem 1fr 2.5rem;
		gap: var(--space-2xs);
		align-items: center;
		font-size: var(--text-xs);
	}
	.track {
		height: 0.55rem;
		background: var(--bar-track);
		border-radius: var(--radius-m);
		overflow: hidden;
	}
	.track span {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: var(--radius-m);
	}
	.bar .num {
		text-align: right;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
		align-items: center;
	}
	.lbl {
		font-size: var(--text-xs);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 700;
		margin-right: 0.3rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		border: 1px solid var(--field);
		border-radius: 2em;
		padding: 0.1rem var(--space-3xs) 0.1rem var(--space-2xs);
		font-size: var(--text-xs);
	}
	.chip.variant {
		border-style: dashed;
	}
	.chip button {
		border: 0;
		background: none;
		cursor: pointer;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		color: var(--muted);
	}
	.inline {
		display: flex;
		gap: var(--space-3xs);
		align-items: center;
	}
	.inline input {
		width: 9rem;
		padding: 0.35em 0.8em;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: var(--space-2xs);
	}
	.grid label,
	.ops-forms label {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-xs);
		font-weight: 700;
	}
	.grid label span,
	.ops-forms label span {
		display: flex;
		gap: var(--space-3xs);
		align-items: center;
	}
	.grid .wide {
		grid-column: 1 / -1;
	}
	textarea {
		border: 1px solid var(--field);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-xs);
		background: var(--surface);
		color: var(--text);
		font-weight: 400;
	}
	.actions,
	.row {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.ops-forms {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: var(--space-xs);
		border-top: 1px solid var(--line);
		padding-top: var(--space-xs);
	}
	.ops-forms form {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		align-items: flex-start;
	}
	.ops-forms label {
		width: 100%;
	}
	label.check {
		flex-direction: row;
		font-weight: 400;
		align-items: flex-start;
	}
	.ops {
		margin: 0;
		padding-left: var(--space-s);
	}
	.err {
		color: var(--bad);
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin: 0;
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		align-items: flex-start;
	}
	.preview details {
		width: 100%;
	}
	.preview summary {
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.plus {
		color: var(--ok);
	}
	.minus {
		color: var(--bad);
	}
	.diff {
		background: var(--surface-2);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) 0;
		font-size: var(--text-xs);
		overflow-x: auto;
		margin: 0.3rem 0;
	}
	.diff .l {
		display: block;
		padding: 0 var(--space-2xs);
		white-space: pre;
	}
	.diff .add {
		background: var(--ok-bg);
		color: var(--ok);
	}
	.diff .del {
		background: var(--bad-bg);
		color: var(--bad);
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.tabs button {
		border: 1px solid var(--field);
		background: var(--surface);
		border-radius: 2em;
		padding: var(--space-3xs) var(--space-xs);
		cursor: pointer;
		font-weight: 700;
		font-size: var(--text-xs);
		min-height: 2.2rem;
	}
	.tabs button[aria-selected='true'] {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
	}
	.issues {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 18rem;
		overflow: auto;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
	}
	.issues button {
		border: 0;
		background: none;
		color: var(--link);
		cursor: pointer;
		text-decoration: underline;
		padding: var(--space-3xs) 0;
	}
	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.system-note {
		display: flex;
		gap: 0.4em;
		align-items: flex-start;
		margin: 0.5em 0;
		font-size: 0.9em;
	}
</style>
