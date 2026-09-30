<script>
	import { enhance } from '$app/forms';
	import { formatARS } from '$lib/utils/money.js';
	import { TIMEZONE } from '$lib/utils/dates.js';

	export let data;
	export let form;

	/** @type {Record<string, string>} */
	const STATUS = {
		approved: 'Confirmada',
		awaiting_transfer: 'Esperando la transferencia',
		refunded: 'Reembolsada'
	};

	/** @param {number | string | null} d */
	const fmtDate = (d) =>
		d == null
			? ''
			: new Date(d).toLocaleDateString('es-AR', {
					timeZone: TIMEZONE,
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				});

	let confirmDelete = '';
</script>

<svelte:head>
	<title>Mi rincón - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<h1>Mi rincón</h1>

	<section class="surface-card" aria-labelledby="cuenta-title">
		<h2 id="cuenta-title">Tu cuenta</h2>
		<p>Mail: <strong>{data.email}</strong></p>
		<p class="hint">Con cuenta desde el {fmtDate(data.createdAt)}.</p>
		<form method="POST" action="?/salir">
			<button class="pill-btn ghost" type="submit">Cerrar sesión</button>
		</form>
	</section>

	<section class="surface-card" aria-labelledby="compras-title">
		<h2 id="compras-title">Tus compras</h2>
		{#if data.ordersError}
			<p class="error" role="alert">No pudimos cargar tus compras. Probá de nuevo en un rato.</p>
		{:else if data.orders.length === 0}
			<p class="hint">Todavía no hay compras con este mail.</p>
		{:else}
			<ul class="orders">
				{#each data.orders as o (o.id)}
					<li>
						<a href="/entradas/{o.id}/estado">
							<strong>{o.event}</strong>
							{#if o.eventStart}<span class="hint">{fmtDate(o.eventStart)}</span>{/if}
						</a>
						<span>
							{o.quantity === 1 ? '1 entrada' : `${o.quantity} entradas`} · {formatARS(o.total)} · {STATUS[
								o.status
							] ?? o.status}
						</span>
						<span class="hint">Compra {o.reference}, del {fmtDate(o.createdAt)}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="hint">
			Acá aparecen las compras hechas con tu mail, también las de antes de tener cuenta.
		</p>
	</section>

	<section class="surface-card" aria-labelledby="pw-title">
		<h2 id="pw-title">Contraseña</h2>
		{#if form?.action === 'contrasena'}
			{#if form.error}
				<p class="error" role="alert">{form.error}</p>
			{:else if form.message}
				<p class="ok" role="status">{form.message}</p>
			{/if}
		{/if}
		<p class="hint">
			{#if data.hasPassword}
				Podés entrar con tu contraseña o con un código por mail. Si la cambiás, se cierran tus otras
				sesiones.
			{:else}
				Es opcional: sin contraseña, entrás con un código que te mandamos por mail.
			{/if}
		</p>
		<form method="POST" action="?/contrasena" use:enhance>
			<input type="text" name="username" value={data.email} autocomplete="username" hidden />
			<label>
				<span>{data.hasPassword ? 'Contraseña nueva' : 'Contraseña'}</span>
				<input
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="10"
					maxlength="200"
					required
				/>
			</label>
			<label>
				<span>Repetila</span>
				<input
					name="confirm"
					type="password"
					autocomplete="new-password"
					minlength="10"
					maxlength="200"
					required
				/>
			</label>
			<p class="hint">Al menos 10 caracteres. Una frase larga es más fácil de recordar.</p>
			<button class="pill-btn" type="submit"
				>{data.hasPassword ? 'Cambiar contraseña' : 'Poner contraseña'}</button
			>
		</form>
		{#if data.hasPassword}
			<form method="POST" action="?/sacarContrasena" use:enhance>
				<button class="link" type="submit">Sacar la contraseña (entrar solo con código)</button>
			</form>
		{/if}
	</section>

	<section class="surface-card danger" aria-labelledby="borrar-title">
		<h2 id="borrar-title">Borrar tu cuenta</h2>
		{#if form?.action === 'borrar' && form.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		<details open={form?.action === 'borrar'}>
			<summary>Quiero borrar mi cuenta</summary>
			<p>
				Se borra tu cuenta con tu mail y tu contraseña, y se cierran todas tus sesiones. Tus compras
				y entradas siguen valiendo: quedan en el sistema, sin cuenta. No se puede deshacer.
			</p>
			<form method="POST" action="?/borrar">
				<label>
					<span>Para confirmar, escribí «borrar»</span>
					<input name="confirm" type="text" autocomplete="off" bind:value={confirmDelete} />
				</label>
				<button
					class="pill-btn delete"
					type="submit"
					disabled={confirmDelete.trim().toLowerCase() !== 'borrar'}>Borrar mi cuenta</button
				>
			</form>
		</details>
	</section>
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		width: min(40rem, 100%);
		margin: 1.5em auto;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-1);
	}
	section {
		display: grid;
		gap: 0.6em;
	}
	p {
		margin: 0;
	}
	form {
		display: grid;
		gap: 0.6em;
		justify-items: start;
	}
	label {
		display: grid;
		gap: 0.25em;
		width: 100%;
	}
	label span {
		font-weight: 600;
	}
	input[type='text'],
	input[type='password'] {
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
	}
	.orders {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.8em;
	}
	.orders li {
		display: grid;
		gap: 0.15em;
		padding-bottom: 0.8em;
		border-bottom: 1px solid var(--line);
	}
	.orders a {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2em 0.6em;
		align-items: baseline;
		color: var(--2-dark);
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--2-dark);
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
		min-height: var(--tap);
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}
	details {
		display: grid;
		gap: 0.6em;
	}
	details p {
		margin-bottom: 0.6em;
	}
	.danger {
		border-top: 0.25rem solid var(--1-dark);
	}
	.pill-btn.delete {
		background: var(--1-dark);
	}
	.ok {
		color: var(--3-ink);
		background: var(--3-tint);
		padding: 0.5em 0.8em;
		border-radius: var(--round-sm);
	}
	.error {
		color: var(--1-ink);
		background: var(--1-tint);
		padding: 0.5em 0.8em;
		border-radius: var(--round-sm);
	}
</style>
