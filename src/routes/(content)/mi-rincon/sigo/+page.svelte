<script>
	import { enhance } from '$app/forms';
	import FollowAdd from '$lib/components/sigo/FollowAdd.svelte';
	import FollowOptions from '$lib/components/sigo/FollowOptions.svelte';
	import CalendarSubscribe from '$lib/components/series/CalendarSubscribe.svelte';
	import { TIMEZONE } from '$lib/utils/dates.js';
	import TelegramCard from '$lib/components/sigo/TelegramCard.svelte';
	import { editionDateLabel } from '$lib/utils/series.js';
	import { followEmoji, groupFollows, notifyChannels } from '$lib/utils/sigo.js';

	export let data;
	export let form;

	/** @type {string | null} la fila que se está guardando */
	let busy = null;

	/** @param {string} id */
	const submit = (id) => {
		/** @type {import('@sveltejs/kit').SubmitFunction} */
		const fn = () => {
			busy = id;
			return async ({ update }) => {
				await update({ reset: false });
				busy = null;
			};
		};
		return fn;
	};

	/** Casilla tocada: guarda en el momento (sin JavaScript, con el botón «Guardar»). */
	/** @param {Event} e */
	const autoSave = (e) => /** @type {HTMLInputElement} */ (e.currentTarget).form?.requestSubmit();

	/** @param {{ kind: string, key: string }} f */
	const rowId = (f) => `${f.kind}:${f.key}`;

	/** @param {number | null} d */
	const fmtDate = (d) =>
		d == null
			? ''
			: new Date(d).toLocaleDateString('es-AR', {
					timeZone: TIMEZONE,
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				});

	// El link recién creado (se muestra una sola vez) o el aviso de que se revocó.
	$: newUrl = form?.action === 'link' && form.url ? String(form.url) : '';
	$: revoked = form?.action === 'revocarLink' && form.ok;
	$: hasLink = Boolean(data.feed || newUrl) && !revoked;

	$: groups = groupFollows(data.follows);
	$: taken = new Set(data.follows.map(rowId));
	// Las columnas de la grilla: Telegram prendida solo con el chat vinculado (data.telegram).
	$: channels = notifyChannels(data.telegram);
	// La nota de lo que viene (Telegram), si hay alguna columna apagada.
	$: soon = channels.find((c) => !c.enabled && c.note);
</script>

