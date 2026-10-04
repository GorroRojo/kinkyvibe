<script>
	/**
	 * Página a la que lleva un link de un mail (confirmar un aviso, darse de baja). El link solo
	 * muestra la página; la acción se hace con el botón (POST), así los antivirus del correo que
	 * abren los links solos no confirman ni dan de baja a nadie.
	 * Props: `title`, `text` (qué va a pasar), `button`, `done` (mensaje si salió bien, o ''),
	 * `error` (o ''), `valid` (false: el link no sirve; muestra `error` y no el botón).
	 */
	/** @type {string} */
	export let title;
	export let text = '';
	export let button = 'Confirmar';
	export let done = '';
	export let error = '';
	export let valid = true;
</script>

<svelte:head>
	<title>{title} - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="mail-link surface-card" aria-labelledby="mail-link-title">
	<h1 id="mail-link-title">{title}</h1>
	{#if done}
		<p class="ok" role="status">{done}</p>
		<a class="pill-btn ghost" href="/calendario">Ver el calendario</a>
	{:else}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if valid}
			{#if text}<p>{text}</p>{/if}
			<form method="POST">
				<button class="pill-btn" type="submit">{button}</button>
			</form>
		{/if}
	{/if}
</section>

<style>
	.mail-link {
		display: grid;
		gap: 0.9em;
		width: min(28rem, 100%);
		margin: 2em auto;
		border-top: 0.35rem solid var(--2);
		justify-items: start;
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
	}
	p {
		margin: 0;
	}
	.ok {
		color: var(--3-ink);
		font-weight: 700;
	}
	.error {
		color: var(--1-ink);
		font-weight: 700;
	}
</style>
