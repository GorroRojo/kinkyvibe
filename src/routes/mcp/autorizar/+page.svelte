<script>
	import logo from '../../logo.png';

	export let data;

	$: fields = Object.entries(data.fields);
</script>

<svelte:head>
	<title>Conectar Claude · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<section class="consent surface-card" aria-labelledby="consent-title">
		<img src={logo} alt="" width="72" height="72" />
		<h1 id="consent-title">¿Conectar Claude?</h1>
		<p>
			Claude va a poder <b>leer</b> el sitio como vos (<b>{data.login}</b>): buscar y leer eventos,
			material, perfiles y etiquetas (también lo oculto), ver las ventas y las órdenes de cada
			evento y los próximos eventos. No puede cambiar nada.
		</p>
		<p>Cada pedido de Claude queda en Actividad a tu nombre.</p>
		<p class="dest">
			Vuelve a: <b>{data.destination}</b>
		</p>
		{#if data.loopback}
			<p class="warn" role="note">
				Ojo: vuelve a un programa en esta compu (como Claude Code), no a claude.ai. Permití solo si
				lo abriste vos recién.
			</p>
		{/if}
		<form method="POST" action="?/permitir">
			{#each fields as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}
			<button class="pill-btn" type="submit">Permitir</button>
		</form>
		<form method="POST" action="?/cancelar">
			{#each fields as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}
			<button class="pill-btn ghost" type="submit">Cancelar</button>
		</form>
		<p class="note">Para cortarla después: Ajustes → Admins → «Cerrar mis conexiones de Claude».</p>
	</section>
</main>

<style>
	main {
		display: grid;
		place-items: center;
		min-height: 100vh;
		padding: var(--space-xs);
	}
	.consent {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8em;
		width: min(28rem, 100%);
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
	}
	.dest,
	.note {
		color: var(--muted);
	}
	.note {
		font-size: var(--step--1);
	}
	.warn {
		padding: 0.6em 0.8em;
		border-radius: var(--radius-s, 0.4rem);
		background: var(--surface-2);
		font-weight: 600;
	}
	form {
		width: 100%;
	}
	form .pill-btn {
		width: 100%;
		font-size: var(--step-0);
	}
</style>
