<script>
	/**
	 * Sección «Partes» de la pestaña Editar de un evento (talleres en varias partes,
	 * docs/talleres-partes.md). El evento es el taller (y la parte 1); acá se suman, ordenan y
	 * sacan las otras partes (edges `parte`), se crea una parte nueva copiando el taller y se elige
	 * si cada parte vende su entrada.
	 *
	 * Va por su cuenta (fetch a las acciones `partes_*` de la página): no manda el formulario del
	 * evento ni pierde lo que no se guardó ahí.
	 *
	 * Props: `state` (lo que da `panelParts`, src/lib/server/eventos/partes.js) y `slug`.
	 */
	import { deserialize } from '$app/forms';
	import { ArrowDown, ArrowUp, Plus, X } from '@lucide/svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import { addDays, partDateText, partLabel } from '$lib/utils/partes.js';

	/**
	 * @typedef {{
	 *   inDb: boolean,
	 *   workshop: import('$lib/utils/partes.js').Workshop | null,
	 *   isPart?: boolean,
	 *   current?: import('$lib/utils/partes.js').NumberedPart | null,
	 *   suggestions: { slug: string, title: string, start: string | null }[]
	 * }} PartsState
	 */

	/** @type {PartsState | null} */
	export let state = null;
	/** @type {string} */
	export let slug;

	const icon = { size: 16, strokeWidth: 2.25, 'aria-hidden': true };

	let busy = false;
	let message = '';
	let ok = true;
	let addSlug = '';

	$: ws = state?.workshop ?? null;
	// Las partes 2 en adelante, en el orden que se está editando.
	/** @type {import('$lib/utils/partes.js').NumberedPart[]} */
	let order = [];
	let lastState = /** @type {PartsState | null} */ (null);
	$: if (state !== lastState) {
		lastState = state;
		order = state?.isPart ? [] : (state?.workshop?.parts.slice(1) ?? []);
	}
	$: first = ws?.parts[0] ?? null;
	$: total = order.length + 1;
	$: saved = (ws?.parts.slice(1) ?? []).map((p) => p.slug).join('\n');
	$: dirty = order.map((p) => p.slug).join('\n') !== saved;
	$: perPart = ws?.workshop.perPart ?? false;
	$: hideParts = ws?.workshop.hideParts ?? false;
	$: lastStart = order.length ? order[order.length - 1].start : (first?.start ?? null);

	/** «2026-10-02T22:00-03:00» → «2026-10-02T22:00» (para el input). */
	/** @param {string | null | undefined} v */
	const forInput = (v) => (v ? String(v).slice(0, 16) : '');
	let newStart = '';
	let newEnd = '';
	$: if (!newStart && lastStart) newStart = forInput(addDays(String(lastStart), 7));

	/**
	 * @param {string} name
	 * @param {FormData} body
	 */
	async function post(name, body) {
		busy = true;
		message = '';
		try {
			const res = await fetch(`?/${name}`, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await res.text());
			const r = result.data?.partes;
			ok = result.type === 'success' && Boolean(r?.ok);
			message = r?.message ?? 'No se pudo guardar.';
			if (ok && r.state) state = r.state;
			return ok;
		} catch {
			ok = false;
			message = 'No pudimos conectarnos con el sitio. ¿Tenés internet?';
			return false;
		} finally {
			busy = false;
		}
	}

	/** @param {string[]} slugs */
	function saveList(slugs) {
		const body = new FormData();
		for (const s of slugs) body.append('parte', s);
		return post('partes_guardar', body);
	}

	/**
	 * @param {number} i
	 * @param {number} delta
	 */
	function move(i, delta) {
		const j = i + delta;
		if (j < 0 || j >= order.length) return;
		const next = [...order];
		[next[i], next[j]] = [next[j], next[i]];
		order = next;
	}

	/** @param {number} i */
	function remove(i) {
		order = order.filter((_, k) => k !== i);
	}

	/** @param {string} s */
	async function addExisting(s) {
		const value = s.trim();
		if (!value) return;
		if (await saveList([...order.map((p) => p.slug), value])) addSlug = '';
	}

	async function create() {
		const body = new FormData();
		body.set('start', newStart);
		if (newEnd) body.set('end', newEnd);
		if (await post('partes_crear', body)) {
			newStart = '';
			newEnd = '';
		}
	}

	/** @param {Event} e */
	function togglePerPart(e) {
		const body = new FormData();
		if (/** @type {HTMLInputElement} */ (e.currentTarget).checked) body.set('por_parte', 'on');
		post('partes_entradas', body);
	}

	/** @param {Event} e */
	function toggleHideParts(e) {
		const body = new FormData();
		if (/** @type {HTMLInputElement} */ (e.currentTarget).checked) body.set('ocultar_partes', 'on');
		post('partes_ocultar', body);
	}
