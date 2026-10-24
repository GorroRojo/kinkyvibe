<script>
	/**
	 * Agenda impresa: arma la hoja A4 con los volantes para repartir (diseño de gorrite: 4 A6 para
	 * cortar, en blanco y negro). Se eligen los eventos del rango, su orden, y se cambia a mano lo
	 * que haga falta (ícono, subtítulo, lugar, precio, encabezado y pie); nada se guarda. Se
	 * imprime o se guarda como PDF desde el navegador. Ver docs/panel.md#agenda-impresa.
	 */
	import { ArrowDown, ArrowLeft, ArrowUp, Printer, RotateCcw } from '@lucide/svelte';
	import { afterUpdate, onMount } from 'svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import {
		DEFAULT_FOOTER,
		DEFAULT_HEADER,
		ICON_CHOICES,
		LAYOUTS,
		MAX_PER_FLYER,
		withOverrides
	} from '$lib/utils/agendaImpresa.js';
	import { argDateList } from '$lib/utils/dates.js';
	import logo from '../../../../logo.png';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @typedef {(typeof data.events)[number]} AgendaEvent */
	/** @typedef {{ icon: string, subtitle: string, place: string, price: string }} Edit */

	/** El orden de la lista (todos los eventos del rango). @type {string[]} */
	let order = [];
	/** Los que van en el volante. @type {Set<string>} */
	let checked = new Set();
	/** Lo que se ve de cada evento (arranca con lo de los datos). @type {Record<string, Edit>} */
	let edits = {};

	let header = DEFAULT_HEADER;
	let footer = DEFAULT_FOOTER;
	/** @type {'4' | '2' | '1'} */
	let perSheet = '4';
	let background = true;
	let showQr = false;

	/** @param {AgendaEvent} e @returns {Edit} */
	const fromData = (e) => ({ icon: e.icon, subtitle: e.subtitle, place: e.place, price: e.price });

	/**
	 * Al cambiar el rango: los eventos nuevos entran al final (los primeros 4, tildados) y los que
	 * siguen conservan su orden, su tilde y lo que se les cambió.
	 * @param {AgendaEvent[]} events
	 */
	function sync(events) {
		const slugs = events.map((e) => e.slug);
		const kept = order.filter((s) => slugs.includes(s));
		const fresh = slugs.filter((s) => !kept.includes(s));
		const first = !order.length;
		order = [...kept, ...fresh];
		checked = new Set([
			...[...checked].filter((s) => slugs.includes(s)),
			...(first ? fresh.slice(0, MAX_PER_FLYER) : [])
		]);
		/** @type {Record<string, Edit>} */
		const next = {};
		for (const e of events) next[e.slug] = edits[e.slug] ?? fromData(e);
		edits = next;
	}
	$: sync(data.events);

	$: bySlug = new Map(data.events.map((e) => [e.slug, e]));
	$: picked = order.filter((s) => checked.has(s));
	$: rows = picked
		.slice(0, MAX_PER_FLYER)
		.map((s) => withOverrides(/** @type {AgendaEvent} */ (bySlug.get(s)), edits[s]));
	$: layout = LAYOUTS[perSheet];
	$: copies = Array.from({ length: layout.perSheet }, (_, i) => i);
	// La orientación de la hoja al imprimir (2 por hoja: A4 apaisado). Texto fijo, sin datos.
	/** @type {HTMLElement | undefined} */
	let sheetEl;

	/**
	 * Si los eventos no entran en el volante (títulos o lugares largos), achica la letra de esa
	 * parte de a poco (hasta 60 %), así el pie no se corta. Mide en la página: es lo que se imprime.
	 */
	function fit() {
		for (const el of sheetEl?.querySelectorAll('ul') ?? []) {
			const list = /** @type {HTMLElement} */ (el);
			let size = 1;
			list.style.fontSize = '';
			while (list.scrollHeight > list.clientHeight + 1 && size > 0.6) {
				size -= 0.04;
				list.style.fontSize = `${size}em`;
			}
		}
	}
	afterUpdate(fit);
	onMount(() => {
		document.fonts?.ready.then(fit);
	});

	$: pageCss = `<style>@page { size: A4 ${perSheet === '2' ? 'landscape' : 'portrait'}; margin: 0; }</style>`;

	/** @param {string} slug */
	function toggle(slug) {
		const next = new Set(checked);
		if (next.has(slug)) next.delete(slug);
		else next.add(slug);
		checked = next;
	}

	/** @param {number} i @param {number} delta */
	function move(i, delta) {
		const j = i + delta;
		if (j < 0 || j >= order.length) return;
		const next = [...order];
		[next[i], next[j]] = [next[j], next[i]];
		order = next;
	}

	/** @param {string} slug */
	function reset(slug) {
		const e = bySlug.get(slug);
		if (e) edits = { ...edits, [slug]: fromData(e) };
	}

	/** @param {string} slug */
	const changed = (slug) => {
		const e = bySlug.get(slug);
		const x = edits[slug];
		return (
			Boolean(e && x) &&
			JSON.stringify(fromData(/** @type {AgendaEvent} */ (e))) !== JSON.stringify(x)
		);
	};
