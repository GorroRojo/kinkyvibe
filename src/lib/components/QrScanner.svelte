<script>
	import { onDestroy, onMount, tick as nextTick } from 'svelte';

	/**
	 * Escáner de QR con la cámara usando la API BarcodeDetector (Chrome/Android, Edge, Samsung
	 * Internet). En navegadores sin soporte (p. ej. Safari de iPhone) avisa y queda la búsqueda
	 * manual; en iPhone también se puede escanear con la cámara del sistema, que abre la página de
	 * la entrada con el botón "Marcar ingreso" para admins.
	 *
	 * @type {{ onscan: (value: string) => void }}
	 */
	let { onscan } = $props();

	/** @type {HTMLVideoElement | undefined} */
	let video = $state();
	let running = $state(false);
	/** @type {string | null} */
	let problem = $state(null);
	/** `null` hasta montar en el navegador (en el servidor no se sabe). */
	/** @type {boolean | null} */
	let supported = $state(null);
	onMount(() => {
		supported = 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
	});

	/** @type {MediaStream | null} */
	let stream = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let timer = null;
	let last = { value: '', at: 0 };

	async function start() {
		problem = null;
		try {
			// @ts-ignore BarcodeDetector todavía no está en los tipos de TypeScript.
			const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' },
				audio: false
			});
			running = true;
			// Esperamos a que Svelte muestre el <video>.
			await nextTick();
			if (!video) return;
			video.srcObject = stream;
			await video.play();
			const tick = async () => {
				if (!running || !video) return;
				try {
					const codes = await detector.detect(video);
					const value = codes[0]?.rawValue;
					const now = Date.now();
					// El mismo QR frente a la cámara no se manda de nuevo por 4 segundos.
					if (value && (value !== last.value || now - last.at > 4000)) {
						last = { value, at: now };
						navigator.vibrate?.(80);
						onscan(value);
					}
				} catch {
					// Cuadro sin QR o todavía cargando: seguimos.
				}
				timer = setTimeout(tick, 250);
			};
			tick();
		} catch (e) {
			stop();
			problem =
				/** @type {Error} */ (e)?.name === 'NotAllowedError'
					? 'No hay permiso para usar la cámara. Habilitalo en el navegador.'
					: 'No se pudo abrir la cámara.';
		}
	}

	function stop() {
		running = false;
		if (timer) clearTimeout(timer);
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
	}

	onDestroy(stop);
</script>

<div class="scanner">
	{#if supported === null}
		<!-- Todavía no sabemos si el navegador soporta el escáner. -->
	{:else if !supported}
		<p class="note">
			Este navegador no puede leer QRs desde la página. Usá la búsqueda manual, o escaneá con la
			cámara del celu: se abre la entrada con el botón "Marcar ingreso".
		</p>
	{:else if running}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} playsinline muted></video>
		<button type="button" class="secondary" onclick={stop}>Apagar cámara</button>
	{:else}
		<button type="button" onclick={start}>📷 Escanear QR</button>
	{/if}
	{#if problem}<p class="note" role="alert">{problem}</p>{/if}
</div>

<style>
	.scanner {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
	}
	video {
		width: 100%;
		max-height: 60vh;
		object-fit: cover;
		border-radius: 1em;
		background: black;
	}
	button {
		font: inherit;
		font-weight: bold;
		font-size: var(--step-1);
		min-height: 3.5em;
		border: 0;
		border-radius: 0.8em;
		background: var(--2);
		color: white;
		cursor: pointer;
	}
	button.secondary {
		background: #555;
		font-size: var(--step-0);
		min-height: 2.8em;
	}
	.note {
		background: var(--4-light);
		padding: 0.6em;
		border-radius: 0.6em;
		margin: 0;
	}
</style>
