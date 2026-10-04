<script>
	/**
	 * Escáner de QR del modo puerta (antes QrScanner.svelte), con la API BarcodeDetector (Chrome
	 * en Android, Edge, Samsung Internet). Linterna y cambio de cámara cuando el celu los tiene.
	 * En navegadores sin soporte (Safari de iPhone) avisa: queda "Escribir código" y "Buscar
	 * persona", o escanear con la cámara del sistema (abre la entrada con "Marcar ingreso").
	 *
	 * Props: `onscan(value)`. Slot: lo que va encima del video, abajo (el resultado).
	 */
	import { createEventDispatcher, onDestroy, onMount, tick as nextTick } from 'svelte';
	import { Camera, CameraOff, Flashlight, FlashlightOff, SwitchCamera } from '@lucide/svelte';

	/** @type {(value: string) => void} */
	export let onscan;

	const dispatch = createEventDispatcher();

	/** @type {HTMLVideoElement | undefined} */
	let video;
	let running = false;
	/** @type {string | null} */
	let problem = null;
	/** `null` hasta montar en el navegador (en el servidor no se sabe). */
	/** @type {boolean | null} */
	let supported = null;
	let torchSupported = false;
	let torchOn = false;
	let canSwitch = false;
	/** @type {'environment' | 'user'} */
	let facing = 'environment';

	/** @type {MediaStream | null} */
	let stream = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let timer = null;
	let last = { value: '', at: 0 };
	/** @type {any} */
	let detector = null;

	onMount(async () => {
		supported = 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
		if (!supported) return;
		// Si ya dio permiso antes, la cámara se prende sola al entrar.
		try {
			const status = await navigator.permissions?.query({ name: /** @type {any} */ ('camera') });
			if (status?.state === 'granted') start();
		} catch {
			// navegador sin Permissions API para la cámara: se prende con el botón
		}
	});

	async function start() {
		problem = null;
		try {
			// @ts-ignore BarcodeDetector todavía no está en los tipos de TypeScript.
			detector ??= new window.BarcodeDetector({ formats: ['qr_code'] });
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: facing },
				audio: false
			});
			running = true;
			dispatch('running', true);
			// Esperamos a que Svelte muestre el <video>.
			await nextTick();
			if (!video) return;
			video.srcObject = stream;
			await video.play();
			const track = stream.getVideoTracks()[0];
			const caps = /** @type {any} */ (track?.getCapabilities?.() ?? {});
			torchSupported = Boolean(caps.torch);
			torchOn = false;
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				canSwitch = devices.filter((d) => d.kind === 'videoinput').length > 1;
			} catch {
				canSwitch = false;
			}
			loop();
		} catch (e) {
			stop();
			problem =
				/** @type {Error} */ (e)?.name === 'NotAllowedError'
					? 'No hay permiso para usar la cámara. Habilitalo en el navegador.'
					: 'No se pudo abrir la cámara.';
		}
	}

	function loop() {
		const tick = async () => {
			if (!running || !video) return;
			try {
				const codes = await detector.detect(video);
				const value = codes[0]?.rawValue;
				const now = Date.now();
				// El mismo QR frente a la cámara no se manda de nuevo por 4 segundos.
				if (value && (value !== last.value || now - last.at > 4000)) {
					last = { value, at: now };
					onscan(value);
				}
			} catch {
				// Cuadro sin QR o todavía cargando: seguimos.
			}
			timer = setTimeout(tick, 250);
		};
		tick();
	}

	function stop() {
		running = false;
		dispatch('running', false);
		if (timer) clearTimeout(timer);
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		torchOn = false;
	}

	async function toggleTorch() {
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		try {
			await track.applyConstraints(/** @type {any} */ ({ advanced: [{ torch: !torchOn }] }));
			torchOn = !torchOn;
		} catch {
			torchSupported = false;
		}
	}

	async function switchCamera() {
		facing = facing === 'environment' ? 'user' : 'environment';
		stop();
		await start();
	}

	onDestroy(stop);
</script>

