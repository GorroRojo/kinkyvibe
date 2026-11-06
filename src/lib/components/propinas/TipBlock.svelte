<script>
	/**
	 * Bloque "Dejá una propina" al pie de las publicaciones de Kinky Vibe (y en /propinas, sin JS o
	 * si algo falló). Manda el formulario a /propinas, que valida todo en el servidor y redirige al
	 * checkout de Mercado Pago. No pide datos de la persona: solo el monto y un mensaje opcional.
	 * Toda propina va al Fondo Kinky Vibe (decisión de gorrite): ya no se elige a dónde va.
	 * Props: `category` y `slug` (la publicación), `values` y `errors`/`error` (lo que devolvió el
	 * servidor, para volver a mostrar el formulario), `heading` (h2 por defecto; h1 en /propinas).
	 * `fondo`: la versión de `/propinas?de=fondo` (desde fondo.kinkyvibe.ar), sin publicación: manda
	 * `source=fondo` en lugar de `category` y `slug`.
	 * PayPal (docs/paypal.md): con JavaScript, si /api/paypal/oferta dice que se puede, se elige
	 * entre Mercado Pago y PayPal, y con PayPal se ven los dólares del monto elegido antes de pagar.
	 */
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { FONDO_SITE_URL, TIP_MESSAGE_MAX, parseTipAmount } from '$lib/utils/propinas.js';
	import { formatUSD, usdCentsForArs } from '$lib/utils/paypal.js';
	import TipAmountPicker from './TipAmountPicker.svelte';

	/** @type {import('$lib/utils/propinas.js').TipCategory | null} */
	export let category = null;
	/** @type {string | null} */
	export let slug = null;
	export let fondo = false;
	/** @type {Partial<import('$lib/utils/propinas.js').TipFormValues>} */
	export let values = {};
	/** @type {Record<string, string>} */
	export let errors = {};
	export let error = '';
	/** @type {'h1' | 'h2'} */
	export let heading = 'h2';

	let message = values.message ?? '';
	let busy = false;
	let selected = values.amount || undefined;
	let custom = values.custom ?? '';
	let method = values.method === 'paypal' ? 'paypal' : 'mp';
	/** @type {{ base: number, adjustmentPct: number } | null} */
	let paypal = null;

	onMount(async () => {
		try {
			const res = await fetch('/api/paypal/oferta');
			const offer = res.ok ? await res.json() : null;
			if (offer?.available) paypal = { base: offer.base, adjustmentPct: offer.adjustmentPct };
		} catch {
			// Sin PayPal: queda Mercado Pago, como siempre.
		}
	});

	$: chosen = parseTipAmount(selected === 'otro' || !selected ? custom : selected);
	$: usdCents =
		paypal && chosen.ok ? usdCentsForArs(chosen.amount, paypal.base, paypal.adjustmentPct) : null;
	$: if (!paypal) method = 'mp';

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		error = '';
		errors = {};
		return async ({ result }) => {
			if (result.type === 'redirect') {
				// El checkout de Mercado Pago es otra web: navegación completa.
				window.location.href = result.location;
				return;
			}
			busy = false;
			if (result.type === 'failure') {
				error = String(result.data?.error ?? 'Revisá lo marcado.');
				errors = /** @type {Record<string, string>} */ (result.data?.errors ?? {});
			} else {
				error = 'No pudimos preparar tu propina. Probá de nuevo en un ratito.';
			}
		};
	};
</script>

