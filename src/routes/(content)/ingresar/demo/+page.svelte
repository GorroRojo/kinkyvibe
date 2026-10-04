<script>
	export let data;
</script>

<svelte:head>
	<title>Entrar como persona de prueba - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<!-- Solo en deploys de preview (docs/demo.md) -->
<section class="demo surface-card" aria-labelledby="demo-title">
	<h1 id="demo-title">🧪 Entrar como persona de prueba</h1>
	<p>
		Deploy de prueba: elegí una cuenta inventada para ver el sitio como alguien del público, sin
		código por mail. Los datos son de mentira y los cambios se guardan solo en la base de prueba.
	</p>
	<ul>
		{#each data.personas as persona (persona.key)}
			<li>
				<form method="POST">
					<input type="hidden" name="persona" value={persona.key} />
					<button type="submit" class="pill-btn" disabled={!persona.ready}>{persona.label}</button>
				</form>
				<p class="hint">
					{persona.hint}
					<span class="email">{persona.email}</span>
					{#if !persona.ready}
						<strong>Falta cargar el seed (scripts/demo/n3-cuentas.sql).</strong>
					{/if}
				</p>
			</li>
		{/each}
	</ul>
	<a class="back" href="/ingresar">← Entrar con tu mail</a>
</section>

<style>
	.demo {
		display: grid;
		gap: 0.8em;
		width: min(30rem, 100%);
		margin: 2em auto;
		padding: 1.5em;
		border-top: 0.35rem solid var(--1);
	}
	h1 {
		margin: 0;
		font-size: var(--step-1);
	}
	p {
		margin: 0;
	}
	ul {
		display: grid;
		gap: 1em;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		gap: 0.3em;
	}
	.pill-btn {
		width: 100%;
		font-size: var(--step-0);
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.email {
		display: block;
		overflow-wrap: anywhere;
	}
	.back {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		color: var(--2-dark);
	}
</style>
