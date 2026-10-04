<script>
	import { page } from '$app/stores';
	import logo from '../logo.png';
	$: redirectTo = $page.url.searchParams.get('redirectTo') ?? '/';
</script>

<svelte:head>
	<title>Iniciar sesión - KinkyVibe.ar</title>
</svelte:head>

<main>
	<section class="login surface-card" aria-labelledby="login-title">
		<img src={logo} alt="" width="72" height="72" />
		<h1 id="login-title">Iniciar sesión</h1>
		<p>Para quienes editan el sitio.</p>
		<form method="POST">
			<input class="pill-btn" type="submit" value="Iniciar sesión con GitHub" />
			<input hidden type="text" name="redirectTo" value={redirectTo} />
		</form>
		{#if $page.data.demoMode}
			<!-- Solo en deploys de preview (docs/demo.md) -->
			<form method="POST" action="/login/demo" class="demo">
				<button type="submit" class="pill-btn ghost">🧪 Entrar como admin de prueba</button>
				<input type="hidden" name="redirectTo" value={redirectTo} />
				<p>
					Deploy de prueba: los datos son inventados y los cambios se guardan solo en la base de
					prueba.
				</p>
			</form>
			{#if $page.data.cuentas}
				<a class="pill-btn ghost demo-persona" href="/ingresar/demo"
					>🧪 Entrar como persona de prueba</a
				>
			{/if}
		{/if}
		<a class="back" href="/">← Volver a la página</a>
	</section>
</main>

<style>
	main {
		display: grid;
		place-items: center;
		min-height: 100vh;
		padding: 16px;
	}
	.login {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8em;
		width: min(24rem, 100%);
		padding: 2em 1.5em;
		text-align: center;
		border-top: 0.35rem solid var(--1);
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
	}
	p {
		margin: 0;
		color: var(--muted);
	}
	form {
		width: 100%;
		margin-top: 0.4em;
	}
	form .pill-btn {
		width: 100%;
		font-size: var(--step-0);
	}
	.demo {
		display: grid;
		gap: 0.5em;
	}
	.demo-persona {
		width: 100%;
		font-size: var(--step-0);
	}
	.demo p {
		font-size: var(--step--1);
	}
	.back {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		color: var(--2-dark);
	}
</style>
