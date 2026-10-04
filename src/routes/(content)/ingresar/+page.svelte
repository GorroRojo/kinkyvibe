<script>
	import { enhance } from '$app/forms';
	import ExpiryTime from '$lib/components/ExpiryTime.svelte';
	import { durationText } from '$lib/utils/expiry.js';

	export let data;
	export let form;

	$: step = form?.step ?? 'email';
	$: email = form?.email ?? '';
	$: next = form?.next ?? data.next;
	let busy = false;

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>Entrar · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="ingresar surface-card" aria-labelledby="ingresar-title">
	<h1 id="ingresar-title">Entrar</h1>

	{#if form?.error}
		<p class="error" role="alert">{form.error}</p>
	{:else if data.deleted && !form}
		<p class="ok" role="status">Borramos tu cuenta. Tus compras siguen valiendo.</p>
	{:else if data.loggedOutEverywhere && !form}
		<p class="ok" role="status">Listo: cerramos tu sesión en todos lados.</p>
	{/if}

	{#if step === 'code'}
		<p>
			{#if form?.sent}Si el mail está bien, en un ratito te llega un código a <strong
					>{email}</strong
				>.{:else}Escribí el código que te mandamos a <strong>{email}</strong>.{/if}
			Vence en {durationText(data.codeTtlMs)}{#if form?.expiresAt}{' '}(<ExpiryTime
					at={form.expiresAt}
				/>){/if}.
		</p>
		<form method="POST" action="?/verificar" use:enhance={submit}>
			<input type="hidden" name="email" value={email} />
			<input type="hidden" name="next" value={next} />
			{#if form?.expiresAt}<input type="hidden" name="vence" value={form.expiresAt} />{/if}
			<label>
				<span>Código</span>
				<input
					name="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength="9"
					required
				/>
			</label>
			<button class="pill-btn" type="submit" disabled={busy}>Entrar</button>
		</form>
		<form method="POST" action="?/codigo" use:enhance={submit} class="again">
			<input type="hidden" name="email" value={email} />
			<input type="hidden" name="next" value={next} />
			<button class="link" type="submit" disabled={busy}>Mandame otro código</button>
			<a href="/ingresar?next={encodeURIComponent(next)}" data-sveltekit-reload>Usar otro mail</a>
		</form>
	{:else}
		<p>Te mandamos un código por mail para entrar. Si es la primera vez, así se crea tu cuenta.</p>
		<form method="POST" action="?/codigo" use:enhance={submit}>
			<input type="hidden" name="next" value={next} />
			<label>
				<span>Tu mail</span>
				<input
					name="email"
					type="email"
					autocomplete="email"
					value={step === 'email' ? email : ''}
					maxlength="254"
					required
				/>
			</label>
			<button class="pill-btn" type="submit" disabled={busy}>Mandame un código</button>
		</form>

		<details open={step === 'password'}>
			<summary>Entrar con contraseña</summary>
			<p class="hint">Si ya pusiste una contraseña en Mi rincón.</p>
			<form method="POST" action="?/contrasena" use:enhance={submit}>
				<input type="hidden" name="next" value={next} />
				<label>
					<span>Tu mail</span>
					<input
						name="email"
						type="email"
						autocomplete="username"
						value={step === 'password' ? email : ''}
						maxlength="254"
						required
					/>
				</label>
				<label>
					<span>Contraseña</span>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						maxlength="200"
						required
					/>
				</label>
				<button class="pill-btn ghost" type="submit" disabled={busy}>Entrar</button>
			</form>
		</details>
	{/if}

	<p class="hint">
		Tener cuenta es opcional: podés comprar entradas sin ella. Si ya compraste con este mail, tus
		compras aparecen en Mi rincón.
	</p>
	{#if data.demoMode}
		<!-- Solo en deploys de preview (docs/demo.md) -->
		<p class="hint"><a href="/ingresar/demo">🧪 Entrar como persona de prueba</a> (sin mail)</p>
	{/if}
</section>

<style>
	.ingresar {
		display: grid;
		gap: 0.9em;
		width: min(28rem, 100%);
		margin: 2em auto;
		border-top: 0.35rem solid var(--1);
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
	}
	p {
		margin: 0;
	}
	form {
		display: grid;
		gap: 0.7em;
	}
	label {
		display: grid;
		gap: 0.25em;
	}
	label span {
		font-weight: 700;
	}
	input[type='email'],
	input[type='text'],
	input[type='password'] {
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
	}
	input[name='code'] {
		letter-spacing: 0.3em;
		font-variant-numeric: tabular-nums;
	}
	.again {
		display: flex;
		flex-wrap: wrap;
		gap: 1em;
		align-items: center;
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
	.again a {
		color: var(--2-dark);
	}
	details {
		border-top: 1px solid var(--line);
		padding-top: 0.8em;
	}
	summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--2-dark);
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}
	details form {
		margin-top: 0.6em;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
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