<div class="scanner" class:running>
	{#if running}
		<!-- svelte-ignore a11y-media-has-caption -->
		<video bind:this={video} playsinline muted></video>
		<span class="frame" aria-hidden="true"></span>
	{/if}
	<div class="top">
		<p class="hint">
			{#if supported === false}
				Este navegador no lee QRs: usá "Escribir código" o "Buscar persona".
			{:else if running}
				Apuntá al QR de la entrada
			{:else}
				Cámara apagada
			{/if}
		</p>
		{#if running}
			{#if torchSupported}
				<button
					type="button"
					class="round"
					on:click={toggleTorch}
					aria-pressed={torchOn}
					aria-label={torchOn ? 'Apagar linterna' : 'Prender linterna'}
					title="Linterna"
				>
					{#if torchOn}<FlashlightOff size={22} />{:else}<Flashlight size={22} />{/if}
				</button>
			{/if}
			{#if canSwitch}
				<button
					type="button"
					class="round"
					on:click={switchCamera}
					aria-label="Cambiar de cámara"
					title="Cambiar de cámara"
				>
					<SwitchCamera size={22} />
				</button>
			{/if}
			<button
				type="button"
				class="round"
				on:click={stop}
				aria-label="Apagar cámara"
				title="Apagar cámara"
			>
				<CameraOff size={22} />
			</button>
		{/if}
	</div>
	{#if !running && supported}
		<button type="button" class="start" on:click={start}>
			<Camera size={28} /> Abrir cámara
		</button>
	{/if}
	{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
	<div class="overlay"><slot /></div>
</div>

<style>
	.scanner {
		position: relative;
		border-radius: var(--radius-l);
		overflow: hidden;
		background: radial-gradient(circle at 50% 40%, #3a3342, #1c1820 70%);
		min-height: 11rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}
	.scanner.running {
		min-height: min(62vh, 26rem);
	}
	video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: #000;
	}
	.frame {
		position: absolute;
		left: 50%;
		top: 42%;
		width: min(56%, 15rem);
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
		--c: rgba(255, 255, 255, 0.9);
		background:
			linear-gradient(var(--c), var(--c)) top left / 2.2rem 4px,
			linear-gradient(var(--c), var(--c)) top left / 4px 2.2rem,
			linear-gradient(var(--c), var(--c)) top right / 2.2rem 4px,
			linear-gradient(var(--c), var(--c)) top right / 4px 2.2rem,
			linear-gradient(var(--c), var(--c)) bottom left / 2.2rem 4px,
			linear-gradient(var(--c), var(--c)) bottom left / 4px 2.2rem,
			linear-gradient(var(--c), var(--c)) bottom right / 2.2rem 4px,
			linear-gradient(var(--c), var(--c)) bottom right / 4px 2.2rem;
		background-repeat: no-repeat;
		border-radius: var(--radius-s);
		pointer-events: none;
	}
	.top {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-xs) var(--space-xs) 0 var(--space-xs);
	}
	.hint {
		margin: 0;
		flex: 1;
		color: rgba(255, 255, 255, 0.85);
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
		font-size: var(--text-sm);
	}
	.round {
		width: 2.9rem;
		height: 2.9rem;
		border-radius: 50%;
		border: 0;
		display: grid;
		place-items: center;
		background: rgba(20, 16, 24, 0.7);
		color: #fff;
		cursor: pointer;
	}
	.round[aria-pressed='true'] {
		background: var(--4, #ffd600);
		color: #2a2200;
	}
	.start {
		position: relative;
		align-self: center;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2xs);
		margin: 1rem;
		padding: var(--space-xs) var(--space-m);
		border: 0;
		border-radius: 2em;
		background: var(--accent, hsl(319, 90%, 60%));
		color: #fff;
		font-weight: 700;
		font-size: var(--text-base);
		cursor: pointer;
	}
	.problem {
		position: relative;
		margin: 0 1rem 1rem;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--bad-bg);
		color: var(--bad);
	}
	.overlay {
		position: relative;
		margin-top: auto;
	}
	.overlay:empty {
		display: none;
	}
</style>
