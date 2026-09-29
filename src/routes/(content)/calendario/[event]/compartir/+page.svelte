<script>
	// Generador de imágenes para compartir un evento en Instagram (post, placa de datos del
	// carrusel e historia). Ruta pública sin links públicos y con noindex: el link aparece
	// solo para admins en el botón "Compartir" del evento.
	import { onMount } from 'svelte';
	import { Download, Share2, Copy, Check, RotateCcw } from '@lucide/svelte';
	import logoURL from '../../../../logo.png';
	import {
		FORMATS,
		RATIOS,
		LAYOUTS,
		PALETTES,
		renderShareImage,
		loadImage,
		loadFonts,
		canvasToBlob,
		buildCaption,
		defaultTexts,
		eventInfo,
		pickPalette
	} from '$lib/utils/shareImage.js';
	export let data;

	const info = eventInfo(data.meta);
	let layout = data.meta.featured ? 'flyer' : 'tipografico';
	let palette = 'auto';
	let ratio = 'square';
	let showStatus = true;
	let overlay = true;
	let ready = false;
	let canShareFiles = false;
	/** @type {HTMLImageElement|null} */
	let image = null;
	/** @type {HTMLImageElement|null} */
	let logo = null;
	/** @type {Record<string, HTMLCanvasElement>} */
	let canvases = {};
	let texts = defaultTexts(data.meta);
	let caption = buildCaption(data.meta);
	let copied = false;
	/** @type {string} */
	let message = '';
	let autoPalette = '';

	/** @type {[keyof typeof texts, string, string][]} */
	const fields = [
		['kicker', 'Antetítulo', 'Texto chico arriba del título'],
		['title', 'Título', ''],
		['sub', 'Bajada', 'Debajo del título'],
		['date', 'Fecha', ''],
		['hours', 'Horario', ''],
		['place', 'Lugar', ''],
		['price', 'Entrada', 'GRATIS, A LA GORRA, $…'],
		['cta', 'Llamado', 'PRE VENTA · LINK EN BIO']
	];

	onMount(async () => {
		[image, logo] = await Promise.all([
			loadImage(data.meta.featured ? data.meta.featured + '' : undefined),
			loadImage(logoURL),
			loadFonts()
		]);
		// si alguna tipografía termina de cargar tarde, redibujar con la definitiva
		document.fonts?.addEventListener?.('loadingdone', () => (texts = texts));
		autoPalette = PALETTES[pickPalette(image)]?.label ?? '';
		if (!image) layout = 'tipografico';
		try {
			const probe = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', {
				type: 'image/png'
			});
			canShareFiles = !!navigator.canShare?.({ files: [probe] });
		} catch (e) {
			canShareFiles = false;
		}
		ready = true;
	});

	$: if (ready) draw(layout, palette, ratio, showStatus, overlay, texts);

	/**
	 * @param {string} layout @param {string} palette @param {string} ratio
	 * @param {boolean} showStatus @param {boolean} overlay @param {typeof texts} texts
	 */
	function draw(layout, palette, ratio, showStatus, overlay, texts) {
		for (const format of Object.keys(FORMATS)) {
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
				overlay
			});
		}
	}

	/** @param {string} format */
	const fileName = (format) =>
		`${data.meta.postID}-${format}${format == 'story' ? '' : '-' + ratio}-${layout}.png`;

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
		// Instagram suele ignorar el texto compartido: lo dejamos en el portapapeles
		await copyCaption(false);
		try {
			await navigator.share({ files: [file], title: info.title });
			message = 'Listo. El texto sugerido quedó copiado para pegarlo en el posteo.';
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
</script>

<svelte:head>
	<title>Compartir: {data.meta.title} - KinkyVibe.ar</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<article class="compartir">
	<h1>Imágenes para Instagram</h1>
	<p class="subtitle">
		<a href={data.path}>{data.meta.title}</a>
	</p>
	{#if info.ended}
		<p class="warning">Ojo: este evento ya pasó.</p>
	{/if}

	<div class="controls">
		<fieldset>
			<legend>Diseño</legend>
			{#each Object.entries(LAYOUTS) as [id, label]}
				<label class:selected={layout == id} class:disabled={id != 'tipografico' && ready && !image}>
					<input
						type="radio"
						bind:group={layout}
						value={id}
						name="layout"
						disabled={id != 'tipografico' && ready && !image}
					/>
					{label}
				</label>
			{/each}
		</fieldset>
		<fieldset>
			<legend>Colores</legend>
			<label class:selected={palette == 'auto'}>
				<input type="radio" bind:group={palette} value="auto" name="palette" />
				Auto{autoPalette ? ` (${autoPalette})` : ''}
			</label>
			{#each Object.entries(PALETTES) as [id, p]}
				<label class:selected={palette == id} style="--swatch: {p.bg}; --swatch2: {p.title}">
					<input type="radio" bind:group={palette} value={id} name="palette" />
					<span class="swatch" aria-hidden="true"></span>{p.label}
				</label>
			{/each}
		</fieldset>
		<fieldset>
			<legend>Proporción del feed</legend>
			{#each Object.entries(RATIOS) as [id, r]}
				<label class:selected={ratio == id}>
					<input type="radio" bind:group={ratio} value={id} name="ratio" />
					{r.label}
				</label>
			{/each}
		</fieldset>
		{#if data.meta.status}
			<label class="toggle">
				<input type="checkbox" bind:checked={showStatus} />
				Mostrar estado ({data.meta.status})
			</label>
		{/if}
		{#if layout == 'flyer' && ratio == 'square'}
			<label class="toggle">
				<input type="checkbox" bind:checked={overlay} />
				Fecha y lugar encima del flyer
			</label>
		{/if}
		{#if !data.meta.featured || (ready && !image)}
			<p class="note">Este evento no tiene imagen destacada: se usa el diseño tipográfico.</p>
		{/if}
	</div>

	<details class="texts">
		<summary>Editar textos de las imágenes</summary>
		<div class="fields">
			{#each fields as [key, label, placeholder]}
				<label>
					<span>{label}</span>
					<input type="text" bind:value={texts[key]} {placeholder} />
				</label>
			{/each}
		</div>
		<button class="secondary" on:click={() => (texts = defaultTexts(data.meta))}>
			<RotateCcw size="18" /> Restaurar textos
		</button>
	</details>

	<div class="previews" aria-busy={!ready}>
		{#each Object.entries(FORMATS) as [format, f]}
			<figure class:story={format == 'story'}>
				<figcaption>
					{f.label} · {f.w}×{format == 'story' ? f.h : RATIOS[ratio].h}
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
						<Download size="18" /> Descargar PNG
					</button>
					{#if canShareFiles}
						<button on:click={() => share(format)} disabled={!ready} class="secondary">
							<Share2 size="18" /> Compartir
						</button>
					{/if}
				</div>
			</figure>
		{/each}
	</div>
	<p class="note">
		Post + placa de datos van juntas como carrusel. En la historia, dejá lugar abajo para el sticker
		de link.
	</p>
	{#if message}<p class="note">{message}</p>{/if}

	<section class="caption">
		<h2>Texto sugerido</h2>
		<textarea bind:this={captionEl} bind:value={caption} rows="18"></textarea>
		<div class="actions">
			<button on:click={() => copyCaption()}>
				{#if copied}<Check size="18" /> ¡Copiado!{:else}<Copy size="18" /> Copiar texto{/if}
			</button>
			<button class="secondary" on:click={() => (caption = buildCaption(data.meta))}>
				Restaurar
			</button>
		</div>
	</section>
</article>

<style lang="scss">
	.compartir {
		max-width: 70rem;
		margin-inline: auto;
		padding-inline: 1em;
	}
	h1 {
		font-size: var(--step-4);
	}
	.subtitle {
		text-align: center;
		font-size: var(--step-1);
		margin-top: 0;
	}
	.warning,
	.note {
		text-align: center;
		color: var(--2-dark);
	}
	.warning {
		font-weight: bold;
		color: var(--1-dark);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1em;
		justify-content: center;
		align-items: center;
		margin-block: 1.5em;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		legend {
			width: 100%;
			text-align: center;
			margin-bottom: 0.4em;
			opacity: 0.7;
		}
		label {
			padding: 0.4em 1em;
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
			}
		}
	}
	label.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.swatch {
		display: inline-block;
		width: 0.9em;
		height: 0.9em;
		border-radius: 50%;
		margin-right: 0.35em;
		vertical-align: -0.1em;
		background: linear-gradient(135deg, var(--swatch) 50%, var(--swatch2) 50%);
		outline: 1px solid rgba(0, 0, 0, 0.2);
	}
	.texts {
		max-width: 50rem;
		margin: 0 auto 2em;
		summary {
			cursor: pointer;
			text-align: center;
			font-weight: bold;
			color: var(--2-dark);
		}
		.fields {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
			gap: 0.8em 1.2em;
			margin-block: 1em;
		}
		label {
			display: flex;
			flex-direction: column;
			gap: 0.2em;
			span {
				font-size: 0.9em;
				opacity: 0.75;
			}
		}
		input {
			font: inherit;
			padding: 0.4em 0.6em;
			border-radius: 0.4em;
			border: 2px solid var(--2-light);
			min-width: 0;
		}
	}
	.toggle {
		display: flex;
		gap: 0.4em;
		align-items: center;
		align-self: flex-end;
	}
	.previews {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 2em;
		align-items: start;
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6em;
	}
	figcaption {
		font-weight: bold;
		color: var(--2-dark);
	}
	canvas {
		width: 100%;
		max-width: 22rem;
		height: auto;
		border-radius: var(--round);
		box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.2);
		background: var(--2-dark);
		&.loading {
			opacity: 0.4;
		}
	}
	.actions {
		display: flex;
		gap: 0.6em;
		flex-wrap: wrap;
		justify-content: center;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		border: 2px solid var(--1);
		background: var(--1);
		color: white;
		font: inherit;
		font-weight: bold;
		padding: 0.5em 1.1em;
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
	.caption {
		max-width: 40rem;
		margin: 3em auto;
		h2 {
			text-align: center;
		}
		textarea {
			width: 100%;
			font: inherit;
			padding: 1em;
			border-radius: var(--round);
			border: 2px solid var(--2-light);
			margin-bottom: 0.6em;
		}
	}
</style>
