<script>
	/**
	 * "Avisame si se repite": formulario para recibir un mail cuando se publique una nueva edición
	 * de una serie (interruptor `series`). Manda a /avisos (?/suscribir o ?/baja); con JavaScript
	 * muestra el resultado acá mismo, sin JavaScript lo muestra la página /avisos.
	 * Props:
	 * - `seriesId`, `seriesName`: la serie (etiqueta).
	 * - `member`: hay una cuenta con sesión (se suscribe sin escribir el mail).
	 * - `subscribed`: esa cuenta ya está suscripta.
	 * - `sigo`: con cuenta, «Avisame» es seguir la serie en «Lo que sigo» (los textos lo dicen y
	 *   llevan a Mi rincón → Lo que sigo).
	 * - `heading`: título del bloque.
	 */
	import { enhance } from '$app/forms';
	import { BellRing } from '@lucide/svelte';

	/** @type {string} */
	export let seriesId;
	/** @type {string} */
	export let seriesName;
	export let member = false;
	export let subscribed = false;
	export let sigo = false;
	export let heading = 'Avisame si se repite';

	let busy = false;
	let message = '';
	let error = '';
	let email = '';

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		error = '';
		return async ({ result }) => {
			busy = false;
			if (result.type === 'success') {
				const status = result.data?.status;
				if (status === 'removed') {
					subscribed = false;
					message = `Listo: no te vamos a avisar más de ${seriesName}.`;
				} else if (status === 'confirmed') {
					subscribed = true;
					message = sigo
						? `Listo: seguís ${seriesName} y te avisamos por mail cuando se anuncie una nueva edición.`
						: `Listo: te vamos a avisar por mail cuando haya una nueva edición de ${seriesName}.`;
				} else {
					message =
						'Te mandamos un mail para confirmar. Abrilo y tocá el link: sin confirmar no te avisamos nada.';
					email = '';
				}
			} else if (result.type === 'failure') {
				error = String(result.data?.error ?? 'No pudimos guardarlo. Probá de nuevo.');
			} else if (result.type === 'redirect') {
				window.location.href = result.location;
			} else {
				error = 'No pudimos guardarlo. Probá de nuevo en un rato.';
			}
		};
	};
</script>

<section class="series-notify surface-card" aria-label={heading}>
	<h2><BellRing size={20} aria-hidden="true" /> {heading}</h2>
	{#if message}
		<p class="ok" role="status">{message}</p>
	{/if}
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
	{#if member && subscribed}
		{#if sigo}
			<p>
				Seguís {seriesName}: te avisamos por mail cuando se anuncie una nueva edición.
				<a href="/mi-rincon/sigo">Elegí qué recibís en Lo que sigo</a>.
			</p>
		{:else}
			<p>Te vamos a avisar por mail cuando haya una nueva edición de {seriesName}.</p>
		{/if}
		<form method="POST" action="/avisos?/baja" use:enhance={submit}>
			<input type="hidden" name="serie" value={seriesId} />
			<button class="pill-btn ghost" type="submit" disabled={busy}>Dejar de avisarme</button>
		</form>
	{:else if member}
		{#if !message}
			<p>
				{#if sigo}
					Seguí {seriesName} con tu cuenta: te mandamos un mail cada vez que se anuncie una nueva edición
					y sus fechas van a tu calendario.
				{:else}
					Te mandamos un solo mail a tu cuenta cada vez que se anuncie una nueva edición.
				{/if}
			</p>
		{/if}
		<form method="POST" action="/avisos?/suscribir" use:enhance={submit}>
			<input type="hidden" name="serie" value={seriesId} />
			<input type="hidden" name="cuenta" value="1" />
			<button class="pill-btn" type="submit" disabled={busy}>Avisame</button>
		</form>
	{:else if !message}
		<p>
			Dejanos tu mail y te escribimos una vez cuando se anuncie la próxima edición de {seriesName}.
			Te vamos a pedir que lo confirmes, y cada mail trae un link para darte de baja.
		</p>
		<form method="POST" action="/avisos?/suscribir" use:enhance={submit} class="row">
			<input type="hidden" name="serie" value={seriesId} />
			<label>
				<span class="sr-only">Tu mail</span>
				<input
					type="email"
					name="email"
					required
					autocomplete="email"
					placeholder="tu@mail.com"
					bind:value={email}
				/>
			</label>
			<button class="pill-btn" type="submit" disabled={busy}>Avisame</button>
		</form>
	{/if}
</section>

<style>
	.series-notify {
		display: grid;
		gap: 0.7em;
		width: min(40rem, 100%);
		margin: 1.5em auto 0;
		border-top: 0.3rem solid var(--2);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin: 0;
		font-size: var(--step-1);
	}
	p {
		margin: 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6em;
	}
	.row label {
		flex: 1 1 14rem;
		display: grid;
	}
	input[type='email'] {
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
		min-width: 0;
	}
	.ok {
		color: var(--3-ink);
		font-weight: 700;
	}
	.error {
		color: var(--1-ink);
		font-weight: 700;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
