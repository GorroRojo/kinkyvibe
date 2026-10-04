<script>
	import { enhance } from '$app/forms';
	import { Trash2 } from '@lucide/svelte';
	import { formatARS } from '$lib/utils/money.js';
	import { TIMEZONE, argDateList } from '$lib/utils/dates.js';

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

	// «Mis datos»: el DNI entero solo llega con «Mostrar» (la respuesta de ?/mostrarDni).
	let hideDni = false;
	$: (form, (hideDni = false));
	$: shownDni = !hideDni && form?.action === 'datos' && form.dni ? String(form.dni) : '';
	$: savedEmpty = !data.saved.name && !data.saved.pronouns && !data.saved.hasDni;
	/** @type {Record<string, string>} */
	$: datosErrors = (form?.action === 'datos' && form.errors) || {};

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

	{#if data.sigoOn}
		<!-- «Lo que sigo» y el calendario personal son una sola cosa: una tarjeta, una página. -->
		<section class="surface-card" aria-labelledby="sigo-title">
			<h2 id="sigo-title">Lo que seguís y tu calendario</h2>
			<p class="hint">
				Etiquetas, series, perfiles y lugares que seguís y de qué te escribimos. Y tu calendario
				personal: lo que seguís, tus entradas y donde participás, en tu app de calendario.
			</p>
			<a class="pill-btn ghost start" href="/mi-rincon/sigo">Ver lo que seguís</a>
		</section>
	{:else}
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
							{#if o.eventStart}<span class="hint">{argDateList(o.eventStart)}</span>{/if}
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

	<section class="surface-card" id="mis-datos" aria-labelledby="datos-title">
		<h2 id="datos-title">Mis datos</h2>
		<p class="hint">
			Los usamos solo para completarte el formulario cuando comprás entradas con tu cuenta. Los ves
			solo vos.
		</p>
		{#if form?.action === 'datos'}
			{#if form.error}
				<p class="error" role="alert">{form.error}</p>
			{:else if form.message}
				<p class="ok" role="status">{form.message}</p>
			{/if}
		{/if}
		{#if data.savedError}
			<p class="error" role="alert">No pudimos cargar tus datos. Probá de nuevo en un rato.</p>
		{:else}
			{#if savedEmpty}
				<p class="hint">
					Todavía no guardaste nada. Se guardan al comprar, si marcás «Guardar mis datos para la
					próxima» o «Recordar mi DNI», o acá abajo.
				</p>
			{:else}
				<dl class="saved">
					{#if data.saved.name}
						<div>
							<dt>Nombre</dt>
							<dd>{data.saved.name}</dd>
							<form method="POST" action="?/borrarDato" use:enhance={keep}>
								<input type="hidden" name="campo" value="name" />
								<button class="link" type="submit" aria-label="Borrar tu nombre">Borrar</button>
							</form>
						</div>
					{/if}
					{#if data.saved.pronouns}
						<div>
							<dt>Pronombres</dt>
							<dd>{data.saved.pronouns}</dd>
							<form method="POST" action="?/borrarDato" use:enhance={keep}>
								<input type="hidden" name="campo" value="pronouns" />
								<button class="link" type="submit" aria-label="Borrar tus pronombres">Borrar</button
								>
							</form>
						</div>
					{/if}
					{#if data.saved.hasDni}
						<div>
							<dt>DNI</dt>
							<dd class="dni">{shownDni || data.saved.dniMasked}</dd>
							{#if shownDni}
								<button class="link" type="button" on:click={() => (hideDni = true)}>Ocultar</button
								>
							{:else}
								<form method="POST" action="?/mostrarDni" use:enhance={keep}>
									<button class="link" type="submit" aria-label="Mostrar tu DNI completo"
										>Mostrar</button
									>
								</form>
							{/if}
							<form method="POST" action="?/borrarDato" use:enhance={keep}>
								<input type="hidden" name="campo" value="dni" />
								<button class="link" type="submit" aria-label="Borrar tu DNI">Borrar</button>
							</form>
						</div>
					{/if}
				</dl>
			{/if}
			<details open={Object.keys(datosErrors).length > 0}>
				<summary>{savedEmpty ? 'Guardar mis datos' : 'Cambiar mis datos'}</summary>
				<form method="POST" action="?/datos" use:enhance={keep}>
					<label>
						<span>Tu nombre</span>
						<input
							name="name"
							type="text"
							autocomplete="name"
							maxlength="80"
							value={form?.action === 'datos' && form.values ? form.values.name : data.saved.name}
							aria-invalid={datosErrors.name ? 'true' : undefined}
						/>
						{#if datosErrors.name}<span class="field-error">{datosErrors.name}</span>{/if}
					</label>
					<label>
						<span>Tus pronombres</span>
						<input
							name="pronouns"
							type="text"
							autocomplete="off"
							maxlength="40"
							placeholder="ella, él, elle…"
							value={form?.action === 'datos' && form.values
								? form.values.pronouns
								: data.saved.pronouns}
							aria-invalid={datosErrors.pronouns ? 'true' : undefined}
						/>
						{#if datosErrors.pronouns}<span class="field-error">{datosErrors.pronouns}</span>{/if}
					</label>
					<label>
						<span>{data.saved.hasDni ? 'DNI nuevo' : 'DNI'}</span>
						<input
							name="dni"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							maxlength="12"
							placeholder="Ej.: 12.345.678"
							aria-invalid={datosErrors.dni ? 'true' : undefined}
						/>
						{#if datosErrors.dni}<span class="field-error">{datosErrors.dni}</span>{/if}
					</label>
					<p class="hint">
						Si dejás el nombre o los pronombres vacíos, se borran.{#if data.saved.hasDni}
							El DNI escribilo solo si lo querés cambiar: vacío, queda el que está.{/if}
					</p>
					<button class="pill-btn" type="submit">Guardar</button>
				</form>
			</details>
			{#if !savedEmpty}
				<form method="POST" action="?/borrarDatos" use:enhance={keep}>
					<button class="pill-btn ghost" type="submit">Borrar todo</button>
				</form>
			{/if}
		{/if}
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

	<section class="surface-card danger-zone" aria-labelledby="borrar-title">
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
						class="pill-btn danger"
						type="submit"
						disabled={confirmDelete.trim().toLowerCase() !== 'borrar'}
						><Trash2 size={18} aria-hidden="true" /> Borrar mi cuenta</button
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
		font-weight: 700;
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
	.saved {
		display: grid;
		gap: 0.2em;
		margin: 0;
	}
	.saved > div {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.8em;
		border-bottom: 1px solid var(--line);
	}
	.saved dt {
		font-weight: 700;
		min-width: 6.5em;
	}
	.saved dd {
		margin: 0;
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.saved .dni {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.05em;
	}
	.saved form {
		display: contents;
	}
	.field-error {
		color: var(--1-ink);
		font-size: var(--step--1);
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
		font-weight: 700;
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
	.danger-zone {
		border-top: 0.25rem solid var(--1-dark);
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
