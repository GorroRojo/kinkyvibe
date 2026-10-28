<script>
	import '$lib/admin/panel-forms.scss';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { areaBackLink } from '$lib/admin/nav.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import { enhance } from '$app/forms';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { brokenImage } from '$lib/admin/brokenImage.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { argTime } from '$lib/utils/dates.js';
	import { Send } from '@lucide/svelte';

	export let data;
	export let form;

	let busy = false;

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	/** «Desvincular» Telegram: pregunta antes, como las otras acciones que sacan algo. */
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submitUnlink = async (input) => {
		const ok = await askConfirm({
			title: '¿Desvincular tu Telegram?',
			text: 'El bot deja de reconocerte como admin (la puerta y el estado de la venta). Lo podés volver a vincular desde acá.',
			confirmLabel: 'Desvincular',
			tone: 'danger'
		});
		if (!ok) return input.cancel();
		return submit(input);
	};

	// El link recién creado (solo hasta que se vincula o se recarga la página).
	$: pending = form?.telegramLink && !data.telegram.linkedAt ? form : null;

	/** @type {Record<number, boolean>} */
	let failed = {};

	/** @param {number} id */
	const markFailed = (id) => () => (failed = { ...failed, [id]: true });
</script>

<PageHeader
	back={areaBackLink('ajustes-admins')}
	title="Admins"
	subtitle="Quién puede entrar al panel."
/>
<div class="kv-stack settings">
	<Card padded={false}>
		<ul class="admins">
			{#each data.admins as a (a.id)}
				<li>
					{#if failed[a.id] || !a.avatar}
						<span class="avatar initial" aria-hidden="true"
							>{a.login.slice(0, 1).toUpperCase()}</span
						>
					{:else}
						<img
							class="avatar"
							src={a.avatar}
							alt=""
							width="48"
							height="48"
							loading="lazy"
							referrerpolicy="no-referrer"
							use:brokenImage={markFailed(a.id)}
						/>
					{/if}
					<div class="who">
						<a href="https://github.com/{a.login}" target="_blank" rel="noopener noreferrer"
							><b>{a.login}</b></a
						>
						<small class="muted">GitHub · id {a.id}</small>
					</div>
					{#if a.telegram}<Badge tone="ok" icon={Send}>Telegram</Badge>{/if}
					{#if a.me}<Badge tone="info">vos</Badge>{/if}
				</li>
			{/each}
		</ul>
	</Card>
	<Card title="Tu Telegram en el bot">
		{#if form?.telegramMessage}
			<p class="kv-flash ok" role="status">{form.telegramMessage}</p>
		{:else if form?.telegramError}
			<p class="kv-flash bad" role="alert">{form.telegramError}</p>
		{/if}
		{#if data.telegram.linkedAt}
			<p class="tg-state" data-state="vinculado">
				<Badge tone="ok" icon={Send}>Vinculado</Badge>
				desde el {fmtDateTime(data.telegram.linkedAt)}. Con tu Telegram podés usar lo de admins en
				el bot (la puerta y el estado de la venta, según lo que esté prendido) mientras sigas en
				esta lista.
			</p>
			<form method="POST" action="?/desvincularTelegram" use:enhance={submitUnlink}>
				<button class="kv-btn ghost small" type="submit" disabled={busy}>Desvincular</button>
			</form>
		{:else if pending}
			<p>Abrí este link desde el Telegram que vas a usar con el bot y tocá «Iniciar»:</p>
			<p class="tg-link">
				<a class="kv-btn small" href={pending.telegramLink} target="_blank" rel="noopener"
					>Abrir el bot en Telegram</a
				>
			</p>
			{#if pending.telegramQr}
				<figure class="tg-qr">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG armado en el servidor (qr.js) con nuestro link -->
					{@html pending.telegramQr}
					<figcaption class="kv-note">O escaneá el QR con el celular.</figcaption>
				</figure>
			{/if}
			<p class="kv-note">
				Sirve una sola vez y vence a las {argTime(pending.telegramExpiresAt)}. Cuando el bot te
				confirme, recargá esta página.
			</p>
		{:else}
			<p class="tg-state" data-state="sin-vincular">
				Vinculá tu cuenta de Telegram para usar lo de admins desde el bot: la puerta (control de
				ingreso) y el estado de la venta. Solo se guarda el número de tu usuario de Telegram.
			</p>
			{#if data.telegram.blocked}
				<p class="kv-note">{data.telegram.blocked}</p>
			{/if}
			<form method="POST" action="?/vincularTelegram" use:enhance={submit}>
				<button class="kv-btn small" type="submit" disabled={busy || !!data.telegram.blocked}
					>Vincular Telegram</button
				>
			</form>
		{/if}
	</Card>
	<Card title="Conector de Claude">
		{#if form?.claudeMessage}
			<p class="kv-flash ok" role="status">{form.claudeMessage}</p>
		{:else if form?.claudeError}
			<p class="kv-flash bad" role="alert">{form.claudeError}</p>
		{/if}
		{#if data.claude.on}
			<p class="tg-state">
				Para que Claude lea el sitio (solo lectura), en claude.ai: Personalizar → Conectores →
				«Agregar conector personalizado», con esta dirección:
			</p>
			<p><code class="claude-url">{data.claude.url}</code></p>
			<p class="kv-note">
				Al conectar, el sitio te pide permiso con tu cuenta. Cada pedido de Claude queda en
				Actividad a tu nombre. Cómo se usa: <code>docs/conector-claude.md</code>.
			</p>
		{:else}
			<p class="tg-state">
				Está apagado (Ajustes → Interruptores → «Conector de Claude»): Claude no puede leer nada.
			</p>
		{/if}
		<div class="claude-actions">
			<form method="POST" action="?/cerrarClaude" use:enhance={submit}>
				<button class="kv-btn ghost small" type="submit" disabled={busy}
					>Cerrar mis conexiones de Claude</button
				>
			</form>
			<form method="POST" action="?/cerrarClaudeTodes" use:enhance={submit}>
				<button class="kv-btn ghost small" type="submit" disabled={busy}>Cerrar las de todes</button
				>
			</form>
		</div>
	</Card>
	<p class="kv-note">
		Por ahora la lista se cambia en el código (<code>src/lib/server/auth.js</code>, por el número de
		usuarie de GitHub, que no cambia aunque cambie el nombre). Más adelante se va a poder editar
		desde acá.
	</p>
</div>

<style>
	.settings {
		max-width: 48rem;
	}
	.admins {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-s);
		border-top: 1px solid var(--line);
	}
	li:first-child {
		border-top: 0;
	}
	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		flex: none;
		background: var(--surface-2);
	}
	.initial {
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--muted);
	}
	.tg-state {
		margin-top: 0;
	}
	.tg-qr {
		margin: var(--space-xs) 0;
	}
	.tg-qr :global(svg) {
		width: 180px;
		height: 180px;
		display: block;
		background: #fff;
	}
	.claude-url {
		overflow-wrap: anywhere;
	}
	.claude-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
</style>