<section class="propina surface-card" id="propina" aria-labelledby="propina-title">
	<svelte:element this={heading} id="propina-title" class="title"
		>{fondo
			? 'Dejá una propina para el Fondo Kinky Vibe'
			: '¿Te sirvió? Dejá una propina'}</svelte:element
	>
	<p class="lead">
		{#if !fondo}Esto lo hicimos <a rel="author" href="/amigues/KinkyVibe">nosotres</a> ✨.{/if}
		Tu propina va entera al
		<a href={FONDO_SITE_URL} target="_blank" rel="noopener">Fondo Kinky Vibe</a>, que baja el precio
		de lo que hacemos para todes.{#if fondo}{' '}No hace falta cuenta ni dejar tus datos.{/if} ¡Gracias!
		🤗
	</p>
	<form method="POST" action="/propinas" use:enhance={submit}>
		{#if fondo}
			<input type="hidden" name="source" value="fondo" />
		{:else}
			<input type="hidden" name="category" value={category} />
			<input type="hidden" name="slug" value={slug} />
		{/if}
		<TipAmountPicker bind:selected bind:custom error={errors.amount ?? ''} />
		<details open={Boolean(message || errors.message)}>
			<summary>Sumar un mensaje (opcional)</summary>
			<label class="message">
				<span class="sr-only">Mensaje</span>
				<textarea
					name="message"
					rows="3"
					maxlength={TIP_MESSAGE_MAX}
					placeholder="Unas palabras para les organizadores"
					bind:value={message}></textarea>
				<small>Solo lo leen les organizadores. {message.length}/{TIP_MESSAGE_MAX}</small>
			</label>
			{#if errors.message}<p class="error" role="alert">{errors.message}</p>{/if}
		</details>
		{#if paypal}
			<fieldset class="method">
				<legend>¿Cómo pagás?</legend>
				<label class="chip">
					<input type="radio" name="method" value="mp" bind:group={method} />
					<span>Mercado Pago</span>
				</label>
				<label class="chip">
					<input type="radio" name="method" value="paypal" bind:group={method} />
					<span>PayPal (en dólares)</span>
				</label>
				{#if method === 'paypal'}
					<p class="usd" aria-live="polite">
						{#if usdCents}Con PayPal pagás <strong>{formatUSD(usdCents)}</strong>, al dólar MEP de
							hoy.{:else}Elegí un monto para ver cuánto es en dólares.{/if}
					</p>
				{/if}
			</fieldset>
		{/if}
		{#if errors.post}<p class="error" role="alert">{errors.post}</p>{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button class="pill-btn" type="submit" disabled={busy}>
			{busy ? 'Un momento…' : 'Dejá una propina'}
		</button>
		<p class="hint">
			{method === 'paypal'
				? 'Pagás con PayPal, con tu cuenta o con tarjeta.'
				: 'Pagás con Mercado Pago. No hace falta tener cuenta.'}
		</p>
	</form>
</section>

<style>
	.propina {
		display: grid;
		gap: 0.8em;
		max-width: 50rem;
		width: calc(100% - 32px);
		margin: 1.5em auto;
		border-top: 0.35rem solid var(--1);
		box-sizing: border-box;
	}
	.title {
		margin: 0;
		font-size: var(--step-1);
		text-align: left;
		color: var(--ink);
	}
	.lead {
		margin: 0;
		line-height: 1.5;
	}
	.lead a {
		color: var(--2-dark);
	}
	form {
		display: grid;
		gap: 0.9em;
	}
	details {
		border-top: 1px solid var(--line);
		padding-top: 0.6em;
	}
	summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--2-dark);
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}
	.message {
		display: grid;
		gap: 0.25em;
	}
	textarea {
		font: inherit;
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
	}
	small,
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.hint {
		margin: 0;
	}
	.error {
		margin: 0;
		color: var(--1-ink);
		font-weight: 700;
	}
	button {
		justify-self: start;
		font-size: var(--step-0);
	}
	@media (max-width: 30rem) {
		button {
			justify-self: stretch;
		}
	}
	.method {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		min-width: 0;
	}
	.method legend {
		font-weight: 700;
		margin-bottom: 0.4em;
	}
	.method .chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		min-height: var(--tap);
		padding: 0 0.9em;
		border: 1px solid var(--line);
		border-radius: 999px;
		cursor: pointer;
	}
	.method .chip:has(input:checked) {
		border-color: var(--2-dark);
		font-weight: 700;
	}
	.usd {
		flex-basis: 100%;
		margin: 0;
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
