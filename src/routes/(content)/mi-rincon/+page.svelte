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

	/** Las respuestas de las actions quedan en `form` sin vaciar los otros campos. */
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const keep =
		() =>
		async ({ update }) =>
			update({ reset: false });
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
		{#if form?.action === 'sesiones' && form.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		<div class="row">
			<form method="POST" action="?/salir">
				<button class="pill-btn ghost" type="submit">Cerrar sesión</button>
			</form>
			<form method="POST" action="?/salirTodos">
				<button class="pill-btn ghost" type="submit">Cerrar sesión en todos lados</button>
			</form>
		</div>
		<p class="hint">
			"En todos lados" cierra tu sesión en este y en cualquier otro navegador o dispositivo donde
			hayas entrado. Usalo si entraste en una compu ajena o si perdiste el celu.
		</p>
	</section>

	{#if data.canHaveProfiles}
		<section class="surface-card" aria-labelledby="perfiles-title">
			<h2 id="perfiles-title">Tus perfiles</h2>
			<p class="hint">Los tuyos y los de proyectos que gestionás.</p>
			<a class="pill-btn ghost start" href="/mi-rincon/perfiles">Ver y crear perfiles</a>
		</section>
	{/if}

	{#if data.seriesOn}
		<section class="surface-card" aria-labelledby="calendario-title">
			<h2 id="calendario-title">Tu calendario</h2>
			<p class="hint">Tus eventos en tu calendario y los avisos de series que pediste.</p>
			<a class="pill-btn ghost start" href="/mi-rincon/calendario">Ver tu calendario</a>
		</section>
	{/if}

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
				Podés entrar con tu contraseña o con un código por mail. Si la cambiás o la sacás, se
				cierran tus otras sesiones.
			{:else}
				Es opcional: sin contraseña, entrás con un código que te mandamos por mail.
			{/if}
			Para tocarla te pedimos un código por mail, así nadie puede cambiarla con tu sesión abierta.
		</p>
		{#if form?.codeSentFor === 'password'}
			<form method="POST" action="?/contrasena" use:enhance={keep}>
				<input type="text" name="username" value={data.email} autocomplete="username" hidden />
				<label>
					<span>Código que te llegó por mail</span>
					<input
						name="code"
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="9"
						required
					/>
				</label>
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
				{#if data.hasPassword}
					<button class="link" type="submit" formaction="?/sacarContrasena" formnovalidate
						>Sacar la contraseña (entrar solo con código)</button
					>
				{/if}
			</form>
			<form method="POST" action="?/confirmar" use:enhance={keep}>
				<input type="hidden" name="para" value="password" />
				<button class="link" type="submit">Mandame otro código</button>
			</form>
		{:else}
			<form method="POST" action="?/confirmar" use:enhance={keep}>
				<input type="hidden" name="para" value="password" />
				<button class="pill-btn ghost" type="submit"
					>{data.hasPassword ? 'Cambiar o sacar la contraseña' : 'Poner contraseña'}</button
				>
			</form>
		{/if}
	</section>

	<section class="surface-card danger" aria-labelledby="borrar-title">
		<h2 id="borrar-title">Borrar tu cuenta</h2>
		{#if form?.action === 'borrar' && form.error}
			<p class="error" role="alert">{form.error}</p>
		{:else if form?.action === 'borrar' && form.message}
			<p class="ok" role="status">{form.message}</p>
		{/if}
		<details open={form?.action === 'borrar'}>
			<summary>Quiero borrar mi cuenta</summary>
			<p>
				Se borra tu cuenta con tu mail y tu contraseña, y se cierran todas tus sesiones. Tus compras
				y entradas siguen valiendo: quedan en el sistema, sin cuenta.{#if data.canHaveProfiles}
					Tus perfiles de persona se vacían y se borran; los proyectos que gestionás con otras
					personas quedan para elles.{/if} No se puede deshacer.
			</p>
			{#if form?.codeSentFor === 'delete'}
				<form method="POST" action="?/borrar" use:enhance={keep}>
					<label>
						<span>Código que te llegó por mail</span>
						<input
							name="code"
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							maxlength="9"
							required
						/>
					</label>
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
				<form method="POST" action="?/confirmar" use:enhance={keep}>
					<input type="hidden" name="para" value="delete" />
					<button class="link" type="submit">Mandame otro código</button>
				</form>
			{:else}
				<form method="POST" action="?/confirmar" use:enhance={keep}>
					<input type="hidden" name="para" value="delete" />
					<button class="pill-btn ghost" type="submit">Mandame un código para confirmar</button>
				</form>
			{/if}
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
	.start {
		justify-self: start;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
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