</script>

<svelte:head>
	<title>Agenda impresa · Panel</title>
	{@html pageCss}
</svelte:head>

<div class="agenda-impresa">
	<section class="controls" aria-label="Qué va en el volante">
		<a class="back" href="/admin/eventos/agenda"
			><ArrowLeft size={16} aria-hidden="true" /> Agenda</a
		>
		<h1>Agenda impresa</h1>
		<p class="help">
			Volantes en blanco y negro para repartir, con los próximos eventos. Elegí cuáles van y en qué
			orden, cambiá lo que haga falta (no se guarda en ningún lado) y tocá «Imprimir». Para un PDF,
			elegí «Guardar como PDF»; en las opciones, márgenes «Ninguno» y «Gráficos de fondo» prendido.
		</p>

		<form class="range" method="GET">
			<label
				>Desde <input class="kv-input" type="date" name="desde" value={data.range.from} /></label
			>
			<label>Hasta <input class="kv-input" type="date" name="hasta" value={data.range.to} /></label>
			<button class="kv-btn ghost" type="submit">Ver eventos</button>
		</form>

		{#if !order.length}
			<Notice tone="warn">No hay eventos publicados en esas fechas.</Notice>
		{:else}
			<ol class="events">
				{#each order as slug, i (slug)}
					{@const e = bySlug.get(slug)}
					{#if e && edits[slug]}
						<li class:off={!checked.has(slug)}>
							<div class="row">
								<label class="pick">
									<input
										type="checkbox"
										checked={checked.has(slug)}
										on:change={() => toggle(slug)}
									/>
									<span class="emoji" aria-hidden="true">{edits[slug].icon}</span>
									<span>
										<strong>{e.title}</strong>
										<small>{argDateList(e.start)}{e.series ? ` · ${e.series}` : ''}</small>
									</span>
								</label>
								<span class="moves">
									<button
										class="kv-btn ghost icon small"
										type="button"
										aria-label="Subir {e.title}"
										disabled={i === 0}
										on:click={() => move(i, -1)}><ArrowUp size={16} aria-hidden="true" /></button
									>
									<button
										class="kv-btn ghost icon small"
										type="button"
										aria-label="Bajar {e.title}"
										disabled={i === order.length - 1}
										on:click={() => move(i, 1)}><ArrowDown size={16} aria-hidden="true" /></button
									>
								</span>
							</div>
							<details>
								<summary>Cambiar lo que dice{changed(slug) ? ' (cambiado)' : ''}</summary>
								<div class="fields">
									<label
										>Ícono <input
											class="kv-input icon-input"
											list="agenda-iconos"
											bind:value={edits[slug].icon}
										/></label
									>
									<label
										>Subtítulo <input
											class="kv-input"
											bind:value={edits[slug].subtitle}
											placeholder="Sin subtítulo"
										/></label
									>
									<label
										>Lugar <input
											class="kv-input"
											bind:value={edits[slug].place}
											placeholder="Sin lugar"
										/></label
									>
									<label
										>Precio <input
											class="kv-input"
											bind:value={edits[slug].price}
											placeholder="Sin precio"
										/></label
									>
									<button class="kv-btn ghost small" type="button" on:click={() => reset(slug)}
										><RotateCcw size={14} aria-hidden="true" /> Volver a lo de los datos</button
									>
								</div>
							</details>
						</li>
					{/if}
				{/each}
			</ol>
			<datalist id="agenda-iconos">
				{#each ICON_CHOICES as icon (icon)}<option value={icon}></option>{/each}
			</datalist>
			{#if picked.length > MAX_PER_FLYER}
				<Notice tone="warn"
					>Elegiste {picked.length}: en un volante entran {MAX_PER_FLYER}. Van los primeros {MAX_PER_FLYER}
					de la lista.</Notice
				>
			{:else if !picked.length}
				<Notice tone="warn">Tildá al menos un evento.</Notice>
			{/if}
		{/if}

		<fieldset class="sheet-options">
			<legend>La hoja</legend>
			<label>Encabezado <textarea class="kv-input" rows="2" bind:value={header}></textarea></label>
			<label>Pie <input class="kv-input" bind:value={footer} /></label>
			<label
				>Volantes por hoja
				<select class="kv-input" bind:value={perSheet}>
					{#each Object.entries(LAYOUTS) as [n, l] (n)}<option value={n}>{l.label}</option>{/each}
				</select></label
			>
			<label class="check"
				><input type="checkbox" bind:checked={background} /> Fondo con dibujos</label
			>
			<label class="check"
				><input type="checkbox" bind:checked={showQr} /> QR al calendario en el pie</label
			>
		</fieldset>

		<button
			class="kv-btn print"
			type="button"
			on:click={() => window.print()}
			disabled={!rows.length}><Printer size={18} aria-hidden="true" /> Imprimir</button
		>
	</section>

	<section class="preview" aria-label="Vista previa de la hoja">
		<div
			bind:this={sheetEl}
			class="sheet"
			class:bg={background}
			style:--sheet-w="{layout.sheetW}mm"
			style:--sheet-h="{layout.sheetH}mm"
			style:--cols={layout.cols}
			style:--rows={layout.rows}
			style:--s={layout.sheetW / layout.cols / 105}
		>
			{#each copies as copy (copy)}
				<article class="flyer" aria-hidden={copy > 0 ? 'true' : undefined}>
					<header class="f-head">
						<img class="f-logo" src={logo} alt="Kinky Vibe" />
						<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"
							><path
								d="M12 1C13 8 16 11 23 12 16 13 13 16 12 23 11 16 8 13 1 12 8 11 11 8 12 1Z"
							/></svg
						>
						<p class="f-title">{header}</p>
						<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"
							><path
								d="M12 1C13 8 16 11 23 12 16 13 13 16 12 23 11 16 8 13 1 12 8 11 11 8 12 1Z"
							/></svg
						>
					</header>
					<ul class="f-events">
						{#each rows as row (row.slug)}
							<li class="f-event">
								<span class="f-icon" aria-hidden="true"><span>{row.icon}</span></span>
								<div class="f-body">
									<p class="f-pill">
										<span
											class="f-name"
											class:long={row.title.length > 22}
											class:longer={row.title.length > 34}>{row.title}</span
										>
										{#if row.subtitle}<span class="f-sub">{row.subtitle}</span>{/if}
									</p>
									<p class="f-line">{row.date}</p>
									{#if row.place}
										{@const [, main, note] = row.place.match(/^(.*?)(\s*\(.*\))?$/) ?? [
											'',
											row.place,
											''
										]}
										<p class="f-line">{main}<span class="f-note">{note ?? ''}</span></p>
									{/if}
									{#if row.price}<p class="f-line">{row.price}</p>{/if}
								</div>
							</li>
						{/each}
					</ul>
					<footer class="f-foot">
						<span>{footer}</span>
						{#if showQr}
							<!-- El SVG lo arma el servidor (qrcode-generator) con una URL fija. -->
							<span class="f-qr">{@html data.qr}</span>
						{/if}
					</footer>
				</article>
			{/each}
			{#if layout.cols > 1}<span class="cut cut-v" aria-hidden="true"></span>{/if}
			{#if layout.rows > 1}<span class="cut cut-h" aria-hidden="true"></span>{/if}
		</div>
	</section>
</div>

<style>
	@font-face {
		font-family: 'KV 1797';
		font-style: normal;
		font-weight: 500;
		font-display: block;
		src: url('/fonts/1797/1797-medium.woff2') format('woff2');
	}
	@font-face {
		font-family: 'KV 1797';
		font-style: italic;
		font-weight: 500;
		font-display: block;
		src: url('/fonts/1797/1797-italic.woff2') format('woff2');
	}

	.agenda-impresa {
		display: grid;
		grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr);
		gap: var(--space-m);
		padding: var(--space-m);
		align-items: start;
	}
	@media (max-width: 900px) {
		.agenda-impresa {
			grid-template-columns: minmax(0, 1fr);
			padding: var(--space-s);
		}
	}

	/* ---- Controles ---- */
	.controls {
		display: grid;
		gap: var(--space-s);
		font-size: var(--text-sm);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		color: var(--link);
		font-weight: 700;
		text-decoration: none;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: var(--text-xl);
	}
	.help {
		margin: 0;
		color: var(--muted);
	}
	.range {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: end;
	}
	.range label,
	.fields label,
	.sheet-options label {
		display: grid;
		gap: 0.2em;
		font-weight: 700;
	}
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2xs);
	}
	.events li {
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-1);
		padding: var(--space-2xs) var(--space-xs);
	}
	.events li.off {
		opacity: 0.65;
	}
	.row {
		display: flex;
		gap: var(--space-2xs);
		align-items: center;
		justify-content: space-between;
	}
	.pick {
		display: flex;
		gap: var(--space-2xs);
		align-items: center;
		min-height: var(--tap);
		cursor: pointer;
	}
	.pick small {
		display: block;
		color: var(--muted);
	}
	.pick .emoji {
		font-size: 1.4em;
	}
	.moves {
		display: flex;
		gap: var(--space-3xs);
		flex: none;
	}
	details summary {
		cursor: pointer;
		color: var(--link);
		min-height: 2rem;
		display: flex;
		align-items: center;
	}
	.fields {
		display: grid;
		gap: var(--space-2xs);
		padding-block: var(--space-2xs);
	}
	.icon-input {
		max-width: 6rem;
	}
	.fields .kv-btn {
		justify-self: start;
	}
	.sheet-options {
		display: grid;
		gap: var(--space-2xs);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		padding: var(--space-xs);
		margin: 0;
	}
	.sheet-options legend {
		font-weight: 700;
	}
	.sheet-options label.check {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		font-weight: 400;
		min-height: var(--tap);
	}
	.print {
		justify-self: start;
	}

	/* ---- La hoja (medidas reales en mm; el diseño es un A6 de 105 × 148,5 mm y los demás
	   tamaños lo escalan con --s) ---- */
	.preview {
		overflow: auto;
		min-width: 0;
	}
	.sheet {
		position: relative;
		width: var(--sheet-w);
		height: var(--sheet-h);
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: repeat(var(--rows), 1fr);
		background: #fff;
		color: #000;
		box-shadow: var(--shadow-1);
		overflow: hidden;
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}
	/* El fondo de dibujos (sacado del diseño, docs/panel.md#agenda-impresa): lila, suave, con el
	   trazo fino, el tamaño, la posición y la transparencia (33 %) del PDF del diseño. */
	.sheet.bg::before {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/agenda-impresa/fondo.svg') no-repeat;
		background-size: calc(var(--sheet-w) * 1.53);
		background-position: calc(var(--sheet-w) * -0.264) 0;
		opacity: 0.33;
		pointer-events: none;
	}
	.cut {
		position: absolute;
		border: 0 dashed #9a9a9a;
		pointer-events: none;
	}
	.cut-v {
		top: 0;
		bottom: 0;
		left: 50%;
		border-left-width: 0.2mm;
	}
	.cut-h {
		left: 0;
		right: 0;
		top: 50%;
		border-top-width: 0.2mm;
	}

	.flyer {
		position: relative;
		font-family: 'KV 1797', 'Oswald', 'Arial Narrow', sans-serif;
		font-weight: 500;
		/* 1em = 1 mm del diseño en A6 */
		font-size: calc(var(--s) * 1mm);
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		line-height: 1;
	}
	.f-head {
		display: flex;
		align-items: center;
		gap: 0.8em;
		padding: 8em 8em 0 10.5em;
	}
	.f-logo {
		width: 15.5em;
		height: 15.5em;
		flex: none;
		/* El logo rosa del sitio, en blanco y negro: el círculo negro y las letras blancas. */
		filter: grayscale(1) brightness(0.6) contrast(8);
	}
	.spark {
		width: 6em;
		height: 6em;
		flex: none;
		fill: none;
		stroke: #000;
		stroke-width: 1.2;
	}
	.f-title {
		margin: 0;
		flex: 1;
		text-align: center;
		text-transform: uppercase;
		font-size: 4.5em;
		line-height: 1.05;
	}
	.f-events {
		list-style: none;
		margin: 0;
		padding: 3em 11em 3em 14.5em;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: space-evenly;
	}
	.f-event {
		display: flex;
		align-items: center;
		gap: 1.6em;
	}
	.f-icon {
		flex: none;
		width: 12.6em;
		height: 12.6em;
		border-radius: 50%;
		background: #000;
		box-shadow:
			inset 0 0 0 0.9em #000,
			inset 0 0 0 1.25em #fff;
		display: grid;
		place-items: center;
		margin-top: 2.5em;
	}
	.f-icon span {
		font-size: 6.6em;
		line-height: 1;
		font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
		filter: grayscale(1) brightness(1.15);
	}
	.f-body {
		min-width: 0;
		flex: 1;
	}
	.f-pill {
		margin: 0 0 0.9em;
		background: #000;
		color: #fff;
		border-radius: 999px;
		padding: 1.3em 3.4em 1em;
		display: flex;
		align-items: center;
		gap: 1.8em;
	}
	.f-name {
		font-size: 6.6em;
		text-transform: uppercase;
		line-height: 0.95;
		overflow-wrap: anywhere;
	}
	.f-name.long {
		font-size: 5.4em;
	}
	.f-name.longer {
		font-size: 4.6em;
	}
	.f-sub {
		font-style: italic;
		font-size: 2.5em;
		line-height: 1;
		max-width: 13em;
	}
	.f-line {
		margin: 0;
		/* 3,4 mm, en la medida de esta letra (5 mm) */
		padding-left: 0.68em;
		font-size: 5em;
		line-height: 1.05;
		text-transform: uppercase;
	}
	/* «SAN TELMO (dirección x privado)»: la nota entre paréntesis va como se escribió. */
	.f-note {
		text-transform: none;
	}
	.f-foot {
		background: #000;
		color: #fff;
		min-height: 9em;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 3em;
		padding: 0.8em 4em;
	}
	.f-foot > span:first-child {
		font-size: 4.4em;
		text-transform: uppercase;
	}
	.f-qr {
		background: #fff;
		width: 11em;
		height: 11em;
		margin-block: -2.5em 0;
		flex: none;
	}
	.f-qr :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	@media print {
		/* Solo la hoja: sin controles, sin el aviso de demo, sin sombras ni márgenes. */
		.controls,
		:global(.demo-banner) {
			display: none !important;
		}
		:global(html),
		:global(body),
		:global(.kv-panel) {
			background: #fff !important;
			margin: 0 !important;
			min-height: 0 !important;
		}
		.agenda-impresa {
			display: block;
			padding: 0;
		}
		.preview {
			overflow: visible;
		}
		.sheet {
			box-shadow: none;
			break-inside: avoid;
		}
	}
</style>
