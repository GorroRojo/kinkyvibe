<script>
	/**
	 * Página a la que lleva un link de un mail (confirmar un aviso, darse de baja). El link solo
	 * muestra la página; la acción se hace con el botón (POST), así los antivirus del correo que
	 * abren los links solos no confirman ni dan de baja a nadie.
	 * Props: `title`, `text` (qué va a pasar), `button`, `done` (mensaje si salió bien, o ''),
	 * `error` (o ''), `valid` (false: el link no sirve; muestra `error` y no el botón), `auto`
	 * (true: en un navegador de verdad, el formulario se manda solo una vez al abrir la página; el
	 * botón queda por si no hay JavaScript. Los antivirus casi nunca corren JavaScript y el GET
	 * nunca hace nada en el servidor. Solo para confirmar: salir o darse de baja siguen pidiendo
	 * el botón, gorrite 12/10).
	 *
	 * El POST es un formulario común (sin `use:enhance`): las páginas que lo usan van con
	 * `Referrer-Policy: same-origin`, nunca `no-referrer` (con no-referrer el navegador manda
	 * `Origin: null` y SvelteKit lo rechaza como «cross-site»).
	 */
	import { onMount } from 'svelte';

	/** @type {string} */
	export let title;
	export let text = '';
	export let button = 'Confirmar';
	export let done = '';
	export let error = '';
	export let valid = true;
	export let auto = false;

	/** @type {HTMLFormElement | undefined} */
	let formEl;
	/** Ya se mandó: un segundo toque (o el envío automático y un toque) no manda otro POST. */
	let sending = false;

	/** @param {SubmitEvent} event */
	function guard(event) {
		if (sending) event.preventDefault();
		else sending = true;
	}

	onMount(() => {
		// Volver con «Atrás» puede traer la página congelada con el botón apagado.
		/** @param {PageTransitionEvent} e */
		const reset = (e) => {
			if (e.persisted) sending = false;
		};
		window.addEventListener('pageshow', reset);
		if (auto && valid && !done && !error && formEl && firstTime()) formEl.requestSubmit();
		return () => window.removeEventListener('pageshow', reset);
	});

	/** Una sola vez por pestaña y link: si vuelve a la página, que toque el botón. */
	function firstTime() {
		const key = `mail-link:${location.pathname}`;
		try {
			if (sessionStorage.getItem(key)) return false;
			sessionStorage.setItem(key, '1');
		} catch {
			// Sin sessionStorage (modo privado estricto): se manda igual, el servidor no confirma dos veces.
		}
		return true;
	}
</script>

<svelte:head>
	<title>{title} · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="mail-link surface-card" aria-labelledby="mail-link-title">
	<h1 id="mail-link-title">{title}</h1>
	{#if done}
		<p class="ok" role="status">{done}</p>
		<a class="pill-btn ghost" href="/calendario">Ver el calendario</a>
	{:else}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if valid}
			{#if text}<p>{text}</p>{/if}
			<form method="POST" bind:this={formEl} on:submit={guard}>
				<button class="pill-btn" type="submit" disabled={sending} aria-busy={sending}
					>{sending ? 'Un momento…' : button}</button
				>
			</form>
		{/if}
	{/if}
</section>

<style>
	.mail-link {
		display: grid;
		gap: 0.9em;
		width: min(28rem, 100%);
		margin: 2em auto;
		border-top: 0.35rem solid var(--2);
		justify-items: start;
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
	}
	p {
		margin: 0;
	}
	.ok {
		color: var(--3-ink);
		font-weight: 700;
	}
	.error {
		color: var(--1-ink);
		font-weight: 700;
	}
</style>
