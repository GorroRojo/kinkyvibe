<script>
	/**
	 * Bloque "Dejá una propina" al pie de las publicaciones de KinkyVibe (y en /propinas, sin JS o
	 * si algo falló). Manda el formulario a /propinas, que valida todo en el servidor y redirige al
	 * checkout de Mercado Pago. No pide datos de la persona: solo el monto y un mensaje opcional.
	 * Toda propina va al Fondo KinkyVibe (decisión de gorrite): ya no se elige a dónde va.
	 * Props: `category` y `slug` (la publicación), `values` y `errors`/`error` (lo que devolvió el
	 * servidor, para volver a mostrar el formulario), `heading` (h2 por defecto; h1 en /propinas).
	 */
	import { enhance } from '$app/forms';
	import { TIP_MESSAGE_MAX } from '$lib/utils/propinas.js';
	import TipAmountPicker from './TipAmountPicker.svelte';

	/** @type {'material' | 'calendario'} */
	export let category;
	/** @type {string} */
	export let slug;
	/** @type {Partial<import('$lib/utils/propinas.js').TipFormValues>} */
	export let values = {};
	/** @type {Record<string, string>} */
	export let errors = {};
	export let error = '';
	/** @type {'h1' | 'h2'} */
	export let heading = 'h2';

	let message = values.message ?? '';
	let busy = false;

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
		>¿Te sirvió? Dejá una propina</svelte:element
	>
	<p class="lead">
		Esto lo hicimos <a rel="author" href="/amigues/KinkyVibe">nosotres</a> ✨. Tu propina va entera
		al
		<a href="https://fondo.kinkyvibe.ar" target="_blank" rel="noopener">Fondo KinkyVibe</a>, que
		baja el precio de lo que hacemos para todes. ¡Gracias! 🤗
	</p>
	<form method="POST" action="/propinas" use:enhance={submit}>
		<input type="hidden" name="category" value={category} />
		<input type="hidden" name="slug" value={slug} />
		<TipAmountPicker
			selected={values.amount || undefined}
			custom={values.custom ?? ''}
			error={errors.amount ?? ''}
		/>
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
		{#if errors.post}<p class="error" role="alert">{errors.post}</p>{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button class="pill-btn" type="submit" disabled={busy}>
			{busy ? 'Un momento…' : 'Dejá una propina'}
		</button>
		<p class="hint">Pagás con Mercado Pago. No hace falta tener cuenta.</p>
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
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
