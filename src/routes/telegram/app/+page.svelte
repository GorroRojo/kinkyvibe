<script>
	/**
	 * La Mini App del calendario (decisión 0034, docs/telegram.md): los próximos eventos públicos
	 * en formato compacto, para abrir adentro de Telegram (también anda en un navegador común).
	 *
	 * - Carga `telegram-web-app.js` como dicen las docs de Telegram (core.telegram.org/bots/webapps):
	 *   los colores salen del tema de Telegram (variables `--tg-theme-*` que pone ese script, con
	 *   los del modo claro como respaldo).
	 * - «Agregar a la pantalla de inicio» (`addToHomeScreen`, Bot API 8.0) solo si Telegram dice
	 *   que se puede y todavía no está.
	 * - Todos los links (el evento, comprar) se abren en el navegador, afuera de Telegram
	 *   (`openLink`): pagar sigue siendo en el sitio, con Mercado Pago.
	 * - Sin login ni datos de nadie: solo lo que `/calendario` le muestra a cualquiera.
	 * - Con `telegram_enriquecido` (docs/telegram.md, «Mensajes enriquecidos y compartir»):
	 *   «📤 Mandar a un chat» en cada evento (el servidor prepara la tarjeta del modo inline con
	 *   `savePreparedInlineMessage` y acá se abre el selector de chats con `shareMessage`, Bot API
	 *   8.0; en apps más viejas, el modo inline en el chat que se elija con `switchInlineQuery`), y
	 *   el evento del link directo (`?startapp=ev-<id>`) queda marcado y a la vista.
	 */
	import { onMount, tick } from 'svelte';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @type {any} */
	let tg = null;
	let canAddHome = false;
	let added = false;
	let canShare = false;
	/** El evento que marca el link directo. @type {string | null} */
	let focus = data.focus ?? null;
	/** Cómo fue cada «Mandar a un chat», por evento. @type {Record<string, 'busy' | 'sent' | 'error'>} */
	let shared = {};

	/** Deja a la vista el evento marcado. */
	async function showFocus() {
		if (!focus) return;
		await tick();
		document.getElementById(`ev-${focus}`)?.scrollIntoView({ block: 'center' });
	}

	onMount(() => {
		tg = /** @type {any} */ (window).Telegram?.WebApp ?? null;
		if (!tg || !tg.initData) {
			// Abierto en un navegador común: los links funcionan como siempre.
			tg = null;
			showFocus();
			return;
		}
		tg.ready();
		tg.expand?.();
		if (!focus) {
			const param = tg.initDataUnsafe?.start_param;
			const found = data.days.flatMap((d) => d.events).find((ev) => ev.start === param);
			focus = found?.slug ?? null;
		}
		showFocus();
		canShare = Boolean(data.share && tg.isVersionAtLeast?.('6.7'));
		if (tg.isVersionAtLeast?.('8.0')) {
			tg.checkHomeScreenStatus?.((/** @type {string} */ status) => {
				canAddHome = status === 'missed' || status === 'unknown';
			});
			tg.onEvent?.('homeScreenAdded', () => {
				added = true;
				canAddHome = false;
			});
		}
	});

	/**
	 * Adentro de Telegram, abrir en el navegador (afuera de la Mini App).
	 *
	 * @param {MouseEvent} event
	 * @param {string} url
	 */
	function open(event, url) {
		if (!tg?.openLink) return;
		event.preventDefault();
		tg.openLink(url);
	}

	function addHome() {
		tg?.addToHomeScreen?.();
	}

	/** @param {string} slug */
	function clearShared(slug) {
		shared = Object.fromEntries(Object.entries(shared).filter(([k]) => k !== slug));
	}

	/**
	 * «Mandar a un chat»: la tarjeta preparada por el servidor y el selector de chats de Telegram;
	 * si no se puede (app vieja, falló), el modo inline del bot en el chat que se elija.
	 *
	 * @param {{ slug: string, title: string }} ev
	 */
	async function share(ev) {
		if (!tg || shared[ev.slug] === 'busy') return;
		shared = { ...shared, [ev.slug]: 'busy' };
		if (tg.isVersionAtLeast?.('8.0') && tg.shareMessage) {
			try {
				const res = await fetch('/telegram/app/compartir', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ initData: tg.initData, slug: ev.slug })
				});
				const body = res.ok ? await res.json() : null;
				if (typeof body?.id === 'string') {
					tg.shareMessage(body.id, (/** @type {boolean} */ sent) => {
						// Si cerró el selector sin mandar, no es un error.
						if (sent) shared = { ...shared, [ev.slug]: 'sent' };
						else clearShared(ev.slug);
					});
					return;
				}
			} catch {
				// Sigue con el modo inline.
			}
		}
		if (tg.switchInlineQuery) {
			clearShared(ev.slug);
			tg.switchInlineQuery(`evento: ${ev.title}`, ['users', 'groups', 'channels']);
			return;
		}
		shared = { ...shared, [ev.slug]: 'error' };
	}
</script>

<svelte:head>
	<title>Calendario · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
	<script src="https://telegram.org/js/telegram-web-app.js?64"></script>
</svelte:head>

