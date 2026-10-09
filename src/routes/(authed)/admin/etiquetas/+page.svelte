<script>
	import Notice from '$lib/components/ui/Notice.svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import {
		AlertTriangle,
		ArrowRightLeft,
		BookOpen,
		CircleCheck,
		FolderInput,
		GitMerge,
		LoaderCircle,
		Pencil,
		Plus,
		Save,
		Search,
		Trash2,
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
	import { wikiEditHref } from '$lib/admin/nav.js';
	import { tagSlug } from '$lib/utils/tagSlug.js';
	import {
		USAGE_CATEGORIES,
		analyzeTags,
		applyTagOps,
		postRenamePairs
	} from '$lib/utils/tagConfig.js';
	import { askConfirm } from '$lib/admin/confirm.js';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';
	import { SYSTEM_TAGS, isSystemTag } from '$lib/utils/systemTags.js';

	/** @type {import('./$types').PageData} */
	export let data;

	const CAT_LABEL = /** @type {Record<string, string>} */ ({
		calendario: 'Eventos',
		material: 'Material',
		amigues: 'Amigues',
		wiki: 'Kinkipedia'
	});

	/* ---------- the tags as saved (each change is saved right away) ---------- */
	// Decisión de gorrite: cada etiqueta se guarda al momento con su propio «Guardar» (o al
	// arrastrarla); ya no hay una lista de «cambios por guardar».
	$: current = data.entries;
	$: view = analyzeTags(current, data.usage, data.wikiPosts);
	$: byId = new Map(view.nodes.map((n) => [n.id, n]));
	$: allNames = view.nodes
		.map((n) => n.id)
		.filter((id) => id !== 'root')
		.sort((a, b) => a.localeCompare(b, 'es'));

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
		open = { ...open, [to]: true };
		save({ type: 'move', id, from, to }, id);
	}

	/* ---------- selection & detail form ---------- */
	let selected = '';
	/** @type {{icon: string, visible_name: string, color: string, image: string, description: string, related: string}} */
	let fields = { icon: '', visible_name: '', color: '', image: '', description: '', related: '' };
	let renameTo = '';
	// Al renombrar, por defecto el nombre viejo queda como alias: los links viejos siguen andando
	// (RenameChoice; antes, con la base, se renombraba sin dejar alias).
	let keepAlias = true;
	let mergeInto = '';
	let moveTo = '';
	let newAlias = '';
	let childName = '';
	// `?etiqueta=<id>` (el buscador del panel): abre el árbol con esa etiqueta elegida.
	onMount(() => {
		const id = new URL(location.href).searchParams.get('etiqueta');
		if (id && byIdNow().has(id)) selectTag(id);
	});

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
		keepAlias = true;
		mergeInto = '';
		moveTo = '';
		newAlias = '';
		childName = '';
	}
	// `byId` is reactive; read it fresh right after the data was reloaded.
	const byIdNow = () =>
		new Map(analyzeTags(data.entries, data.usage, data.wikiPosts).nodes.map((n) => [n.id, n]));
	$: node = byId.get(selected);
	$: undeclared = view.undeclared.find((u) => u.id === selected);
	$: maxCount = Math.max(
		1,
		...USAGE_CATEGORIES.map((c) => node?.counts[c] ?? undeclared?.counts[c] ?? 0)
	);

	function saveFields() {
		if (!node) return;
		/** @type {import('$lib/utils/tagConfig.js').TagEntry} */
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
			saveState = 'error';
			saveError = 'No cambiaste nada.';
			return;
		}
		save({ type: 'update', id: selected, set }, selected);
	}

	/* ---------- save (one change at a time, right away) ---------- */
	let busy = false;
	/** @type {'' | 'saving' | 'saved' | 'error'} */
	let saveState = '';
	let saveError = '';
	/** @type {null | {commit: string, publish?: any, summary: string[], files: number, posts?: number}} */
	let saved = null;
	/**
	 * @param {'previsualizar' | 'guardar'} action
	 * @param {import('$lib/utils/tagConfig.js').TagOp} op
	 * @returns {Promise<any>}
	 */
	async function post(action, op) {
		const body = new FormData();
		body.set('op', JSON.stringify(op));
		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		/** @type {any} */
		return deserialize(await response.text());
	}
	/** @param {string} message */
	function failWith(message) {
		saveState = 'error';
		saveError = message;
		return false;
	}
	/**
	 * Guarda un cambio al momento. Renombrar sin dejar alias (cambia publicaciones) y fusionar
	 * piden confirmación antes; lo demás se guarda directo. El servidor lo vuelve a validar contra
	 * lo que hay en la base ahora (si otra persona cambió algo, gana lo último y avisa si choca).
	 * @param {import('$lib/utils/tagConfig.js').TagOp} op
	 * @param {string} [select] tag to select afterwards
	 */
	async function save(op, select) {
		if (busy) return false;
		try {
			applyTagOps(
				data.entries.map((value) => ({ value })),
				[op]
			);
		} catch (e) {
			return failWith(e instanceof Error ? e.message : String(e));
		}
		busy = true;
		saveState = 'saving';
		saveError = '';
		saved = null;
		try {
			if (!(await confirmOp(op))) {
				if (saveState === 'saving') saveState = '';
				return false;
			}
			const r = await post('guardar', op);
			if (r.type !== 'success') return failWith(r.data?.error ?? 'No se pudo guardar.');
			saved = r.data.saved;
			saveState = 'saved';
			await invalidateAll();
			const next = select ?? selected;
			selectTag(next && byIdNow().has(next) ? next : '');
			return true;
		} catch (e) {
			return failWith('No se pudo guardar.');
		} finally {
			busy = false;
		}
	}
	/**
	 * Lo que necesita un «¿seguro?» antes de guardarse, con la vista previa del servidor (sus
	 * avisos, y cuántas publicaciones cambian): renombrar sin alias y fusionar.
	 * @param {import('$lib/utils/tagConfig.js').TagOp} op
	 * @returns {Promise<boolean>}
	 */
	async function confirmOp(op) {
		const rewritesPosts = postRenamePairs([op], { onlyWithoutAlias: true }).length > 0;
		if (op.type !== 'merge' && !rewritesPosts) return true;
		const r = await post('previsualizar', op);
		if (r.type !== 'success') {
			failWith(r.data?.error ?? 'No se pudo armar la vista previa.');
			return false;
		}
		/** @type {{posts?: {total: number} | null, warnings?: string[]}} */
		const preview = r.data.preview;
		const warnings = preview.warnings ?? [];
		if (op.type === 'merge')
			return askConfirm({
				title: `¿Fusionar «${op.from}» con «${op.into}»?`,
				text: [`«${op.from}» pasa a ser un alias de «${op.into}».`, ...warnings].join(' '),
				confirmLabel: 'Fusionar',
				tone: 'danger'
			});
		const total = preview.posts?.total ?? 0;
		const uses = total
			? `Cambia${total === 1 ? '' : 'n'} ${total} publicaci${total === 1 ? 'ón' : 'ones'} (en la base, al momento) y el nombre viejo deja de existir.`
			: 'Ninguna publicación usa el nombre viejo: no cambia ninguna.';
		const rename = /** @type {{from: string, to: string}} */ (op);
		return askConfirm({
			title: `¿Renombrar «${rename.from}» a «${rename.to.trim()}»?`,
			text: [uses, ...warnings].join(' '),
			confirmLabel: 'Renombrar',
			tone: 'danger'
		});
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
		Los cambios se guardan al momento (renombrar una etiqueta también la cambia en todas las
		publicaciones que la usan). Los textos de la Kinkipedia también están en la base: se editan
		desde cada etiqueta («Entrada de la Kinkipedia»).
	</p>
{/if}
{#if data.mock}
	<div class="mock-note">
		<Notice tone="warn" role={null}>
			Modo de prueba (<code>npm run dev:admin</code>): los «commits» van a una carpeta temporal.
		</Notice>
	</div>
{/if}
{#if saved}
	<p class="note ok" role="status">
		<CircleCheck size={18} aria-hidden="true" />
		{#if data.dbMode}Guardado en la base ({saved.files} cambio{saved.files === 1
				? ''
				: 's'}):{:else}Guardado ({saved.files} archivo{saved.files === 1 ? '' : 's'}):{/if}
		{saved.summary.join('; ')}.
		{#if data.dbMode}En menos de un minuto se ve en el sitio.{#if saved.posts}
				Además, cambiaron {saved.posts} publicaci{saved.posts === 1 ? 'ón' : 'ones'} (en la base).
			{/if}{:else if saved.publish}<PublishStatus pr={saved.publish} />{:else}<a
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
		{#if saveState === 'saving' || saveState === 'error'}
			<p class="save-line">
				{#if saveState === 'error'}<AlertTriangle size={16} aria-hidden="true" />{/if}
				<SaveStatus status={saveState} error={saveError} />
			</p>
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
								on:click={() => save({ type: 'removeAlias', id: n.id, alias: a }, n.id)}
								><X size={12} /></button
							></span
						>
					{/each}
					{#each n.variants as a}
						<span class="chip variant" title="Variante de escritura (aliasOf)"
							>{a}<button
								type="button"
								aria-label="Sacar {a}"
								on:click={() => save({ type: 'removeAlias', id: n.id, alias: a }, n.id)}
								><X size={12} /></button
							></span
						>
					{/each}
					<form
						class="inline"
						on:submit|preventDefault={() =>
							newAlias.trim() && save({ type: 'addAlias', id: n.id, alias: newAlias }, n.id)}
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
						<!-- El texto de la wiki se guarda en la base, en su propio editor (sin GitHub). -->
						<a class="kv-btn ghost" href={wikiEditHref(tagSlug(n.id))}
							><Pencil size={16} />
							{n.wiki
								? 'Editar la entrada de la Kinkipedia'
								: 'Escribir la entrada de la Kinkipedia'}</a
						>
						<a
							class="kv-btn ghost"
							href="/wiki/{encodeURIComponent(n.id)}"
							target="_blank"
							rel="noreferrer">Ver en la Kinkipedia</a
						>
						<button class="kv-btn" disabled={busy}
							>{#if busy}<LoaderCircle size={16} class="spin" />{:else}<Save size={16} />{/if} Guardar</button
						>
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
								save({ type: 'rename', from: n.id, to: renameTo, keepAlias }, renameTo.trim())}
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
							save({ type: 'move', id: n.id, from: n.parents[0] ?? null, to: moveTo.trim() }, n.id)}
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
									on:click={() => save({ type: 'move', id: n.id, from: p, to: null }, n.id)}
									><Trash2 size={14} /> Sacar de «{p}»</button
								>
							{/each}
						</div>
					</form>
					{#if !isSystemTag(n.id)}
						<form
							on:submit|preventDefault={() =>
								mergeInto.trim() &&
								save({ type: 'merge', from: n.id, into: mergeInto.trim() }, mergeInto.trim())}
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
							save({ type: 'create', id: childName, parent: n.id }, childName.trim())}
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
							moveTo.trim() && save({ type: 'create', id: u.id, parent: moveTo.trim() }, u.id)}
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
							save({ type: 'merge', from: u.id, into: mergeInto.trim() }, mergeInto.trim())}
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
						save(
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
	.mock-note {
		margin: 0 0 1rem;
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
	.save-line {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin: 0;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--round);
		background: var(--surface);
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
