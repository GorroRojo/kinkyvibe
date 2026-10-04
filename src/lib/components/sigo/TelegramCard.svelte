<script>
	/**
	 * La tarjeta «Telegram» de Mi rincón → Lo que sigo (fase 2 del bot, docs/telegram.md):
	 * conectar la cuenta con el bot (un código de un solo uso, que se le manda con `/vincular`),
	 * ver si está conectada y desconectarla. Los formularios van a /mi-rincon/telegram; con
	 * JavaScript la respuesta se muestra acá mismo, sin salir de la página.
	 *
	 * Props: `telegram` (TelegramCardData de $lib/server/telegram/web.js), `result` (lo que
	 * devolvió la acción, sin JavaScript), `base` (adónde van los formularios).
	 */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	/** @type {import('$lib/server/telegram/web.js').TelegramCardData} */
	export let telegram;
	/** @type {Record<string, any> | null} */
	export let result = null;
	export let base = '/mi-rincon/telegram';

	/** @type {{ code: string, expiresAt: number } | null} */
	let pending = null;
	let error = '';
	let busy = false;

	$: if (result?.action === 'codigo' && result.ok) {
		pending = { code: String(result.code), expiresAt: Number(result.expiresAt) };
	}
	$: if (result?.error) error = String(result.error);
	// Ya conectada: el código no hace falta más.
	$: if (telegram.linked) pending = null;

	/** "21:15", en hora de Argentina. @param {number} ms */
	const hourOf = (ms) =>
		new Intl.DateTimeFormat('es-AR', {
			timeZone: 'America/Argentina/Buenos_Aires',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).format(new Date(ms));

	/** "3 de octubre de 2026". @param {number} ms */
	const dayOf = (ms) =>
		new Intl.DateTimeFormat('es-AR', {
			timeZone: 'America/Argentina/Buenos_Aires',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(new Date(ms));

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		error = '';
		return async ({ result: r }) => {
			busy = false;
			if (r.type === 'success' && r.data?.action === 'codigo') {
				pending = { code: String(r.data.code), expiresAt: Number(r.data.expiresAt) };
			} else if (r.type === 'success') {
				pending = null;
				await invalidateAll();
			} else if (r.type === 'failure') {
				error = String(r.data?.error ?? 'No se pudo. Probá de nuevo.');
			} else if (r.type === 'redirect') {
				location.href = r.location;
			} else {
				error = 'Algo salió mal. Probá de nuevo en un rato.';
			}
		};
	};

	$: startLink =
		pending && telegram.botUsername
			? `https://t.me/${telegram.botUsername}?start=${pending.code.replace('-', '')}`
			: null;
</script>

<section class="surface-card telegram" aria-labelledby="telegram-title">
	<h2 id="telegram-title"><span aria-hidden="true">✈️</span> Telegram</h2>

	{#if telegram.linked}
		<p class="state" data-state="conectado">
			<strong>Conectado</strong>{#if telegram.linkedAt}&nbsp;desde el {dayOf(
					telegram.linkedAt
				)}{/if}. Elegí arriba, en cada cosa que seguís, qué avisos querés por Telegram.
		</p>
		{#if telegram.muted}
			<p class="note" data-state="silenciado">
				Pausaste los avisos con <code>/silenciar</code>. Para volver a recibirlos, mandale
				<code>/reanudar</code> al bot.
			</p>
		{/if}
		<p class="hint">
			No mandamos avisos entre las 23 y las 9: los que caen a la noche te llegan a la mañana.
		</p>
		<form method="POST" action="{base}?/desconectar" use:enhance={submit}>
			<button class="link-btn" type="submit" disabled={busy}>Desconectar Telegram</button>
		</form>
	{:else if pending}
		<p>Ahora mandale este código al bot de Kinky Vibe por chat privado:</p>
		<p class="code" aria-label="Tu código">
			<code>/vincular {pending.code}</code>
		</p>
		{#if startLink}
			<p><a class="pill-btn small" href={startLink} rel="noopener">Abrir el bot en Telegram</a></p>
		{/if}
		<p class="hint">
			Sirve una sola vez y vence a las {hourOf(pending.expiresAt)}. En grupos el bot no conecta
			cuentas.
		</p>
		<p>
			<a
				class="pill-btn ghost small"
				href="/mi-rincon/sigo"
				on:click|preventDefault={() => invalidateAll()}>Ya lo mandé</a
			>
		</p>
	{:else}
		<p class="state" data-state="sin-conectar">
			Conectá tu cuenta con el bot de Kinky Vibe para recibir por Telegram los avisos de lo que
			seguís (algo nuevo y recordatorios): título, fecha y link, nada más.
		</p>
		<form method="POST" action="{base}?/codigo" use:enhance={submit}>
			<button class="pill-btn small" type="submit" disabled={busy}>Conectar Telegram</button>
		</form>
	{/if}

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</section>

<style>
	.telegram {
		display: grid;
		gap: 0.7em;
	}
	h2 {
		margin: 0;
		font-size: var(--step-1);
	}
	p {
		margin: 0;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.note {
		background: var(--2-tint);
		color: var(--2-dark);
		border-radius: var(--round-sm);
		padding: 0.5em 0.8em;
		font-size: var(--step--1);
	}
	.code code {
		display: inline-block;
		font-size: var(--step-1);
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.3em 0.6em;
		border-radius: var(--round-sm);
		background: var(--surface);
		border: 1px solid var(--line);
		user-select: all;
		overflow-wrap: anywhere;
	}
	.error {
		color: var(--1-ink);
		font-weight: 700;
	}
	.small {
		font-size: var(--step--1);
		min-height: 2.2rem;
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
</style>