<svelte:head>
	<title>Lo que sigo - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p><a href="/mi-rincon">← Mi rincón</a></p>
	<h1>Lo que sigo</h1>
	<p class="hint">
		Etiquetas, series, perfiles y lugares que seguís. Por cada uno elegís si sus eventos van a tu
		calendario, si te avisamos cuando se anuncia algo nuevo y si te recordamos el día antes. Lo que
		seguís es privado: no lo ve nadie más.
	</p>
	<p class="hint">
		Más abajo, <a href="#calendario">tu calendario</a>: lo que seguís, tus entradas y donde
		participás, todo junto para sumar a tu app de calendario.
	</p>

	{#if form?.error && form.action !== 'seguir'}
		<p class="error" role="alert">{form.error}</p>
	{:else if form?.ok && form.action === 'dejar'}
		<p class="ok" role="status">Listo: dejaste de seguirlo.</p>
	{/if}

	<section class="surface-card" aria-label="Agregar">
		<FollowAdd
			tags={data.add.tags}
			profiles={data.add.profiles}
			{taken}
			result={form?.action === 'seguir' ? form : null}
		/>
	</section>

	{#if data.follows.length === 0}
		<section class="surface-card empty" aria-labelledby="sigo-title">
			<span class="empty-icon" aria-hidden="true">🔔</span>
			<h2 id="sigo-title">Todavía no seguís nada</h2>
			<p>
				Seguí lo que te interesa y te avisamos cuando se anuncie algo nuevo, con sus eventos en tu
				calendario. Buscalo arriba, o tocá «Seguir» en la página de una etiqueta o una serie (en la <a
					href="/wiki">Kinkipedia</a
				>), de une <a href="/amigues">amigue</a> o de un lugar.
			</p>
		</section>
	{:else}
		<div class="head">
			<h2 id="sigo-title">Lo que seguís</h2>
			<a class="pill-btn ghost small" href="/mi-rincon/sigo/sigo.csv" download data-sveltekit-reload
				>Bajar CSV</a
			>
		</div>
		{#if soon}
			<p class="hint soon" id="sigo-proximamente">
				<span aria-hidden="true">✈️</span>
				{soon.note}
			</p>
		{/if}

		{#each groups as g (g.id)}
			<section class="group" aria-labelledby="grupo-{g.id}">
				<h3 id="grupo-{g.id}">
					{g.title} <span class="count">{g.items.length}</span>
				</h3>
				<ul class="follows">
					{#each g.items as f (rowId(f))}
						<li
							class="surface-card follow"
							class:gone={!f.available}
							style:--tag-color={f.color || null}
						>
							<div class="top">
								<span class="badge" class:photo={Boolean(f.image)} aria-hidden="true">
									{#if f.image}
										<img src={f.image} alt="" loading="lazy" />
									{:else}
										{f.available ? followEmoji(f) : '❔'}
									{/if}
								</span>
								<div class="who">
									<p class="name">
										{#if f.href}
											<a href={f.href}>{f.name ?? f.title}</a>
										{:else}
											<span>{f.name ?? f.title}</span>
										{/if}
										<span class="kind">{f.series ? 'Serie' : f.label}</span>
									</p>
									{#if f.next}
										<p class="next">
											Próximo: <a href={f.next.href}>{f.next.title}</a>
											<span class="date">· {editionDateLabel(f.next.start)}</span>
										</p>
									{:else if f.available}
										<p class="next quiet">Sin eventos anunciados por ahora.</p>
									{:else}
										<p class="next quiet">Ya no existe o no se puede ver.</p>
									{/if}
								</div>
							</div>

							{#if f.available}
								<form
									method="POST"
									action="?/opciones"
									use:enhance={submit(rowId(f))}
									aria-label="Qué querés de {f.name ?? f.title}"
								>
									<input type="hidden" name="tipo" value={f.kind} />
									<input type="hidden" name="clave" value={f.key} />
									<FollowOptions
										options={f.options}
										name={f.name ?? f.title}
										disabled={busy === rowId(f)}
										{channels}
										noteId={soon ? 'sigo-proximamente' : undefined}
										on:change={autoSave}
									/>
									<noscript
										><button class="pill-btn ghost small" type="submit">Guardar</button></noscript
									>
								</form>
							{/if}
							<form method="POST" action="?/dejar" use:enhance={submit(rowId(f))} class="leave">
								<input type="hidden" name="tipo" value={f.kind} />
								<input type="hidden" name="clave" value={f.key} />
								<button class="link-btn" type="submit" disabled={busy === rowId(f)}
									>Dejar de seguir</button
								>
							</form>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}

	{#if data.telegram}
		<TelegramCard telegram={data.telegram} />
	{/if}

	<section class="surface-card" id="calendario" aria-labelledby="cal-title">
		<h2 id="cal-title"><span aria-hidden="true">📅</span> Tu calendario</h2>
		<p class="hint">
			Un solo calendario con todo lo tuyo, para sumar una vez a Google Calendar o a la app de
			calendario de tu celu o tu compu. Se actualiza solo (algunas apps tardan hasta un día en traer
			los cambios). Junta:
		</p>
		<ul class="what">
			<li>lo que seguís con «En mi calendario» (arriba, en cada cosa que seguís);</li>
			<li>tus entradas, también las de eventos no listados;</li>
			<li>los eventos donde participás, con un perfil que manejás.</li>
		</ul>
		<form method="POST" action="?/calendario" use:enhance={submit('calendario')} class="options">
			<label>
				<input
					type="checkbox"
					name="entradas"
					checked={data.calendar.entradas}
					disabled={busy === 'calendario'}
					on:change={autoSave}
				/>
				Mis entradas
			</label>
			<label>
				<input
					type="checkbox"
					name="participo"
					checked={data.calendar.participo}
					disabled={busy === 'calendario'}
					on:change={autoSave}
				/>
				Los eventos donde participo (con un perfil que manejás)
			</label>
			<noscript><button class="pill-btn ghost small" type="submit">Guardar</button></noscript>
		</form>

		{#if data.seriesOn}
			<h3 id="cal-link-title">Tu link para suscribirte</h3>
			<p class="hint">
				El link es secreto: cualquiera que lo tenga ve tu calendario. Si lo compartiste sin querer,
				generá uno nuevo y el anterior deja de andar.
			</p>
			{#if newUrl}
				<p class="ok" role="status">
					Este es tu link. Guardalo ahora: no lo vamos a mostrar de nuevo.
				</p>
				<code class="feed-link">{newUrl}</code>
				<CalendarSubscribe url={newUrl} label="tu calendario" />
			{:else if revoked}
				<p class="ok" role="status">Listo: el link dejó de andar.</p>
			{/if}
			{#if data.feed && !newUrl && !revoked}
				<p>
					Tenés un link activo desde el {fmtDate(data.feed.createdAt)}{data.feed.lastUsedAt
						? `; tu calendario lo usó por última vez el ${fmtDate(data.feed.lastUsedAt)}`
						: ''}.
				</p>
			{/if}
			<div class="row">
				<form method="POST" action="?/crearLink" use:enhance={submit('link')}>
					<button class="pill-btn" type="submit" disabled={busy === 'link'}
						>{hasLink ? 'Generar un link nuevo' : 'Crear mi link'}</button
					>
				</form>
				{#if hasLink}
					<form method="POST" action="?/revocarLink" use:enhance={submit('link')}>
						<button class="pill-btn ghost" type="submit" disabled={busy === 'link'}
							>Revocar el link</button
						>
					</form>
				{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		width: min(40rem, 100%);
		margin: 1.5em auto;
		padding-inline: 16px;
		box-sizing: border-box;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
	}
	h2 {
		margin: 0;
		font-size: var(--step-1);
	}
	h3 {
		margin: 0;
		font-size: var(--step-0);
		display: flex;
		align-items: center;
		gap: 0.5em;
	}
	section {
		display: grid;
		gap: 0.7em;
	}
	p {
		margin: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5em;
		margin-top: 0.5em;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.soon {
		background: var(--2-tint);
		color: var(--2-dark);
		border-radius: var(--round-sm);
		padding: 0.5em 0.8em;
	}
	.ok {
		color: var(--3-ink);
		font-weight: 600;
	}
	.error {
		color: var(--1-ink);
		font-weight: 600;
	}
	.count {
		font-size: var(--step--1);
		font-weight: 600;
		color: var(--muted);
		background: var(--surface);
		border-radius: var(--round-pill);
		padding: 0 0.6em;
	}

	/* sin nada seguido */
	.empty {
		justify-items: center;
		text-align: center;
		padding-block: 1.6rem;
	}
	.empty-icon {
		font-size: 2.4rem;
		line-height: 1;
	}
	.empty p {
		max-width: 30em;
	}

	/* cada cosa seguida */
	.follows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.8em;
	}
	.follow {
		--accent: var(--tag-color, var(--1));
		display: grid;
		gap: 0.5em;
		border-inline-start: 0.35rem solid var(--accent);
		padding-inline-start: 0.95rem;
	}
	.gone {
		--accent: var(--line);
		color: var(--muted);
	}
	.top {
		display: flex;
		align-items: flex-start;
		gap: 0.75em;
	}
	.badge {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.8rem;
		height: 2.8rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--accent) 16%, var(--surface));
		font-size: 1.45rem;
		line-height: 1;
		overflow: hidden;
	}
	.badge.photo {
		border-radius: var(--round-sm);
	}
	.badge img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.who {
		display: grid;
		gap: 0.15em;
		min-width: 0;
	}
	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2em 0.5em;
		font-weight: 700;
		font-size: var(--step-0);
		overflow-wrap: anywhere;
	}
	.name a {
		color: inherit;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 0.18em;
	}
	.kind {
		font-size: var(--step--2);
		font-weight: 600;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: var(--round-pill);
		padding: 0 0.5em;
	}
	.next {
		font-size: var(--step--1);
		overflow-wrap: anywhere;
	}
	.date {
		color: var(--muted);
		white-space: nowrap;
	}
	.quiet {
		color: var(--muted);
	}
	.leave {
		justify-self: end;
	}
	.link-btn {
		border: 0;
		background: none;
		padding: 0.3em 0;
		min-height: 2.2rem;
		font: inherit;
		font-size: var(--step--1);
		color: var(--muted);
		text-decoration: underline;
		cursor: pointer;
	}
	.link-btn:hover {
		color: var(--1-ink);
	}
	.link-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.what {
		margin: 0;
		padding-inline-start: 1.2em;
		font-size: var(--step--1);
		display: grid;
		gap: 0.15em;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6em;
	}
	.feed-link {
		display: block;
		padding: 0.6em;
		background: var(--hover);
		border-radius: var(--round-sm);
		overflow-wrap: anywhere;
		font-size: var(--step--1);
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3em 1em;
	}
	.options label {
		display: flex;
		align-items: center;
		gap: 0.35em;
		min-height: var(--tap);
	}
	.small {
		font-size: var(--step--1);
		min-height: 2.2rem;
		justify-self: start;
	}
</style>
