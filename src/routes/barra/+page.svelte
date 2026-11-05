<script>
	/**
	 * Entrada de la barra con link: lee el token del fragmento (`/barra#<token>`), lo saca de la
	 * dirección (y del historial) y lo manda por POST a `?/entrar`. Si sirve, va a /barra/<slug>.
	 * Como /puerta. Ver +page.server.js.
	 */
	import { onMount } from 'svelte';
	import { deserialize } from '$app/forms';
	import { argDateLog } from '$lib/utils/dates.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @type {'idle' | 'checking' | 'error'} */
	let state = 'idle';
	let message = '';

	/** @param {string} slug */
	const barHref = (slug) => `/barra/${encodeURIComponent(slug)}`;

	onMount(async () => {
		const token = window.location.hash.slice(1);
		if (!token) return;
		// Que el token no quede en la barra de direcciones, en el historial ni en una captura.
		history.replaceState(history.state, '', window.location.pathname);
		state = 'checking';
		try {
			const body = new FormData();
			body.set('token', token);
			const res = await fetch('?/entrar', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
			});
			const r = /** @type {any} */ (deserialize(await res.text()));
			if (r.type === 'success' && r.data?.slug) {
				window.location.replace(barHref(r.data.slug));
				return;
			}
			state = 'error';
			message = r.data?.message ?? 'No se pudo abrir la barra con este link.';
		} catch {
			state = 'error';
			message = 'No hay conexión: abrí el link de nuevo cuando tengas señal.';
		}
	});
</script>

<svelte:head>
	<title>Barra · Kinky Vibe</title>
	<meta name="theme-color" content="#16121a" />
</svelte:head>

<main class="entry">
	<h1>Barra</h1>
	{#if state === 'checking'}
		<p role="status">Abriendo la barra…</p>
	{:else if state === 'error'}
		<p class="error" role="alert">{message}</p>
	{/if}
	{#if state !== 'checking'}
		{#if data.current}
			<p>
				Este celu tiene abierta la barra de <strong>{data.current.title}</strong> (el link anda
				hasta el {argDateLog(data.current.expiresAt)}).
			</p>
			<a class="kv-btn" href={barHref(data.current.slug)}>Abrir la barra</a>
		{:else if state === 'idle'}
			<p>
				Para entregar los extras de un evento, abrí el link de barra completo que te pasó une
				organizadore. Sirve solo para ese evento y deja de andar solo.
			</p>
		{/if}
	{/if}
	<noscript><p class="error">La barra necesita JavaScript.</p></noscript>
</main>

<style>
	.entry {
		max-width: 30rem;
		margin: 0 auto;
		padding: 2rem 16px;
		display: grid;
		gap: var(--space-s, 1rem);
		font-family: 'Lato', sans-serif;
		color: var(--text);
	}
	h1 {
		margin: 0;
		font-size: var(--text-xl, 1.6rem);
	}
	p {
		margin: 0;
		line-height: 1.45;
	}
	.error {
		color: var(--bad);
		font-weight: 700;
	}
	.kv-btn {
		justify-self: start;
	}
</style>
