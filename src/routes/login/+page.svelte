<script>
	import {page} from "$app/state"
</script>
<main>
	<a href="/">⬅️ volver a la página</a>

	<form method="POST">
		<input type="submit" value="Iniciar sesión con GitHub"/>
		<input hidden type="text" name="redirectTo" value={page.url.searchParams.get('redirectTo') ?? '/'} />
	</form>
</main>
<style>
	form {
		display: block;
		margin: auto auto;

	}
	main {
		display: grid;
		place-content: center;
		gap: 1em;
		height: 100vmin;
	}
</style>
