<script>
	/**
	 * Entrada de la puerta con link: lee el token del fragmento (`/puerta#<token>`), lo saca de la
	 * dirección (y del historial) y lo manda por POST a `?/entrar`. Si sirve, va a /puerta/<slug>.
	 * Ver +page.server.js.
	 */
	import { onMount } from 'svelte';
	import { deserialize } from '$app/forms';
	import { argDateLog, argTime } from '$lib/utils/dates.js';
	import { dropLinkDoor, forgetAllLinkDoors } from '$lib/admin/doorOffline.js';
	import { formatARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @type {'idle' | 'checking' | 'error'} */
	let state = 'idle';
	let message = '';

	/** @param {string} slug */
	const doorHref = (slug) => `/puerta/${encodeURIComponent(slug)}`;

	/**
	 * Lo que quedó en este celu de una puerta con link que ya no anda: las ventas sin mandar (las
	 * carga une admin; nunca se borran solas, decisión 0035).
	 * @type {ReturnType<typeof forgetAllLinkDoors>}
	 */
	let left = [];

	const store = () => {
		try {
			return window.localStorage;
		} catch {
			return null;
		}
	};

	/** @param {string} slug */
	function dropLeft(slug) {
		if (!confirm('¿Une admin ya cargó estas ventas? Se borran de este celu.')) return;
		dropLinkDoor(store(), slug);
		left = left.filter((l) => l.slug !== slug);
	}

	onMount(async () => {
		// Sin un link vivo: se borra lo guardado de las puertas con link (la lista con nombres y
		// mails, los ingresos marcados, los últimos escaneos), salvo las ventas sin mandar. Nunca lo
		// de la puerta del panel.
		if (!data.current) left = forgetAllLinkDoors(store());
		const token = window.location.hash.slice(1);
		if (!token) return;
		// Que el token no quede en la barra, en el historial ni en una captura de pantalla.
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
				window.location.replace(doorHref(r.data.slug));
				return;
			}
			state = 'error';
			message = r.data?.message ?? 'No se pudo abrir la puerta con este link.';
		} catch {
			state = 'error';
			message = 'No hay conexión: abrí el link de nuevo cuando tengas señal.';
		}
	});
</script>

<svelte:head>
	<title>Puerta · Kinky Vibe</title>
	<meta name="theme-color" content="#16121a" />
</svelte:head>

<main class="entry">
	<h1>Puerta</h1>
	{#if state === 'checking'}
		<p role="status">Abriendo la puerta…</p>
	{:else if state === 'error'}
		<p class="error" role="alert">{message}</p>
	{/if}
	{#if state !== 'checking'}
		{#if data.current}
			<p>
				Este celu tiene abierta la puerta de <strong>{data.current.title}</strong> (el link anda
				hasta el {argDateLog(data.current.expiresAt)}).
			</p>
			<a class="kv-btn" href={doorHref(data.current.slug)}>Abrir la puerta</a>
		{:else if state === 'idle'}
			<p>
				Para hacer la puerta de un evento, abrí el link de puerta completo que te pasó une
				organizadore. Sirve solo para la puerta de ese evento y deja de andar solo.
			</p>
		{/if}
	{/if}
	{#each left as l (l.slug)}
		<div class="left" role="alert">
			<p>
				<strong
					>{l.sales.length + l.failed.length === 1
						? 'Quedó 1 venta sin mandar'
						: `Quedaron ${l.sales.length + l.failed.length} ventas sin mandar`}</strong
				>
				de la puerta con link de «{l.slug}»: mostráselas a une admin para cargarlas.
			</p>
			<ul>
				{#each [...l.sales, ...l.failed] as sale (sale.id)}
					<li>
						{argTime(sale.at)} · <strong>{sale.buyer}</strong> · {sale.quantity} × {sale.type}{sale.total ===
						null
							? ''
							: ` · ${formatARS(sale.total)}`}
					</li>
				{/each}
			</ul>
			<button type="button" class="kv-btn" on:click={() => dropLeft(l.slug)}>
				Ya las cargó une admin: borrarlas
			</button>
		</div>
	{/each}
	<noscript><p class="error">La puerta necesita JavaScript.</p></noscript>
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
	.left {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 2px solid var(--bad);
		border-radius: 0.5rem;
	}
	.left ul {
		margin: 0;
		padding-left: 1.1rem;
	}
</style>
