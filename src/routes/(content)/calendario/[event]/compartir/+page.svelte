<script>
	// "Compartir como imagen": cualquier persona puede armar y descargar imágenes de un evento
	// para difundirlo. Usa solo datos públicos del evento (los mismos que muestra su página);
	// lo que se edita acá queda en el navegador y no se guarda en ningún lado.
	import { onMount } from 'svelte';
	import { Download, Share2, Copy, Check, RotateCcw } from '@lucide/svelte';
	import logoURL from '../../../../logo.png';
	import {
		FORMATS,
		RATIOS,
		LAYOUTS,
		PALETTES,
		FONTS,
		FIELDS,
		loadFont,
		loadFonts,
		buildCaption,
		defaultTexts,
		defaultEnabled,
		visibleTexts,
		censorText,
		eventInfo,
		sectionsFromHTML,
		extrasFromSections
	} from '$lib/utils/shareImage.js';
	import { renderShareImage, loadImage, canvasToBlob } from '$lib/utils/shareDraw.js';
	import { paletteFromImage, pickRoles, derivePalette, isHex } from '$lib/utils/palette.js';
	export let data;

	const info = eventInfo(data.meta);
	/** @type {any} campos opcionales del frontmatter que no están en el tipo */
	const meta = data.meta;
	const hasFeatured = !!data.meta.featured;
	let layout = hasFeatured ? 'flyer' : 'cartel';
	let ratio = 'portrait';
	// en un evento que ya pasó no tiene sentido "¡Anotate!" (cancelado sí se sigue mostrando)
	let showStatus = !info.ended || data.meta.status === 'cancelado';
	let useQR = true;
	let censor = false;
	let ready = false;
	let canShareFiles = false;
	/** @type {HTMLImageElement|null} */
	let image = null;
	/** @type {HTMLImageElement|null} */
	let logo = null;
	/** @type {Record<string, HTMLCanvasElement>} */
	let canvases = {};
	/** @type {import('$lib/utils/shareImage.js').Texts} */
	let texts = defaultTexts(data.meta);
	let enabled = defaultEnabled(texts);
	/** campos que la persona tocó: no se pisan con lo que llegue después */
	/** @type {Set<string>} */
	const touched = new Set();
	let caption = buildCaption(data.meta);
	let copied = false;
	let message = '';
	/** @type {boolean[][]|null} */
	let qr = null;

	// --- colores ---
	/** @type {import('$lib/utils/palette.js').Swatch[]} */
	let swatches = [];
	/** 'auto' (de la imagen), el id de una paleta de la casa, o 'custom' */
	let mode = 'uva';
	/** @type {import('$lib/utils/palette.js').Roles} */
	let roles = { bg: PALETTES.uva.bg, main: PALETTES.uva.title, accent: PALETTES.uva.small };
	/** @type {import('$lib/utils/palette.js').Roles} */
	let autoRoles = roles;
	const ROLE_LABELS = /** @type {const} */ ([
		['bg', 'Fondo'],
		['main', 'Títulos'],
		['accent', 'Acento']
	]);

	$: palette =
		mode in PALETTES ? PALETTES[mode] : derivePalette(roles, mode === 'auto' ? swatches[3]?.hex : undefined);

	/** @param {string} id */
	function choosePreset(id) {
		mode = id;
		const p = PALETTES[id];
		roles = { bg: p.bg, main: p.title, accent: p.small };
	}
	function chooseAuto() {
		mode = 'auto';
		roles = { ...autoRoles };
	}
	/** @param {'bg'|'main'|'accent'} role @param {string} hex */
	function setRole(role, hex) {
		if (!isHex(hex)) return;
		roles = { ...roles, [role]: hex };
		mode = 'custom';
	}

	// --- tipografías ---
	let displayFont = 'lilita';
	let bodyFont = 'fredoka';
	let fontsLoading = false;
	/** fuentes efectivamente listas (se dibuja con estas mientras cargan las nuevas) */
	let fonts = { display: 'lilita', body: 'fredoka' };
	async function applyFonts() {
		fontsLoading = true;
		const want = { display: displayFont, body: bodyFont };
		await Promise.all([loadFont('display', want.display), loadFont('body', want.body)]);
		if (want.display === displayFont && want.body === bodyFont) {
			fonts = want;
			fontsLoading = false;
		}
	}

	onMount(async () => {
		[image, logo] = await Promise.all([
			loadImage(hasFeatured ? data.meta.featured + '' : undefined),
			loadImage(logoURL),
			loadFonts()
		]);
		// si alguna tipografía termina de cargar tarde, redibujar con la definitiva
		document.fonts?.addEventListener?.('loadingdone', () => (texts = texts));
		if (image) {
			swatches = paletteFromImage(image, 6);
		} else if (isHex(meta.carrousel_background)) {
			// sin imagen: los colores que el evento ya usa en el carrusel del sitio
			swatches = [meta.carrousel_background, meta.carrousel_accent_bg, meta.carrousel_accent_text]
				.filter(isHex)
				.map((hex, i) => ({ hex, rgb: [0, 0, 0], weight: 1 - i * 0.3 }));
		}
		if (swatches.length) {
			autoRoles = pickRoles(swatches);
			chooseAuto();
		}
		if (!image) layout = 'cartel';
		try {
			const probe = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
			canShareFiles = !!navigator.canShare?.({ files: [probe] });
		} catch (e) {
			canShareFiles = false;
		}
		ready = true;
		loadExtras();
		loadQR();
	});

	/** Datos que están en el texto del evento (entrada, para quién, accesibilidad, dress code). */
	async function loadExtras() {
		try {
			const res = await fetch(data.path, { headers: { accept: 'text/html' } });
			if (!res.ok) return;
			const extras = extrasFromSections(sectionsFromHTML(await res.text()));
			const next = defaultTexts(data.meta, extras);
			const on = defaultEnabled(next);
			for (const key of /** @type {(keyof typeof texts)[]} */ (['price', 'priceInfo', 'audience', 'dress', 'access'])) {
				if (touched.has(key) || !next[key] || next[key] === texts[key]) continue;
				texts[key] = next[key];
				enabled[key] = on[key];
			}
			texts = texts;
			enabled = enabled;
		} catch (e) {
			// sin esos datos se puede igual: los campos quedan para completar a mano
		}
	}

	async function loadQR() {
		try {
			const { encode } = await import('uqr');
			qr = encode('https://' + info.url, { ecc: 'M', border: 0 }).data;
		} catch (e) {
			qr = null;
		}
	}

	/** @param {typeof texts} t */
	const censored = (t) =>
		/** @type {typeof texts} */ (
			Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k === 'url' ? v : censorText(v)]))
		);
	$: shown = visibleTexts(censor ? censored(texts) : texts, enabled);

	$: if (ready) draw(layout, palette, ratio, showStatus, shown, fonts, useQR ? qr : null);

	/**
	 * @param {string} layout @param {any} palette @param {string} ratio @param {boolean} showStatus
	 * @param {typeof texts} texts @param {{display:string, body:string}} fonts @param {boolean[][]|null} qr
	 */
	function draw(layout, palette, ratio, showStatus, texts, fonts, qr) {
		for (const format of /** @type {('post'|'info'|'story')[]} */ (Object.keys(FORMATS))) {
			if (!canvases[format]) continue;
			renderShareImage(canvases[format], {
				meta: data.meta,
				format,
				ratio,
				layout,
				palette,
				texts,
				image,
				logo,
				showStatus,
				fonts,
				qr
			});
		}
	}

	/** @param {string} format */
	const fileName = (format) =>
		`${data.meta.postID}-${format == 'post' ? 'portada' : format == 'info' ? 'ficha' : 'vertical'}.png`;

	/** @param {string} format */
	async function download(format) {
		const blob = await canvasToBlob(canvases[format]);
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName(format);
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	}

	/** @param {string} format */
	async function share(format) {
		const blob = await canvasToBlob(canvases[format]);
		if (!blob) return;
		const file = new File([blob], fileName(format), { type: 'image/png' });
		// muchas apps ignoran el texto que se comparte junto con la imagen: lo dejamos copiado
		await copyCaption(false);
		try {
			await navigator.share({ files: [file], title: info.title });
			message = 'Listo. El texto sugerido quedó copiado para que lo pegues.';
		} catch (e) {
			if (/** @type {Error} */ (e)?.name !== 'AbortError') {
				message = 'No se pudo compartir; probá descargando la imagen.';
			}
		}
	}

	/** @type {HTMLTextAreaElement} */
	let captionEl;
	async function copyCaption(feedback = true) {
		try {
			await navigator.clipboard.writeText(caption);
		} catch (e) {
			captionEl?.select();
			document.execCommand?.('copy');
		}
		if (feedback) {
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}

	function resetTexts() {
		touched.clear();
		texts = defaultTexts(data.meta);
		enabled = defaultEnabled(texts);
		loadExtras();
	}
</script>

<svelte:head>
	<title>Compartir como imagen: {data.meta.title} - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<article class="compartir">
	<header>
		<h1>Compartir como imagen</h1>
		<p class="subtitle"><a href={data.path}>{data.meta.title}</a></p>
		<p class="lead">
			Descargá las imágenes para compartir el evento. Elegí el diseño, los colores y la
			tipografía, y prendé, apagá o corregí cada dato: los cambios quedan solo en tu
			dispositivo.
		</p>
		{#if info.ended}
			<p class="warning">Ojo: este evento ya pasó.</p>
		{/if}
	</header>

	<div class="workspace">
		<section class="previews" aria-busy={!ready} aria-label="Imágenes">
			{#each Object.entries(FORMATS) as [format, f]}
				<figure class:story={format == 'story'}>
					<figcaption>
						{f.label}
						<small>{f.w}×{format == 'story' ? f.h : RATIOS[ratio].h}</small>
					</figcaption>
					<!-- sin width/height: renderShareImage los fija (cambiarlos desde acá borraría el dibujo) -->
					<canvas
						bind:this={canvases[format]}
						style="aspect-ratio: {f.w} / {format == 'story' ? f.h : RATIOS[ratio].h}"
						data-format={format}
						class:loading={!ready}
					></canvas>
					<div class="actions">
						<button on:click={() => download(format)} disabled={!ready} data-download={format}>
							<Download size="18" /> Descargar
						</button>
						{#if canShareFiles}
							<button on:click={() => share(format)} disabled={!ready} class="secondary">
								<Share2 size="18" /> Compartir
							</button>
						{/if}
					</div>
				</figure>
			{/each}
			{#if message}<p class="note">{message}</p>{/if}
		</section>

		<div class="controls">
			<fieldset class="chips">
				<legend>Diseño</legend>
				{#each Object.entries(LAYOUTS) as [id, l]}
					{@const off = l.image && ready && !image}
					<label class:selected={layout == id} class:disabled={off}>
						<input type="radio" bind:group={layout} value={id} name="layout" disabled={off} />
						{l.label}
					</label>
				{/each}
				{#if !hasFeatured || (ready && !image)}
					<p class="hint">Este evento no tiene imagen: los diseños van sin foto.</p>
				{/if}
			</fieldset>

			<fieldset class="chips">
				<legend>Proporción de la portada y la ficha</legend>
				{#each Object.entries(RATIOS) as [id, r]}
					<label class:selected={ratio == id}>
						<input type="radio" bind:group={ratio} value={id} name="ratio" />
						{r.label}
					</label>
				{/each}
			</fieldset>

			<fieldset class="colors">
				<legend>Colores</legend>
				<div class="chips">
					{#if swatches.length}
						<label class:selected={mode == 'auto'}>
							<input type="radio" checked={mode == 'auto'} on:change={chooseAuto} name="palette" />
							<span class="dots" aria-hidden="true">
								{#each swatches.slice(0, 4) as sw}<span style="background: {sw.hex}"></span>{/each}
							</span>
							{image ? 'De la imagen' : 'Del evento'}
						</label>
					{/if}
					{#each Object.entries(PALETTES) as [id, p]}
						<label class:selected={mode == id}>
							<input type="radio" checked={mode == id} on:change={() => choosePreset(id)} name="palette" />
							<span class="dots" aria-hidden="true">
								<span style="background: {p.bg}"></span><span style="background: {p.title}"></span><span
									style="background: {p.small}"
								></span>
							</span>
							{p.label}
						</label>
					{/each}
					{#if mode == 'custom'}
						<span class="custom-tag">A tu gusto</span>
					{/if}
				</div>
				<div class="roles">
					{#each ROLE_LABELS as [role, label]}
						<div class="role">
							<label class="picker">
								<input
									type="color"
									value={roles[role]}
									on:input={(e) => setRole(role, e.currentTarget.value)}
								/>
								<span>{label}</span>
							</label>
							{#if swatches.length}
								<div class="swatches" role="group" aria-label="Colores de la imagen para {label.toLowerCase()}">
									{#each swatches as sw}
										<button
											type="button"
											class="swatch"
											class:current={roles[role] == sw.hex}
											style="background: {sw.hex}"
											title={sw.hex}
											aria-label="Usar {sw.hex} para {label.toLowerCase()}"
											on:click={() => setRole(role, sw.hex)}
										></button>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
				<p class="hint">
					El texto se pone claro u oscuro solo, según el fondo, para que siempre se lea.
				</p>
			</fieldset>

			<fieldset class="fonts">
				<legend>Tipografías</legend>
				<div class="font-grid">
				<label>
					<span>Títulos</span>
					<select bind:value={displayFont} on:change={applyFonts}>
						{#each Object.entries(FONTS.display) as [id, f]}<option value={id}>{f.label}</option>{/each}
					</select>
				</label>
				<label>
					<span>Textos</span>
					<select bind:value={bodyFont} on:change={applyFonts}>
						{#each Object.entries(FONTS.body) as [id, f]}<option value={id}>{f.label}</option>{/each}
					</select>
				</label>
				</div>
				{#if fontsLoading}<p class="hint" role="status">Cargando tipografía…</p>{/if}
			</fieldset>

			<fieldset class="options">
				<legend>Opciones</legend>
				{#if data.meta.status}
					<label class="toggle">
						<input type="checkbox" bind:checked={showStatus} />
						Mostrar el estado ({data.meta.status})
					</label>
				{/if}
				<label class="toggle">
					<input type="checkbox" bind:checked={useQR} disabled={!qr} />
					Código QR al evento (en la ficha y la vertical)
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={censor} />
					Disimular palabras sensibles para los filtros de las redes (ER0TIC4, BD$M)
				</label>
			</fieldset>

			<fieldset class="texts">
				<legend>Datos en las imágenes</legend>
				<p class="hint">Prendé o apagá cada dato y corregilo si hace falta. No se guarda nada.</p>
				{#each FIELDS as field}
					<div class="field" class:off={!enabled[field.key]}>
						<label class="check">
							<input
								type="checkbox"
								bind:checked={enabled[field.key]}
								disabled={field.required}
								aria-label="Mostrar {field.label.toLowerCase()}"
							/>
							<span>{field.label}</span>
							<small>{field.where}</small>
						</label>
						{#if field.long}
							<textarea
								rows="2"
								bind:value={texts[field.key]}
								placeholder={field.placeholder ?? ''}
								aria-label={field.label}
								on:input={() => {
									touched.add(field.key);
									if (!field.required && texts[field.key]) enabled[field.key] = true;
								}}
							></textarea>
						{:else}
							<input
								type="text"
								bind:value={texts[field.key]}
								placeholder={field.placeholder ?? ''}
								aria-label={field.label}
								on:input={() => {
									touched.add(field.key);
									if (!field.required && texts[field.key]) enabled[field.key] = true;
								}}
							/>
						{/if}
					</div>
				{/each}
				<button class="secondary" on:click={resetTexts}>
					<RotateCcw size="18" /> Restaurar textos
				</button>
			</fieldset>

			<section class="caption">
				<h2>Texto para acompañar la imagen</h2>
				<textarea bind:this={captionEl} bind:value={caption} rows="12" aria-label="Texto sugerido"
				></textarea>
				<div class="actions">
					<button on:click={() => copyCaption()}>
						{#if copied}<Check size="18" /> ¡Copiado!{:else}<Copy size="18" /> Copiar texto{/if}
					</button>
					<button class="secondary" on:click={() => (caption = buildCaption(data.meta))}>
						Restaurar
					</button>
				</div>
			</section>
		</div>
	</div>
</article>

<style lang="scss">
	.compartir {
		max-width: 80rem;
		margin-inline: auto;
		padding-inline: 1rem;
		box-sizing: border-box;
	}
	header {
		text-align: center;
		max-width: 44rem;
		margin-inline: auto;
	}
	h1 {
		font-size: var(--step-4);
		margin-bottom: 0.2em;
	}
	.subtitle {
		font-size: var(--step-1);
		margin-top: 0;
	}
	.lead {
		margin-top: 0;
	}
	.warning {
		font-weight: bold;
		color: var(--1-dark);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 26rem);
		gap: 2rem;
		align-items: start;
		margin-top: 1.5rem;
	}
	.previews {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.2rem;
		align-items: start;
		position: sticky;
		top: 1rem;
		.note {
			grid-column: 1 / -1;
			text-align: center;
		}
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6em;
		min-width: 0;
	}
	figcaption {
		font-weight: bold;
		color: var(--2-dark);
		text-align: center;
		small {
			display: block;
			font-weight: normal;
			opacity: 0.7;
		}
	}
	canvas {
		width: 100%;
		height: auto;
		border-radius: 0.6rem;
		box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.2);
		background: var(--2-dark);
		&.loading {
			opacity: 0.4;
		}
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		min-width: 0;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 1rem;
		background: white;
		border-radius: var(--round);
		min-width: 0;
		legend {
			float: left;
			width: 100%;
			font-weight: bold;
			color: var(--2-dark);
			margin-bottom: 0.6em;
		}
		// la legend flota para poder ir adentro de la caja; lo demás va debajo
		> :not(legend) {
			clear: both;
		}
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		> label {
			display: inline-flex;
			align-items: center;
			gap: 0.4em;
			padding: 0.35em 0.9em;
			border-radius: 999em;
			outline: 2px solid var(--2);
			color: var(--2-dark);
			cursor: pointer;
			user-select: none;
			position: relative;
			input {
				position: absolute;
				inset: 0;
				opacity: 0;
				pointer-events: none;
			}
			&.selected {
				background: var(--2);
				color: white;
			}
			&:focus-within {
				outline-color: var(--1);
				outline-width: 3px;
			}
			&.disabled {
				opacity: 0.4;
				cursor: not-allowed;
			}
		}
	}
	.custom-tag {
		align-self: center;
		font-size: 0.9em;
		font-style: italic;
		color: var(--2-dark);
	}
	.dots {
		display: inline-flex;
		span {
			width: 0.85em;
			height: 0.85em;
			border-radius: 50%;
			outline: 1px solid rgba(0, 0, 0, 0.25);
			margin-right: -0.25em;
		}
	}
	.hint {
		width: 100%;
		margin: 0.6em 0 0;
		font-size: 0.9em;
		opacity: 0.8;
	}
	.roles {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		margin-top: 1em;
	}
	.role {
		display: flex;
		align-items: center;
		gap: 0.8em;
		flex-wrap: wrap;
	}
	.picker {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		min-width: 6.5em;
		cursor: pointer;
		input {
			width: 2.2em;
			height: 2.2em;
			padding: 0;
			border: 2px solid var(--2-light);
			border-radius: 0.5em;
			background: none;
			cursor: pointer;
		}
	}
	.swatches {
		display: flex;
		gap: 0.35em;
		flex-wrap: wrap;
	}
	.swatch {
		width: 1.9em;
		height: 1.9em;
		min-height: 0;
		padding: 0;
		border-radius: 50%;
		border: 2px solid white;
		outline: 1px solid rgba(0, 0, 0, 0.3);
		cursor: pointer;
		&.current {
			outline: 3px solid var(--1);
		}
		&:hover:not(:disabled) {
			background: inherit;
		}
	}
	.font-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8em;
		label {
			display: flex;
			flex-direction: column;
			gap: 0.2em;
			span {
				font-size: 0.9em;
				opacity: 0.75;
			}
		}
	}
	select,
	.texts input[type='text'],
	.texts textarea,
	.caption textarea {
		font: inherit;
		padding: 0.4em 0.6em;
		border-radius: 0.4em;
		border: 2px solid var(--2-light);
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		background: white;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	.toggle {
		display: flex;
		gap: 0.5em;
		align-items: flex-start;
		input {
			margin-top: 0.25em;
		}
	}
	.texts {
		display: flex;
		flex-direction: column;
		gap: 0.7em;
		.hint {
			margin: 0 0 0.3em;
		}
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		&.off {
			input[type='text'],
			textarea {
				opacity: 0.5;
			}
		}
		.check {
			display: flex;
			align-items: baseline;
			gap: 0.4em;
			span {
				font-weight: bold;
				color: var(--2-dark);
			}
			small {
				opacity: 0.6;
				margin-left: auto;
				text-align: right;
			}
		}
		textarea {
			resize: vertical;
		}
	}
	.actions {
		display: flex;
		gap: 0.5em;
		flex-wrap: wrap;
		justify-content: center;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4em;
		border: 2px solid var(--1);
		background: var(--1);
		color: white;
		font: inherit;
		font-weight: bold;
		padding: 0.45em 1em;
		border-radius: 999em;
		cursor: pointer;
		&:hover:not(:disabled) {
			background: var(--1-light);
		}
		&:disabled {
			opacity: 0.5;
			cursor: wait;
		}
		&.secondary {
			background: white;
			color: var(--1-dark);
		}
	}
	.texts > button {
		align-self: center;
	}
	.caption {
		background: white;
		border-radius: var(--round);
		padding: 1rem;
		h2 {
			font-size: var(--step-1);
			margin: 0 0 0.6em;
			text-align: left;
		}
		textarea {
			margin-bottom: 0.6em;
		}
	}
	@media (max-width: 60rem) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
		.previews {
			position: static;
		}
	}
	@media (max-width: 40rem) {
		// en el celu las tres imágenes se deslizan de costado (sin mover la página)
		.previews {
			display: flex;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			gap: 1rem;
			margin-inline: -1rem;
			padding: 0.5rem 1rem 1rem;
			figure {
				flex: 0 0 72%;
				scroll-snap-align: center;
				// la vertical, más angosta: así las tres miden lo mismo de alto y no queda un
				// hueco grande debajo de las otras dos
				&.story {
					flex-basis: calc(72% * 1350 / 1920);
				}
			}
			.note {
				flex: 0 0 100%;
			}
		}
	}
</style>
