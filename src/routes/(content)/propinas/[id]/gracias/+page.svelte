<script>
	/** Gracias por la propina (o qué pasó si el pago no se completó). */
	import { formatARS } from '$lib/utils/money.js';

	export let data;

	$: status = data.tip.status;
</script>

<svelte:head>
	<title>Gracias - KinkyVibe.ar</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<section class="gracias surface-card" class:bad={status === 'rejected'} aria-live="polite">
	{#if status === 'approved'}
		<p class="emoji" aria-hidden="true">💖</p>
		<h1>¡Gracias por tu propina!</h1>
		<p>
			Recibimos tus <strong>{formatARS(data.tip.amount)}</strong>. Nos ayuda un montón a seguir
			haciendo material y encuentros para todes.
		</p>
	{:else if status === 'pending'}
		<p class="emoji" aria-hidden="true">⏳</p>
		<h1>¡Gracias!</h1>
		<p>
			Mercado Pago todavía no nos confirmó el pago de {formatARS(data.tip.amount)}. Suele tardar
			unos segundos: podés <a href="?" data-sveltekit-reload>actualizar esta página</a> en un ratito.
		</p>
	{:else if status === 'rejected'}
		<p class="emoji" aria-hidden="true">🙈</p>
		<h1>El pago no se completó</h1>
		<p>No se cobró nada. Si querés, podés intentar de nuevo desde la publicación.</p>
	{:else}
		<h1>Esta propina se reembolsó</h1>
		<p>La devolvimos por Mercado Pago. Gracias igual por la intención.</p>
	{/if}
	<a class="pill-btn ghost" href={data.postPath}>Volver a la publicación</a>
</section>

<style>
	.gracias {
		display: grid;
		gap: 0.8em;
		justify-items: center;
		text-align: center;
		width: calc(100% - 32px);
		max-width: 32rem;
		margin: 2em auto;
		box-sizing: border-box;
		border-top: 0.35rem solid var(--1);
	}
	.gracias.bad {
		border-top-color: var(--muted);
	}
	.emoji {
		font-size: var(--step-4);
		margin: 0;
		line-height: 1;
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	p a {
		color: var(--2-dark);
	}
</style>
