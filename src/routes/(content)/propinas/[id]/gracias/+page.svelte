<script>
	/**
	 * Gracias por la propina (o qué pasó si el pago no se completó). Si vino desde el Fondo
	 * (`/propinas?de=fondo`), el link de vuelta es a fondo.kinkyvibe.ar.
	 */
	import { formatARS } from '$lib/utils/money.js';
	import { FONDO_SITE_URL } from '$lib/utils/propinas.js';

	export let data;

	$: status = data.tip.status;
	$: fromFondo = data.tip.source === 'fondo';
</script>

<svelte:head>
	<title>Gracias · Kinky Vibe</title>
	<meta name="robots" content="noindex, nofollow" />
	<!-- same-origin (como el encabezado): con no-referrer, «Salir» del menú (un POST) sale con
	     `Origin: null` y SvelteKit lo rechaza. -->
	<meta name="referrer" content="same-origin" />
</svelte:head>

<section class="gracias surface-card" class:bad={status === 'rejected'} aria-live="polite">
	{#if status === 'approved'}
		<p class="emoji" aria-hidden="true">💖</p>
		<h1>¡Gracias por tu propina!</h1>
		<p>
			Recibimos tus <strong>{formatARS(data.tip.amount)}</strong
			>{#if data.tip.destination === 'fondo'}{' '}para el Fondo Kinky Vibe{/if}. Nos ayuda un montón
			a seguir haciendo material y encuentros para todes.
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
		<p>
			No se cobró nada. Si querés, podés intentar de nuevo desde {fromFondo
				? 'el Fondo'
				: 'la publicación'}.
		</p>
	{:else}
		<h1>Esta propina se reembolsó</h1>
		<p>La devolvimos por Mercado Pago. Gracias igual por la intención.</p>
	{/if}
	{#if fromFondo || !data.postPath}
		<a class="pill-btn ghost" href={FONDO_SITE_URL}>Volver al Fondo Kinky Vibe</a>
	{:else}
		<a class="pill-btn ghost" href={data.postPath}>Volver a la publicación</a>
	{/if}
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
