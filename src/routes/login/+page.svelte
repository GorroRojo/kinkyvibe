<script>
	import {page} from "$app/stores"
	$: redirectTo = $page.url.searchParams.get('redirectTo') ?? '/';
</script>
<main>
	<a href="/">⬅️ volver a la página</a>

	<form method="POST">
		<input type="submit" value="Iniciar sesión con GitHub"/>
		<input hidden type="text" name="redirectTo" value={redirectTo} />
	</form>
	{#if $page.data.demoMode}
		<!-- Solo en deploys de preview (docs/demo.md) -->
		<form method="POST" action="/login/demo" class="demo">
			<button type="submit">🧪 Entrar como admin de prueba</button>
			<input type="hidden" name="redirectTo" value={redirectTo} />
			<p>Deploy de prueba: los datos son inventados y los cambios se guardan solo en la base de prueba.</p>
		</form>
	{/if}
</main>
<style>
	form {
		display: block;
		margin: auto auto;

	}
	.demo {
		display: grid;
		gap: 0.5em;
		justify-items: center;
		text-align: center;
		max-width: 22rem;
	}
	.demo button {
		font: inherit;
		padding: 0.5em 1.2em;
		border-radius: 9999em;
		border: none;
		background: var(--1, hsl(319, 90%, 60%));
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}
	.demo p {
		margin: 0;
		font-size: var(--step--1);
		opacity: 0.8;
	}
	main {
		display: grid;
		place-content: center;
		gap: 1em;
		height: 100vmin;
	}
</style>
