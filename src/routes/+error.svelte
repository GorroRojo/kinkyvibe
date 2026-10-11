<script>
	import { page } from '$app/stores';
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import logo from './logo.png';
	import { Search } from '@lucide/svelte';
	import SearchLauncher from '$lib/components/SearchLauncher.svelte';
	import { errorDetail } from '$lib/utils/errorPage.js';
	import { searchOpen } from '$lib/utils/stores';

	/**
	 * Copy for each status. Anything not listed falls back to the generic
	 * 4xx or 5xx entry.
	 * @type {Record<string, {emoji: string, title: string, body: string}>}
	 */
	const COPY = {
		401: {
			emoji: '🙈🗝️',
			title: '...vos tenías la llave, ¿no?',
			body: 'Espero que sí.'
		},
		403: {
			emoji: '🔒⛓️',
			title: '¿Y la llave? ¿No la tenés vos?',
			body: 'Al menos de este sitio parece que no.'
		},
		404: {
			emoji: '🪢💨',
			title: 'Esta página se escapó',
			body: 'Ser brat tamer es muy difícil.'
		},
		'4xx': {
			emoji: '🪢',
			title: 'Ese nudo no cerró',
			body: 'Algo del pedido quedó flojo. Revisalo y probá de nuevo, sin apuro.'
		},
		'5xx': {
			emoji: '🪢😵‍💫',
			title: 'Se nos enredaron las cuerdas',
			body: 'Va a llevarme un tiempo desarmar pero decime si necesitás que use las tijeras de seguridad.'
		}
	};

	$: status = $page.status;
	$: copy = COPY[status] ?? (status >= 500 ? COPY['5xx'] : COPY['4xx']);
	// Los mensajes de SvelteKit (en inglés) no se muestran; los 5xx, solo en desarrollo.
	$: detail = errorDetail({ status, message: $page.error?.message, dev });
	$: loginHref = `/login?redirectTo=${encodeURIComponent($page.url.pathname + $page.url.search)}`;

	let canGoBack = false;
	onMount(() => {
		canGoBack = window.history.length > 1;
	});

	/** @param {MouseEvent} e */
	function back(e) {
		if (canGoBack) {
			e.preventDefault();
			window.history.back();
		}
	}
</script>

<svelte:head>
	<title>{copy.title} · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="error-page">
	<a class="logo" href="/" aria-label="Kinky Vibe, ir al inicio">
		<img src={logo} alt="" width="64" height="64" />
	</a>

	<section class="card" aria-labelledby="error-title">
		<div class="emoji" aria-hidden="true">{copy.emoji}</div>
		<p class="status">Error {status}</p>
		<h1 id="error-title">{copy.title}</h1>
		<p class="body">{copy.body}</p>
		{#if detail}
			<p class="detail">{detail}</p>
		{/if}

		<div class="actions">
			{#if status === 401}
				<a class="btn primary" href={loginHref}>Entrar</a>
			{:else if status >= 500}
				<button class="btn primary" type="button" on:click={() => window.location.reload()}>
					Probar de nuevo
				</button>
			{/if}
			<a class="btn" href="/" on:click={back}>Volver</a>
			{#if status === 404}
				<a class="btn" href="/calendario">Ver calendario</a>
				<button class="btn" type="button" on:click={() => searchOpen.set(true)}>
					<Search size="1em" strokeWidth={2.5} aria-hidden="true" />
					Buscar
				</button>
			{:else}
				<a class="btn" href="/">Ir al inicio</a>
			{/if}
		</div>
	</section>
</main>

<SearchLauncher />

<style>
	.error-page {
		min-height: 90vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-m);
		padding: var(--space-m) var(--space-xs);
		font-family: 'Lato', sans-serif;
	}
	.logo img {
		display: block;
		width: 4rem;
		height: auto;
	}
	.card {
		width: 100%;
		max-width: 32rem;
		background: white;
		border-radius: var(--round, 1rem);
		box-shadow: var(--shadow-1);
		border-top: 0.4rem solid var(--1);
		padding: var(--space-m) var(--space-m) var(--space-m);
		text-align: center;
	}
	.emoji {
		font-size: clamp(3rem, 12vw, 4.5rem);
		line-height: 1;
		margin-bottom: 0.75rem;
		font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
	}
	.status {
		margin: 0;
		font-size: var(--step--1, 0.9rem);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--2-dark);
	}
	h1 {
		margin: 0.3em 0 0.4em;
		font-size: var(--step-3, 2rem);
		line-height: 1.15;
		color: #222;
	}
	.body {
		margin: 0 auto;
		max-width: 26rem;
		font-size: var(--step-0, 1.1rem);
		line-height: 1.5;
	}
	.detail {
		margin: 1rem auto 0;
		max-width: 26rem;
		padding: 0.5em 0.8em;
		border-radius: var(--radius-s);
		background: color-mix(in srgb, var(--1-light) 12%, transparent);
		font-size: var(--step--1, 0.95rem);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-xs);
		margin-top: 1.75rem;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3xs);
		min-height: 2.75rem;
		padding: 0.5em 1.3em;
		border-radius: 3em;
		border: 2px solid var(--2);
		background: white;
		color: var(--2-dark);
		font: inherit;
		font-size: var(--step--1, 1rem);
		font-weight: bold;
		text-decoration: none;
		cursor: pointer;
		transition: 150ms;
	}
	.btn:hover {
		background: color-mix(in srgb, var(--2-light) 15%, white);
		color: var(--2-dark);
	}
	.btn.primary {
		background: var(--2);
		color: white;
	}
	.btn.primary:hover {
		background: var(--2-dark);
		color: white;
	}
	.btn:focus-visible {
		outline: 3px solid var(--1);
		outline-offset: 2px;
	}
	@media (max-width: 420px) {
		.card {
			padding-inline: var(--space-s);
		}
		.actions {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