<main class="app">
	<header>
		<h1>Calendario</h1>
		<p class="sub">Lo que viene en Kinky Vibe. Para comprar entradas se abre el sitio.</p>
		{#if canAddHome}
			<button type="button" class="home" on:click={addHome}>
				📲 Agregar a la pantalla de inicio
			</button>
		{:else if added}
			<p class="sub">Listo: quedó en tu pantalla de inicio.</p>
		{/if}
	</header>

	{#if data.days.length === 0}
		<p class="empty">Por ahora no hay eventos próximos.</p>
	{/if}

	{#each data.days as day (day.day)}
		<section>
			<h2>{day.day}</h2>
			{#each day.events as ev (ev.slug)}
				<article id="ev-{ev.slug}" class:cancelled={ev.cancelled} class:focus={focus === ev.slug}>
					{#if ev.image}
						<img src={ev.image} alt="" loading="lazy" width="72" height="72" />
					{/if}
					<div class="body">
						{#if focus === ev.slug}
							<p class="focus-note">{data.shareTexts.destacado}</p>
						{/if}
						<p class="meta">
							{ev.time}{#if ev.place}&nbsp;· {ev.place}{/if}{#if ev.cancelled}&nbsp;· Cancelado{/if}
						</p>
						<h3>
							<a href={ev.href} on:click={(e) => open(e, ev.href)}>{ev.title}</a>
						</h3>
						{#if ev.ticket && !ev.cancelled}
							{#if ev.ticket.href}
								{@const href = ev.ticket.href}
								<a class="buy" {href} on:click={(e) => open(e, href)}>🎟 {ev.ticket.text} ↗</a>
							{:else}
								<span class="note">🎟 {ev.ticket.text}</span>
							{/if}
						{/if}
						{#if canShare && !ev.cancelled}
							<div class="share-row">
								<button
									type="button"
									class="share"
									disabled={shared[ev.slug] === 'busy'}
									on:click={() => share(ev)}>{data.shareTexts.boton}</button
								>
								{#if shared[ev.slug] === 'sent'}
									<span class="note" role="status">{data.shareTexts.mandado}</span>
								{:else if shared[ev.slug] === 'error'}
									<span class="note" role="status">{data.shareTexts.error}</span>
								{/if}
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</section>
	{/each}

	<footer>
		<a href="/calendario" on:click={(e) => open(e, new URL('/calendario', location.href).href)}>
			Ver el calendario completo en el sitio ↗
		</a>
	</footer>
</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		background: var(--tg-theme-bg-color, #ffffff);
	}
	.app {
		--bg: var(--tg-theme-bg-color, #ffffff);
		--text: var(--tg-theme-text-color, #1a1a1a);
		--hint: var(--tg-theme-hint-color, #6b6b6b);
		--link: var(--tg-theme-link-color, #b0156f);
		--button: var(--tg-theme-button-color, #d61f8a);
		--button-text: var(--tg-theme-button-text-color, #ffffff);
		--card: var(--tg-theme-secondary-bg-color, #f4f1f3);
		--section: var(--tg-theme-section-header-text-color, var(--hint));
		background: var(--bg);
		color: var(--text);
		font:
			15px/1.4 -apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		max-width: 640px;
		margin: 0 auto;
		padding: 12px 16px 32px;
		box-sizing: border-box;
	}
	header h1 {
		font-size: 1.4em;
		margin: 4px 0 2px;
	}
	.sub,
	.empty {
		color: var(--hint);
		margin: 0 0 8px;
	}
	.home {
		margin: 6px 0 4px;
		width: 100%;
		padding: 10px;
		border: 0;
		border-radius: 10px;
		background: var(--button);
		color: var(--button-text);
		font: inherit;
		font-weight: 600;
	}
	h2 {
		color: var(--section);
		font-size: 0.85em;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 18px 0 6px;
	}
	article {
		display: flex;
		gap: 10px;
		background: var(--card);
		border-radius: 12px;
		padding: 10px;
		margin-bottom: 8px;
	}
	article.cancelled {
		opacity: 0.6;
	}
	article.focus {
		outline: 2px solid var(--button);
		scroll-margin: 16px;
	}
	.focus-note {
		color: var(--button);
		font-size: 0.85em;
		font-weight: 600;
		margin: 0 0 2px;
	}
	.share-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}
	.share {
		border: 1px solid var(--button);
		border-radius: 8px;
		background: transparent;
		color: var(--button);
		padding: 4px 10px;
		font: inherit;
		font-size: 0.9em;
		font-weight: 600;
	}
	.share:disabled {
		opacity: 0.6;
	}
	img {
		width: 72px;
		height: 72px;
		object-fit: cover;
		border-radius: 8px;
		flex: none;
	}
	.body {
		min-width: 0;
	}
	.meta {
		color: var(--hint);
		font-size: 0.88em;
		margin: 0;
	}
	h3 {
		font-size: 1em;
		margin: 2px 0 6px;
		overflow-wrap: anywhere;
	}
	h3 a {
		color: var(--text);
		text-decoration: none;
	}
	.buy {
		display: inline-block;
		background: var(--button);
		color: var(--button-text);
		border-radius: 8px;
		padding: 4px 10px;
		font-size: 0.9em;
		font-weight: 600;
		text-decoration: none;
	}
	.note {
		color: var(--hint);
		font-size: 0.9em;
	}
	footer {
		margin-top: 20px;
		text-align: center;
	}
	footer a {
		color: var(--link);
	}
</style>