</script>

<section class="card partes" id="partes" aria-labelledby="partes-title">
	<h2 id="partes-title">Partes</h2>

	{#if !state}
		<p class="hint">No pudimos leer las partes (¿hay base de datos?).</p>
	{:else if !state.inDb}
		<p class="hint">
			Este evento no está en la base: las partes de un taller se arman con eventos de la base.
		</p>
	{:else if state.isPart && ws && state.current}
		<p>
			<Badge tone="info">{partLabel(state.current.n, ws.total)}</Badge>
			Este evento es una parte de
			<a href="/admin/eventos/{encodeURIComponent(ws.workshop.slug)}/editar#partes"
				>«{ws.workshop.title}»</a
			>. Las partes se ordenan y se suman desde el taller.
		</p>
		<ol class="list">
			{#each ws.parts as p (p.slug)}
				<li class:current={p.slug === slug}>
					<span class="n">Parte {p.n}</span>
					<span class="when">{partDateText(p.start) || 'Sin fecha'}</span>
					<span class="title">{p.title}</span>
				</li>
			{/each}
		</ol>
		{#if !ws.workshop.perPart}
			<p class="hint">
				La entrada se compra en el taller y vale para todas las partes. El ingreso de esta parte se
				marca en su propio modo puerta (pestaña Ingreso).
			</p>
		{/if}
	{:else}
		<p class="hint">
			Para talleres en varias partes: este evento es el taller y la parte 1. Cada parte es un evento
			con su fecha, su hora y su lugar, y en el calendario aparece como «Parte N de M».
		</p>

		{#if order.length}
			<ol class="list">
				<li class="current">
					<span class="n">Parte 1</span>
					<span class="when">{partDateText(first?.start) || 'Sin fecha'}</span>
					<span class="title">{first?.title} <small>(este evento)</small></span>
				</li>
				{#each order as p, i (p.slug)}
					<li>
						<span class="n">Parte {i + 2}</span>
						<span class="when">{partDateText(p.start) || 'Sin fecha'}</span>
						<span class="title">
							<a href="/admin/eventos/{encodeURIComponent(p.slug)}/editar">{p.title}</a>
							{#if p.status === 'cancelado'}<Badge tone="bad">Cancelada</Badge>{/if}
						</span>
						<span class="row-actions">
							{#if !perPart}
								<a class="small-link" href="/admin/eventos/{encodeURIComponent(p.slug)}/ingreso"
									>Ingreso</a
								>
							{/if}
							<button
								type="button"
								class="icon"
								on:click={() => move(i, -1)}
								disabled={busy || i === 0}
								aria-label="Subir {p.title}"><ArrowUp {...icon} /></button
							>
							<button
								type="button"
								class="icon"
								on:click={() => move(i, 1)}
								disabled={busy || i === order.length - 1}
								aria-label="Bajar {p.title}"><ArrowDown {...icon} /></button
							>
							<button
								type="button"
								class="icon"
								on:click={() => remove(i)}
								disabled={busy}
								aria-label="Sacar {p.title} de las partes"><X {...icon} /></button
							>
						</span>
					</li>
				{/each}
			</ol>
			{#if dirty}
				<p class="save-row">
					<button
						type="button"
						class="kv-btn small"
						on:click={() => saveList(order.map((p) => p.slug))}
						disabled={busy}>Guardar partes</button
					>
					<button
						type="button"
						class="kv-btn small ghost"
						on:click={() => (order = ws?.parts.slice(1) ?? [])}
						disabled={busy}>Deshacer</button
					>
					<small>Sacar una parte no la borra: queda como evento suelto.</small>
				</p>
			{/if}

			<label class="check">
				<input type="checkbox" checked={perPart} on:change={togglePerPart} disabled={busy} />
				<span>
					<strong>Entradas por parte</strong>
					<small>
						{perPart
							? 'Cada parte vende su propia entrada (configurala en la ficha de cada parte).'
							: `Una sola entrada, la de este evento, vale para las ${total} partes. Tildalo si cada parte se vende por separado.`}
					</small>
				</span>
			</label>

			<label class="check">
				<input type="checkbox" checked={hideParts} on:change={toggleHideParts} disabled={busy} />
				<span>
					<strong>Si ocultás el taller, ocultar también sus partes</strong>
					<small>
						{hideParts
							? 'Mientras este evento esté oculto, sus partes tampoco se ven en el sitio (ni en el calendario ni en su página).'
							: 'Cada parte se muestra u oculta por su cuenta, aunque ocultes este evento.'}
					</small>
				</span>
			</label>
		{/if}

		<div class="add">
			<h3>Crear una parte nueva</h3>
			<p class="hint">
				Copia este evento (texto, etiquetas, personas, imagen y lugar) con otra fecha{perPart
					? ' y su propia configuración de entradas'
					: ', sin entradas: se compran acá'}.
			</p>
			<div class="fields">
				<label>
					<span>Empieza</span>
					<input type="datetime-local" bind:value={newStart} required />
				</label>
				<label>
					<span>Termina <small>(opcional)</small></span>
					<input type="datetime-local" bind:value={newEnd} />
				</label>
				<button type="button" class="kv-btn small" on:click={create} disabled={busy || !newStart}
					><Plus {...icon} /> Crear parte {total + 1}</button
				>
			</div>
		</div>

		<div class="add">
			<h3>Sumar un evento que ya existe</h3>
			{#if state.suggestions.length}
				<p class="hint">Parecen partes de este taller:</p>
				<ul class="suggestions">
					{#each state.suggestions as s (s.slug)}
						<li>
							<button
								type="button"
								class="kv-btn small ghost"
								on:click={() => addExisting(s.slug)}
								disabled={busy}><Plus {...icon} /> {s.title}</button
							>
							<small>{partDateText(s.start)}</small>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="fields">
				<label>
					<span>Dirección del evento</span>
					<input
						type="text"
						bind:value={addSlug}
						placeholder="{slug}-parte-2"
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
				<button
					type="button"
					class="kv-btn small ghost"
					on:click={() => addExisting(addSlug)}
					disabled={busy || !addSlug.trim()}>Sumar como parte {total + 1}</button
				>
			</div>
		</div>
	{/if}

	{#if message}
		<p class={ok ? 'ok' : 'error'} role={ok ? 'status' : 'alert'}>{message}</p>
	{/if}
</section>

<style>
	.partes {
		padding: 1rem 1.2rem 1.2rem;
		margin: 1.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		scroll-margin-top: var(--form-sticky-top, 1rem);
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	h3 {
		margin: 0 0 0.3rem;
		font-size: 1rem;
	}
	p {
		margin: 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.list li {
		display: grid;
		grid-template-columns: 4.6rem 8.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 0.8rem;
	}
	.list li.current {
		border-color: var(--accent);
	}
	.n {
		font-weight: 700;
	}
	.when {
		color: var(--muted);
		white-space: nowrap;
	}
	.title {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}
	.icon:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.small-link {
		font-size: 0.85rem;
		margin-right: 0.3rem;
	}
	.save-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.check {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
	}
	.check input {
		margin-top: 0.3rem;
	}
	.check span {
		display: flex;
		flex-direction: column;
	}
	.add {
		border-top: 1px solid var(--line);
		padding-top: 0.8rem;
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.6rem;
		margin-top: 0.4rem;
	}
	.fields label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-weight: 700;
	}
	.suggestions {
		list-style: none;
		padding: 0;
		margin: 0.3rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.suggestions li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.ok {
		color: var(--ok, var(--text));
		font-weight: 700;
	}
	.error {
		color: var(--bad);
		font-weight: 700;
	}
	@media (max-width: 640px) {
		.list li {
			grid-template-columns: 4.2rem minmax(0, 1fr);
		}
		.title,
		.row-actions {
			grid-column: 1 / -1;
		}
	}
</style>
