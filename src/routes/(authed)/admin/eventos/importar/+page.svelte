<script>
	import { deserialize, applyAction } from '$app/forms';
	import { tick } from 'svelte';
	import {
		describeSchedule,
		isValidDate,
		isValidTime,
		validateSlug
	} from '$lib/utils/eventDraft.js';
	import {
		buildMatchIndex,
		composeSchedule,
		findExisting,
		longDate,
		matchSeries,
		parseSheet,
		proposeSlug,
		proposeTitle,
		scheduleFor
	} from '$lib/utils/sheetImport.js';

	/** @type {import('./$types').PageData} */
	export let data;

	const index = buildMatchIndex(data.events);
	const bySlug = new Map(data.events.map((e) => [e.slug, e]));
	const takenInSite = new Set(data.takenSlugs);

	/**
	 * @typedef {object} Item
	 * @prop {number} id
	 * @prop {import('$lib/utils/sheetImport.js').SheetRow} sheet
	 * @prop {boolean} include
	 * @prop {string} title
	 * @prop {boolean} titleEdited
	 * @prop {string} date
	 * @prop {string} startTime
	 * @prop {string} endTime
	 * @prop {boolean} endEstimated
	 * @prop {string} source '' = desde cero
	 * @prop {import('$lib/utils/sheetImport.js').Candidate[]} suggestions
	 * @prop {boolean} matched
	 * @prop {string} slug
	 * @prop {boolean} slugEdited
	 * @prop {string} place
	 * @prop {string} link
	 * @prop {string[]} notes extra notes computed here (already loaded, past date...)
	 * @prop {string} serverError
	 * @prop {boolean} open details expanded
	 */

	let text = '';
	/** @type {Item[]} */
	let items = [];
	let readOnce = false;
	/** @type {string} */
	let layout = '';

	/** @param {string} slug */
	const eventLabel = (slug) => {
		const e = bySlug.get(slug);
		if (!e) return slug;
		const d = e.start ? longDate(e.start.slice(0, 10)).replace(/^\S+ /, '') : 'sin fecha';
		return `${e.title} (${d})`;
	};

	/** Slugs used by the other included rows. @param {Item} item */
	const otherSlugs = (item) =>
		new Set(items.filter((i) => i !== item && i.include).map((i) => i.slug));

	/**
	 * Titles not edited by hand. When the same series is twice in the paste, the edition numbers
	 * follow the dates: "Picantearla (62ª Edición)" in October, 63ª in November.
	 */
	function refreshTitles() {
		for (const item of items) {
			if (item.titleEdited) continue;
			const source = item.source ? bySlug.get(item.source) : null;
			const earlier = items.filter(
				(i) =>
					i !== item &&
					i.include &&
					i.source &&
					i.source === item.source &&
					(i.date < item.date || (i.date === item.date && i.id < item.id))
			).length;
			item.title = proposeTitle(item.sheet.name, source?.title, earlier + 1);
		}
	}

	/**
	 * Recomputes what depends on the chosen source (title, end time, slug), unless edited by hand.
	 * @param {Item} item
	 */
	function applySource(item) {
		const source = item.source ? bySlug.get(item.source) : null;
		refreshTitles();
		if (!item.sheet.endTime && (item.endEstimated || !item.endTime)) {
			const s = scheduleFor(
				{ date: item.date, startTime: item.startTime, endTime: '' },
				source ?? null
			);
			item.endTime = s.endTime;
			item.endEstimated = s.estimated;
		}
		if (!item.slugEdited) {
			const others = otherSlugs(item);
			item.slug = proposeSlug(
				item.source || null,
				item.sheet.name,
				item.date,
				(s) => takenInSite.has(s) || others.has(s)
			);
		}
	}

	function read() {
		const parsed = parseSheet(text, { today: data.today });
		layout = parsed.layout;
		readOnce = true;
		sent = null;
		globalError = '';
		/** @type {Item[]} */
		const next = [];
		parsed.rows.forEach((sheet, i) => {
			const { best, alternatives } = matchSeries(sheet.name, index);
			const notes = [];
			const existing = findExisting(sheet.name, sheet.date, index);
			if (existing.length)
				notes.push(`Parece que ya está cargado: ${existing.map(eventLabel).join(', ')}.`);
			const past = sheet.date && sheet.date < data.today;
			if (past) notes.push('La fecha ya pasó.');
			if (sheet.checked) notes.push('En la planilla tiene la casilla “c” marcada.');
			/** @type {Item} */
			const item = {
				id: i,
				sheet,
				include: !sheet.off && !existing.length && !past && Boolean(sheet.name),
				title: '',
				titleEdited: false,
				date: sheet.date,
				startTime: sheet.startTime,
				endTime: sheet.endTime,
				endEstimated: false,
				source: best?.slug ?? '',
				suggestions: best ? [best, ...alternatives] : alternatives,
				matched: Boolean(best),
				slug: '',
				slugEdited: false,
				place: sheet.place,
				link: sheet.link,
				notes,
				serverError: '',
				open: false
			};
			next.push(item);
		});
		items = next;
		for (const item of items) applySource(item);
		items = items;
	}

	// The new value is taken from the event: on:change may run before bind:value updates `item`.
	/** @param {Item} item @param {Event} e */
	function onSourceChange(item, e) {
		item.source = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
		applySource(item);
		items = items;
	}
	/** @param {Item} item @param {Event} e */
	function onStartChange(item, e) {
		item.startTime = /** @type {HTMLInputElement} */ (e.currentTarget).value;
		applySource(item);
		items = items;
	}
	/** @param {Item} item @param {Event} e */
	function onDateChange(item, e) {
		item.date = /** @type {HTMLInputElement} */ (e.currentTarget).value;
		applySource(item);
		items = items;
	}

	/**
	 * Blocking problems of an included row (the server checks the same).
	 * @param {Item} item
	 * @param {Item[]} all
	 */
	function problemsOf(item, all) {
		/** @type {string[]} */
		const out = [];
		if (!item.title.trim()) out.push('Falta el título.');
		if (!isValidDate(item.date)) out.push('Falta la fecha.');
		if (!isValidTime(item.startTime)) out.push('Falta la hora de inicio.');
		if (item.endTime && !isValidTime(item.endTime)) out.push('La hora de fin no es válida.');
		if (item.link && !/^https?:\/\/\S+$/.test(item.link.trim()))
			out.push('El link tiene que empezar con https://');
		const slugError = validateSlug(item.slug, takenInSite);
		if (slugError) out.push(`Dirección: ${slugError}`);
		else if (all.some((o) => o !== item && o.include && o.slug === item.slug))
			out.push('Dos filas tienen la misma dirección: cambiá una.');
		if (item.serverError) out.push(item.serverError);
		return out;
	}

	$: problems = new Map(
		items.map((item) => [item.id, item.include ? problemsOf(item, items) : []])
	);
	$: included = items.filter((i) => i.include);
	$: ready = included.filter((i) => !problems.get(i.id)?.length);
	$: withWarnings = items.filter(
		(i) => i.sheet.warnings.length || i.notes.length || problems.get(i.id)?.length || !i.matched
	);
	$: canCreate =
		included.length > 0 && ready.length === included.length && included.length <= data.maxRows;

	/** @param {Item} item */
	function scheduleText(item) {
		const s = composeSchedule(item.date, item.startTime, item.endTime);
		return describeSchedule(s.start, s.end || undefined);
	}
	/** @param {Item} item */
	const endsNextDay = (item) =>
		isValidTime(item.startTime) && isValidTime(item.endTime) && item.endTime <= item.startTime;

	/* ---------- create ---------- */
	let confirming = false;
	let submitting = false;
	let globalError = '';
	/** @type {null | {commitUrl: string, created: Array<{slug: string, title: string, url: string, notes: string[]}>, files: string[], mock: boolean}} */
	let sent = null;

	async function create() {
		submitting = true;
		globalError = '';
		for (const item of items) item.serverError = '';
		const payload = included.map((i) => ({
			title: i.title.trim(),
			date: i.date,
			startTime: i.startTime,
			endTime: i.endTime,
			place: i.place,
			link: i.link.trim(),
			source: i.source,
			slug: i.slug.trim()
		}));
		try {
			const body = new FormData();
			body.set('rows', JSON.stringify(payload));
			const response = await fetch('?/crear', {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				sent = result.data;
				items = [];
				text = '';
				readOnce = false;
			} else if (result.type === 'failure') {
				globalError = result.data?.error ?? 'No se pudo guardar.';
				for (const [i, msg] of Object.entries(result.data?.rowErrors ?? {})) {
					const item = included[Number(i)];
					if (item) {
						item.serverError = String(msg);
						item.open = true;
					}
				}
				for (const [i, suggestion] of Object.entries(result.data?.conflicts ?? {})) {
					const item = included[Number(i)];
					if (item) {
						item.slug = String(suggestion);
						item.slugEdited = true;
						item.notes = [
							...item.notes,
							`La dirección que habíamos propuesto ya existía: ahora es “${suggestion}”.`
						];
						item.open = true;
					}
				}
				items = items;
			} else if (result.type === 'error') {
				globalError = result.error?.message ?? 'Algo salió mal.';
			} else {
				await applyAction(result);
			}
		} catch (e) {
			globalError = 'No pudimos conectarnos con el sitio. ¿Tenés internet?';
		} finally {
			submitting = false;
			confirming = false;
		}
		await tick();
		document
			.querySelector('.result, .global-error')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
</script>

<svelte:head>
	<title>Importar desde la planilla · KV Admin</title>
</svelte:head>

<main class="importar">
	<p class="back"><a href="/admin/eventos">← Volver a la lista de eventos</a></p>

	{#if data.mock}
		<p class="mock">
			🧪 Modo de prueba (<code>npm run dev:admin</code>): no se escribe nada en GitHub, los archivos se guardan en
			una carpeta temporal.
		</p>
	{/if}

	<h1>Importar eventos desde la planilla</h1>

	{#if sent}
		<section class="result" aria-live="polite">
			<h2>
				¡Listo! 🎉 {sent.created.length === 1 ? 'Se creó' : 'Se crearon'}
				{plural(sent.created.length, 'borrador', 'borradores')}
			</h2>
			<p>
				Quedaron <strong>no listados</strong>: no aparecen en el calendario hasta que los publiquen.
				Cada uno se puede ver con su link:
			</p>
			<ul class="created">
				{#each sent.created as c}
					<li>
						<a href={c.url} target="_blank" rel="noreferrer"><strong>{c.title}</strong></a>
						<code>{c.slug}</code>
						{#each c.notes as note}<span class="note">⚠️ {note}</span>{/each}
					</li>
				{/each}
			</ul>
			<p class="hint">
				⏳ El sitio tarda unos minutos (normalmente entre 2 y 5) en actualizarse. Después, para
				publicar cada uno, revisalo y sacale el “no listado” (por ahora desde el editor del evento).
			</p>
			<p class="small">
				Cambio guardado en GitHub: <a href={sent.commitUrl} target="_blank" rel="noreferrer"
					>ver el commit</a
				>
				· {plural(sent.files.length, 'archivo', 'archivos')}
			</p>
			<p>
				<button class="button secondary" on:click={() => (sent = null)}>Importar más filas</button>
			</p>
		</section>
	{:else}
		<section class="paste">
			<ol class="how">
				<li>
					En la planilla, seleccioná las filas de los eventos (podés incluir la fila del mes, por
					ejemplo “OCTUBRE”, y la de los títulos).
				</li>
				<li>Copialas (Ctrl+C, o mantené apretado y “Copiar” en el celu).</li>
				<li>Pegalas abajo y tocá <em>Leer filas</em>. Nada se guarda hasta el final.</li>
			</ol>
			<label for="sheet-text" class="label">Pegá acá las filas copiadas de la planilla</label>
			<textarea
				id="sheet-text"
				bind:value={text}
				rows="8"
				spellcheck="false"
				placeholder={'FALSE\t\tPicantearla\tviernes 16\t21 - 03 horas\t\tAgrelo 3399'}></textarea>
			<p>
				<button class="button" on:click={read} disabled={!text.trim()}>Leer filas</button>
			</p>
		</section>

		{#if readOnce && !items.length}
			<p class="global-error">
				No encontramos eventos en lo que pegaste. Fijate de copiar filas enteras de la planilla (con
				el nombre del evento y la fecha).
			</p>
		{/if}

		{#if items.length}
			<section class="review" aria-labelledby="review-title">
				<h2 id="review-title">Revisá cada evento</h2>
				<p class="summary" aria-live="polite">
					<strong>{plural(items.length, 'fila', 'filas')}</strong>,
					{plural(ready.length, 'lista', 'listas')} para crear,
					{plural(withWarnings.length, 'con avisos', 'con avisos')}{items.length - included.length
						? `, ${items.length - included.length} sin importar`
						: ''}.
					{#if layout === '2024'}<span class="small">(Formato de la planilla 2024.)</span>{/if}
				</p>
				<p class="hint">
					Los eventos que ya existían se <strong>duplican</strong> (texto, imagen, etiquetas) con la
					fecha nueva. Todos se crean como <strong>no listados</strong>: después los revisan y
					publican de a uno.
				</p>

				<ol class="items">
					{#each items as item (item.id)}
						{@const itemProblems = problems.get(item.id) ?? []}
						<li
							class="item"
							class:off={!item.include}
							class:bad={item.include && itemProblems.length}
						>
							<header>
								<label class="include">
									<input
										type="checkbox"
										bind:checked={item.include}
										on:change={() => {
											refreshTitles();
											items = items;
										}}
									/>
									<span>Importar</span>
								</label>
								<div class="name">
									<strong>{item.sheet.name || '(sin nombre)'}</strong>
									<span class="small"
										>fila {item.sheet.line} · {item.sheet.dateText || 'sin fecha'}{item.sheet
											.timeText
											? ` · ${item.sheet.timeText}`
											: ''}</span
									>
								</div>
							</header>

							{#if item.sheet.warnings.length || item.notes.length || itemProblems.length}
								<ul class="warnings">
									{#each itemProblems as p}<li class="problem">⛔ {p}</li>{/each}
									{#each item.sheet.warnings as w}<li>⚠️ {w}</li>{/each}
									{#each item.notes as w}<li>⚠️ {w}</li>{/each}
								</ul>
							{/if}

							{#if item.include}
								<p class="when">
									{#if scheduleText(item)}📅 <span>{scheduleText(item)}</span>{:else}📅 Falta la
										fecha y hora{/if}
								</p>
								<div class="fields">
									<label class="wide">
										<span>Evento anterior (se copia)</span>
										<select bind:value={item.source} on:change={(e) => onSourceChange(item, e)}>
											{#if item.suggestions.length}
												<optgroup label="Sugeridos">
													{#each item.suggestions as c}
														<option value={c.slug}>{eventLabel(c.slug)}</option>
													{/each}
												</optgroup>
											{/if}
											<option value="">✨ Ninguno: crear desde cero</option>
											<optgroup label="Todos los eventos">
												{#each data.events as e (e.slug)}
													<option value={e.slug}>{eventLabel(e.slug)}</option>
												{/each}
											</optgroup>
										</select>
										{#if !item.matched && !item.source}
											<small>Sin evento anterior: se crea desde cero (sin texto ni imagen).</small>
										{:else if item.source}
											<small
												><a href="/calendario/{item.source}" target="_blank" rel="noreferrer"
													>Ver el evento anterior</a
												></small
											>
										{/if}
									</label>
									<label class="wide">
										<span>Título</span>
										<input
											type="text"
											bind:value={item.title}
											on:input={() => (item.titleEdited = true)}
										/>
									</label>
									<label>
										<span>Día</span>
										<input
											type="date"
											bind:value={item.date}
											on:change={(e) => onDateChange(item, e)}
										/>
									</label>
									<label>
										<span>Empieza</span>
										<input
											type="time"
											bind:value={item.startTime}
											on:change={(e) => onStartChange(item, e)}
										/>
									</label>
									<label>
										<span>Termina</span>
										<input
											type="time"
											bind:value={item.endTime}
											on:input={() => (item.endEstimated = false)}
										/>
										{#if endsNextDay(item)}<small>(al día siguiente)</small>{/if}
										{#if item.endEstimated}<small
												>Calculado con la duración del evento anterior.</small
											>{/if}
									</label>
									<label class="wide">
										<span>Dirección de la página</span>
										<span class="slug">
											<span class="prefix">kinkyvibe.ar/calendario/</span>
											<input
												type="text"
												bind:value={item.slug}
												on:input={() => (item.slugEdited = true)}
												autocapitalize="off"
												spellcheck="false"
											/>
										</span>
									</label>
								</div>
								<details bind:open={item.open}>
									<summary>Lugar, link y datos de la planilla</summary>
									<div class="fields">
										<label class="wide">
											<span>Lugar {item.source ? '(vacío = el del evento anterior)' : ''}</span>
											<input type="text" bind:value={item.place} />
										</label>
										<label class="wide">
											<span
												>Link de inscripción {item.link ? '' : '(sin link queda “anunciado”)'}</span
											>
											<input type="url" bind:value={item.link} placeholder="https://forms.gle/…" />
										</label>
									</div>
									<dl class="raw">
										{#if item.sheet.organiza}<dt>Organiza</dt>
											<dd>{item.sheet.organiza}</dd>{/if}
										<dt>Fecha</dt>
										<dd>{item.sheet.dateText || '—'}</dd>
										<dt>Horario</dt>
										<dd>
											{item.sheet.timeText || '—'}{item.sheet.endText
												? ` / ${item.sheet.endText}`
												: ''}
										</dd>
										<dt>Valor</dt>
										<dd>
											{item.sheet.price || '—'} <small>(no se copia: revisalo en el texto)</small>
										</dd>
										{#if item.sheet.comments}<dt>Comentarios</dt>
											<dd>{item.sheet.comments} <small>(no se publican)</small></dd>{/if}
									</dl>
								</details>
							{/if}
						</li>
					{/each}
				</ol>

				<div class="create">
					{#if globalError}<p class="global-error" role="alert">{globalError}</p>{/if}
					{#if included.length > data.maxRows}
						<p class="global-error">Podés importar hasta {data.maxRows} eventos por vez.</p>
					{:else if included.length && !canCreate}
						<p class="global-error">
							Hay {plural(included.length - ready.length, 'fila', 'filas')} con ⛔ para corregir (o destildar).
						</p>
					{/if}
					{#if !confirming}
						<button class="button big" disabled={!canCreate} on:click={() => (confirming = true)}>
							Crear {plural(included.length, 'borrador', 'borradores')}
						</button>
					{:else}
						<div class="confirm" role="alertdialog" aria-labelledby="confirm-text">
							<p id="confirm-text">
								Se van a crear <strong
									>{plural(included.length, 'evento', 'eventos')} no listados</strong
								> en el sitio, todos juntos. ¿Seguimos?
							</p>
							<button
								class="button secondary"
								on:click={() => (confirming = false)}
								disabled={submitting}>Cancelar</button
							>
							<button class="button" id="confirm-create" on:click={create} disabled={submitting}>
								{submitting ? 'Guardando…' : 'Sí, crear'}
							</button>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	{/if}
</main>

<style lang="scss">
	.importar {
		max-width: 50rem;
		margin-inline: auto;
		padding: 0 16px 4em;
		font-size: var(--step-0);
	}
	h1 {
		font-size: var(--step-3);
		margin: 0.3em 0;
	}
	h2 {
		font-size: var(--step-2);
		margin: 0.5em 0 0.2em;
	}
	.back {
		margin: 0.5em 0 0;
		font-size: var(--step--1);
	}
	.mock {
		background: #fff6d6;
		border-radius: 1em;
		padding: 0.5em 1em;
		font-size: var(--step--1);
	}
	.small {
		font-size: var(--step--1);
		opacity: 0.75;
	}
	.hint {
		font-size: var(--step--1);
		max-width: 42em;
	}
	.how {
		padding-left: 1.3em;
		font-size: var(--step--1);
		max-width: 42em;
	}
	.label {
		display: block;
		color: var(--1);
		margin-bottom: 0.3em;
		font-weight: bold;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		font-family: monospace;
		font-size: 0.85em;
		padding: 0.8em;
		border-radius: 1em;
		border: 0;
		outline: 1px solid var(--1-light);
		tab-size: 4;
		white-space: pre;
		overflow-x: auto;
		&:focus {
			outline-width: 3px;
		}
	}
	.button {
		display: inline-block;
		background: var(--1);
		color: white;
		border: 0;
		border-radius: 1em;
		padding: 0.5em 1.2em;
		font-size: var(--step-0);
		text-decoration: none;
		cursor: pointer;
		&.secondary {
			background: white;
			color: var(--1-dark);
			outline: 2px solid var(--1-light);
			outline-offset: -2px;
		}
		&.big {
			font-size: var(--step-1);
			padding: 0.6em 1.5em;
		}
		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
	}
	.summary {
		background: white;
		border-radius: 1em;
		padding: 0.6em 1em;
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
	}
	.items {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.9em;
	}
	.item {
		background: white;
		border-radius: 1.2em;
		padding: 0.8em 1em;
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
		border-left: 0.4em solid var(--3-light, #cdeccd);
		&.off {
			background: #f6f6f6;
			border-left-color: #ccc;
			.name strong {
				opacity: 0.6;
			}
		}
		&.bad {
			border-left-color: #e05555;
		}
	}
	header {
		display: flex;
		gap: 0.8em;
		align-items: flex-start;
	}
	.include {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: var(--step--2);
		gap: 0.1em;
		input {
			width: 1.4em;
			height: 1.4em;
		}
	}
	.name {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.warnings {
		list-style: none;
		padding: 0;
		margin: 0.5em 0 0;
		font-size: var(--step--1);
		li {
			background: #fff6d6;
			border-radius: 0.6em;
			padding: 0.2em 0.6em;
			margin-bottom: 0.25em;
		}
		.problem {
			background: #fde2e2;
		}
	}
	.when {
		margin: 0.5em 0;
		span::first-letter {
			text-transform: uppercase;
		}
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6em 0.8em;
		label {
			display: flex;
			flex-direction: column;
			gap: 0.2em;
			min-width: 0;
			> span:first-child {
				font-size: var(--step--1);
				color: var(--1);
			}
		}
		.wide {
			grid-column: 1 / -1;
		}
		input,
		select {
			font-size: var(--step-0);
			padding: 0.35em 0.6em;
			border-radius: 0.6em;
			border: 1px solid #ccc;
			min-width: 0;
			width: 100%;
			box-sizing: border-box;
			background: white;
		}
		small {
			font-size: var(--step--2);
			opacity: 0.8;
		}
	}
	.slug {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.2em;
		.prefix {
			font-size: var(--step--2);
			opacity: 0.6;
		}
		input {
			flex: 1 1 12em;
			font-family: monospace;
		}
	}
	details {
		margin-top: 0.7em;
		summary {
			cursor: pointer;
			color: var(--1-dark);
			font-size: var(--step--1);
		}
		.fields {
			margin-top: 0.5em;
		}
	}
	.raw {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.2em 0.8em;
		font-size: var(--step--1);
		margin: 0.7em 0 0;
		dt {
			opacity: 0.7;
		}
		dd {
			margin: 0;
			overflow-wrap: anywhere;
		}
	}
	.create {
		position: sticky;
		bottom: 0;
		background: white;
		box-shadow: 0 -0.3em 0.6em rgba(0, 0, 0, 0.08);
		padding: 0.8em 0;
		text-align: center;
		border-top: 1px solid #eee;
	}
	.global-error {
		background: #fde2e2;
		border-radius: 1em;
		padding: 0.5em 1em;
	}
	.confirm {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6em;
		justify-content: center;
		align-items: center;
		p {
			flex-basis: 100%;
			margin: 0;
		}
	}
	.result {
		background: white;
		border-radius: 1.2em;
		padding: 1em 1.2em;
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
	}
	.created {
		padding-left: 1.2em;
		li {
			margin-bottom: 0.4em;
			overflow-wrap: anywhere;
		}
		code {
			font-size: var(--step--2);
			opacity: 0.7;
			margin-left: 0.4em;
		}
		.note {
			display: block;
			font-size: var(--step--1);
		}
	}
	@media (max-width: 540px) {
		.fields {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
