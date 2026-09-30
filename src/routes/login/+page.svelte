<script>
	import { page } from '$app/stores';
	import logo from '../logo.png';
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
			<input
				hidden
				type="text"
				name="redirectTo"
				value={$page.url.searchParams.get('redirectTo') ?? '/'}
			/>
		</form>
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
	.back {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		color: var(--2-dark);
	}
</style>
