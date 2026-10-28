<script>
	/**
	 * Agenda impresa › Instagram: el carrusel mensual «agenda kinky» (placas de 1080 × 1350) y el
	 * texto del posteo, como los posts que publica KinkyVibe. Cada placa es una imagen SVG con todo
	 * adentro (letras, dibujo de fondo, logo e imágenes de los eventos como data: URLs); la vista
	 * previa es esa misma imagen y para bajarla se dibuja en un canvas y se guarda como PNG. Nada
	 * se guarda en el sitio. Ver docs/panel.md#instagram.
	 */
	import { Copy, Download, RotateCcw } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import {
		DEFAULT_COVER_TEXT,
		DEFAULT_PER_SLIDE,
		DEFAULT_SLIDE_FOOTER,
		PER_SLIDE_CHOICES,
		SLIDE_H,
		SLIDE_W,
		buildSlides,
		instagramCaption,
		rangeMonthName,
		slideFileName,
		slideSvg,
		svgDataUrl
	} from '$lib/utils/agendaInstagram.js';
	import latoUrl from '$lib/styles/fonts/lato-latin-400-normal.woff2?url';
	import latoBoldUrl from '$lib/styles/fonts/lato-latin-700-normal.woff2?url';

	/** Las filas tildadas, en orden y con lo cambiado a mano. @type {import('$lib/utils/agendaInstagram.js').SlideRow[]} */
	export let rows = [];
	/** @type {{ from: string, to: string }} */
	export let range;
	/** La URL del logo del sitio (la página lo importa de src/routes/logo.png). */
	export let logoUrl = '';
	/** El porcentaje del Fondo de este mes (null si no se supo). @type {number | null} */
	export let fondoPercent = null;

	let month = rangeMonthName(range);
	let lastRange = `${range.from}/${range.to}`;
	$: if (`${range.from}/${range.to}` !== lastRange) {
		lastRange = `${range.from}/${range.to}`;
		month = rangeMonthName(range);
	}
	$: monthKey = range.from.slice(0, 7);
	let coverText = DEFAULT_COVER_TEXT;
	let footer = DEFAULT_SLIDE_FOOTER;
	let perSlide = DEFAULT_PER_SLIDE;
	let showFondo = true;
	let percent = fondoPercent ?? 0;

	/** @type {Omit<import('$lib/utils/agendaInstagram.js').SlideAssets, 'images'> | null} */
	let base = null;
	let loadError = '';

	/** @param {Blob} blob @returns {Promise<string>} */
	const readBlob = (blob) =>
		new Promise((resolve, reject) => {
			const r = new FileReader();
			r.onload = () => resolve(String(r.result));
			r.onerror = () => reject(r.error);
			r.readAsDataURL(blob);
		});

	/** @param {string} url */
	async function dataUrl(url) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`${url}: ${res.status}`);
		return readBlob(await res.blob());
	}

	/** @param {string} url */
	const fontUrl = async (url) => (await dataUrl(url)).replace(/^data:[^;,]*/, 'data:font/woff2');

	/**
	 * Una imagen del sitio, recortada al cuadrado y achicada (las placas la muestran a 310 px):
	 * así el SVG no pesa de más. Es del mismo sitio, así que el canvas no queda «manchado».
	 * @param {string} url
	 * @param {number} size
	 */
	async function squareImage(url, size = 420) {
		// Una imagen de kinkyvibe.ar con la dirección entera (las copias del modo demo) se pide
		// primero acá mismo: en el sitio es la misma, y kinkyvibe.ar no deja leerla desde otro lado.
		const local = /^https:\/\//.test(url) ? new URL(url).pathname : url;
		let res = await fetch(local).catch(() => null);
		if (!res?.ok && local !== url) res = await fetch(url);
		if (!res?.ok) throw new Error(String(res?.status));
		const bmp = await createImageBitmap(await res.blob());
		const side = Math.min(bmp.width, bmp.height);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
		const x = (bmp.width - side) / 2;
		const y = (bmp.height - side) / 2;
		ctx.drawImage(bmp, x, y, side, side, 0, 0, size, size);
		return canvas.toDataURL('image/jpeg', 0.88);
	}

	/** El logo del sitio (rosa) en el violeta de los posts: los píxeles de color pasan a violeta. */
	async function purpleLogo() {
		const res = await fetch(logoUrl);
		const bmp = await createImageBitmap(await res.blob());
		const canvas = document.createElement('canvas');
		canvas.width = bmp.width;
		canvas.height = bmp.height;
		const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
		ctx.drawImage(bmp, 0, 0);
		const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const d = img.data;
		for (let i = 0; i < d.length; i += 4) {
			const max = Math.max(d[i], d[i + 1], d[i + 2]);
			const min = Math.min(d[i], d[i + 1], d[i + 2]);
			// Cuánto «color» tiene (0 = blanco o gris): mezcla hacia el violeta (106, 23, 238).
			const t = max ? (max - min) / max : 0;
			d[i] = Math.round(d[i] * (1 - t) + 106 * t);
			d[i + 1] = Math.round(d[i + 1] * (1 - t) + 23 * t);
			d[i + 2] = Math.round(d[i + 2] * (1 - t) + 238 * t);
		}
		ctx.putImageData(img, 0, 0);
		return canvas.toDataURL('image/png');
	}

	onMount(async () => {
		try {
			const [bebas, barlow, fredoka, lato, latoBold, pattern, logo] = await Promise.all([
				fontUrl('/fonts/agenda-instagram/bebas-neue-latin-400.woff2'),
				fontUrl('/fonts/agenda-instagram/barlow-condensed-latin-600.woff2'),
				fontUrl('/fonts/share/fredoka-latin-variable.woff2'),
				fontUrl(latoUrl),
				fontUrl(latoBoldUrl),
				dataUrl('/agenda-impresa/fondo.svg'),
				purpleLogo()
			]);
			base = { bebas, barlow, fredoka, lato, latoBold, pattern, logo };
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		}
	});

	// Las imágenes de los eventos, por URL (se piden una vez cada una).
	/** @type {Record<string, string>} */
	let byUrl = {};
	/** @type {Set<string>} */
	const asked = new Set();
	let imageErrors = 0;
	$: for (const r of rows) {
		const url = r.image;
		if (!url || asked.has(url)) continue;
		asked.add(url);
		squareImage(url)
			.then((src) => (byUrl = { ...byUrl, [url]: src }))
			.catch(() => (imageErrors += 1));
	}
	/** @type {Record<string, string>} */
	$: images = Object.fromEntries(
		rows.filter((r) => r.image && byUrl[r.image]).map((r) => [r.slug, byUrl[r.image]])
	);

	$: slides = buildSlides(rows, {
		month,
		monthKey,
		perSlide,
		coverText,
		footer,
		fondo: showFondo ? Number(percent) || 0 : null
	});
	$: sources = base
		? slides.map((s) =>
				svgDataUrl(slideSvg(s, { .../** @type {NonNullable<typeof base>} */ (base), images }))
			)
		: [];

	/** @param {import('$lib/utils/agendaInstagram.js').Slide} s @param {number} i */
	function slideLabel(s, i) {
		if (s.kind === 'cover') return 'portada';
		if (s.kind === 'fondo') return 'placa del Fondo';
		return `placa ${i + 1}`;
	}

	// El texto del posteo: se arma solo hasta que se lo toca; después manda lo escrito.
	let caption = '';
	let captionEdited = false;
	$: generated = instagramCaption(rows, { month });
	$: if (!captionEdited) caption = generated;
	let copied = false;

	async function copyCaption() {
		try {
			await navigator.clipboard.writeText(caption);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	function regenerate() {
		captionEdited = false;
		caption = generated;
	}

	let busy = false;
	let downloadError = '';

	/**
	 * La placa como PNG: la imagen SVG dibujada en un canvas del tamaño real.
	 * @param {string} src
	 * @returns {Promise<Blob>}
	 */
	async function toPng(src) {
		const img = new Image();
		img.width = SLIDE_W;
		img.height = SLIDE_H;
		img.src = src;
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = SLIDE_W;
		canvas.height = SLIDE_H;
		const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
		ctx.drawImage(img, 0, 0, SLIDE_W, SLIDE_H);
		// Las letras embebidas a veces llegan un instante tarde a la primera pasada: otra vez.
		await new Promise((r) => requestAnimationFrame(() => r(null)));
		ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
		ctx.drawImage(img, 0, 0, SLIDE_W, SLIDE_H);
		return new Promise((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas vacío'))), 'image/png')
		);
	}

	/** @param {number} i */
	async function download(i) {
		const blob = await toPng(sources[i]);
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = slideFileName(month, i);
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	/** @param {number[]} which */
	async function run(which) {
		busy = true;
		downloadError = '';
		try {
			for (const i of which) {
				await download(i);
				// Un respiro entre bajadas: algunos navegadores frenan varias seguidas.
				if (which.length > 1) await new Promise((r) => setTimeout(r, 400));
			}
		} catch (e) {
			downloadError = `No se pudo armar el PNG (${e instanceof Error ? e.message : e}). Probá con Chrome o Firefox.`;
		} finally {
			busy = false;
		}
	}
</script>

<div class="instagram">
	<fieldset class="options">
		<legend>Las placas</legend>
		<label>Mes (portada) <input class="kv-input" bind:value={month} /></label>
		<label>Bajada de la portada <input class="kv-input" bind:value={coverText} /></label>
		<label>Pie <input class="kv-input" bind:value={footer} /></label>
		<label
			>Eventos por placa
			<select class="kv-input" bind:value={perSlide}>
				{#each PER_SLIDE_CHOICES as n (n)}<option value={n}>{n}</option>{/each}
			</select></label
		>
		<label class="check"><input type="checkbox" bind:checked={showFondo} /> Placa del Fondo</label>
		{#if showFondo}
			<label
				>Porcentaje del Fondo <input
					class="kv-input"
					type="number"
					min="0"
					max="100"
					step="10"
					bind:value={percent}
				/></label
			>
		{/if}
	</fieldset>
	{#if showFondo && fondoPercent === null}
		<Notice tone="warn"
			>No se pudo saber el porcentaje del Fondo de este mes: escribilo a mano.</Notice
		>
	{/if}

	<div class="actions">
		<button
			class="kv-btn"
			type="button"
			disabled={busy || !sources.length}
			on:click={() => run(sources.map((_, i) => i))}
			><Download size={18} aria-hidden="true" /> Descargar todas ({sources.length})</button
		>
		<span class="muted">PNG de {SLIDE_W} × {SLIDE_H} (4:5), una por placa.</span>
	</div>
	{#if loadError}
		<Notice tone="warn"
			>No se pudieron cargar las letras o el logo ({loadError}). Recargá la página.</Notice
		>
	{/if}
	{#if imageErrors}
		<Notice tone="warn"
			>{imageErrors === 1 ? 'Una imagen no se pudo' : `${imageErrors} imágenes no se pudieron`} cargar:
			esos eventos van con su título en un recuadro violeta.</Notice
		>
	{/if}
	{#if downloadError}<Notice tone="warn">{downloadError}</Notice>{/if}

	<ol class="slides" aria-label="Placas del carrusel">
		{#each slides as slide, i (i)}
			<li>
				{#if sources[i]}
					<img
						src={sources[i]}
						width={SLIDE_W}
						height={SLIDE_H}
						alt="Vista previa: {slideLabel(slide, i)}"
					/>
				{:else}
					<div class="placeholder" aria-hidden="true"></div>
				{/if}
				<button
					class="kv-btn ghost small"
					type="button"
					disabled={busy || !sources[i]}
					on:click={() => run([i])}
					><Download size={14} aria-hidden="true" /> Descargar {slideLabel(slide, i)}</button
				>
			</li>
		{/each}
	</ol>

	<section class="caption" aria-label="Texto del posteo">
		<label for="ig-caption"><strong>Texto del posteo</strong></label>
		<p class="muted">
			Se arma con los eventos de las placas; cambialo antes de copiarlo si querés.
		</p>
		<textarea
			id="ig-caption"
			class="kv-input"
			rows="16"
			bind:value={caption}
			on:input={() => (captionEdited = true)}></textarea>
		<div class="actions">
			<button class="kv-btn" type="button" on:click={copyCaption}
				><Copy size={16} aria-hidden="true" /> {copied ? '¡Copiado!' : 'Copiar texto'}</button
			>
			{#if captionEdited}
				<button class="kv-btn ghost small" type="button" on:click={regenerate}
					><RotateCcw size={14} aria-hidden="true" /> Volver a armarlo con los eventos</button
				>
			{/if}
			<span class="muted">{caption.length} / 2200 caracteres</span>
		</div>
		{#if caption.length > 2200}
			<Notice tone="warn">Instagram corta el texto en 2200 caracteres: acortalo un poco.</Notice>
		{/if}
	</section>
</div>

<style>
	.instagram {
		display: grid;
		gap: var(--space-s);
		font-size: var(--text-sm);
	}
	.options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: var(--space-2xs);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		padding: var(--space-xs);
		margin: 0;
	}
	.options legend {
		font-weight: 700;
	}
	.options label {
		display: grid;
		gap: 0.2em;
		font-weight: 700;
	}
	.options label.check {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		font-weight: 400;
		min-height: var(--tap);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
	}
	.muted {
		color: var(--muted);
		margin: 0;
	}
	.slides {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: var(--space-s);
	}
	.slides li {
		display: grid;
		gap: var(--space-2xs);
		justify-items: start;
	}
	.slides img,
	.placeholder {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 5;
		background: #fff;
		box-shadow: var(--shadow-1);
		border-radius: var(--radius-s, 4px);
	}
	.caption {
		display: grid;
		gap: var(--space-2xs);
	}
	.caption textarea {
		font-family: inherit;
		width: 100%;
	}
</style>
