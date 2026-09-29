<script>
	// Prototipo: generador de imágenes para compartir un evento en Instagram.
	// Ruta pública pero sin links y con noindex; debería moverse a /admin cuando exista.
	import { onMount } from 'svelte';
	import { Download, Share2, Copy, Check } from 'lucide-svelte';
	import logoURL from '../../../../logo.png';
	import {
		FORMATS,
		LAYOUTS,
		renderShareImage,
		loadImage,
		loadFonts,
		canvasToBlob,
		buildCaption,
		eventInfo
	} from '$lib/utils/shareImage.js';
	export let data;

	const info = eventInfo(data.meta);
	/** @type {keyof typeof LAYOUTS} */
	let layout = data.meta.featured ? 'arriba' : 'texto';
	let showStatus = true;
	let ready = false;
	let canShareFiles = false;
	/** @type {HTMLImageElement|null} */
	let image = null;
	/** @type {HTMLImageElement|null} */
	let logo = null;
	/** @type {Record<string, HTMLCanvasElement>} */
	let canvases = {};
	let caption = buildCaption(data.meta);
	let copied = false;
	/** @type {string} */
	let message = '';

	onMount(async () => {
		[image, logo] = await Promise.all([
			loadImage(data.meta.featured ? data.meta.featured + '' : undefined),
			loadImage(logoURL),
			loadFonts()
		]);
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

	$: if (ready) draw(layout, showStatus);

	/** @param {string} layout @param {boolean} showStatus */
	function draw(layout, showStatus) {
		for (const format of Object.keys(FORMATS)) {
			if (!canvases[format]) continue;
			// Casts in their own statements: Svelte 5 drops the key of a `key: /** cast */ (value)`
			// object property when it rewrites this block, which breaks the build.
			const formatKey = /** @type {keyof typeof FORMATS} */ (format);
			const layoutKey = /** @type {keyof typeof LAYOUTS} */ (layout);
			renderShareImage(canvases[format], {
				meta: data.meta,
				format: formatKey,
				layout: layoutKey,
				image,
				logo,
				showStatus
			});
		}
	}

	/** @param {string} format */
	const fileName = (format) => `${data.meta.postID}-${format}-${layout}.png`;

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
	<link
		href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<article class="compartir">
	<h1>Imágenes para compartir</h1>
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
				<label class:selected={layout == id}>
					<input type="radio" bind:group={layout} value={id} name="layout" />
					{label}
				</label>
			{/each}
		</fieldset>
		{#if data.meta.status}
			<label class="toggle">
				<input type="checkbox" bind:checked={showStatus} />
				Mostrar estado ({data.meta.status})
			</label>
		{/if}
		{#if !data.meta.featured || (ready && !image)}
			<p class="note">Este evento no tiene imagen destacada: se usa el diseño de solo texto.</p>
		{/if}
	</div>

	<div class="previews" aria-busy={!ready}>
		{#each Object.entries(FORMATS) as [format, f]}
			<figure>
				<figcaption>{f.label} · {f.w}×{f.h}</figcaption>
				<canvas
					bind:this={canvases[format]}
					width={f.w}
					height={f.h}
					data-format={format}
					class:loading={!ready}
				/>
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
			input {
				position: absolute;
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
	.toggle {
		display: flex;
		gap: 0.4em;
		align-items: center;
		align-self: flex-end;
	}
	.previews {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
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
		max-width: 26rem;
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
