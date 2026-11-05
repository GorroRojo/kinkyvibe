<script>
	/**
	 * Un formulario como lo ve quien responde (docs/formularios.md): `/formularios/<dirección>` y la
	 * encuesta de un evento (`/calendario/<evento>/encuesta`). Piezas del sitio público: `Button`
	 * con `surface="sitio"`, `Notice`, `Checkbox`-like de style.scss y las preguntas de
	 * `FormQuestions`.
	 *
	 * - «Quienes tenían entrada»: la clave viene en el fragmento del link del mail (`#…`), que no
	 *   llega al servidor con la página: el navegador la lee, pregunta si sirve (`?/check`) y la
	 *   manda con la respuesta. Sin clave: «buscala en tu mail».
	 * - «Con cuenta» sin sesión: un link para entrar.
	 * - El campo trampa (invisible) frena robots en los abiertos a cualquiera.
	 *
	 * Props: `data` (publicFormData del servidor, más `loginHref`), `form` (lo que devolvió la
	 * acción).
	 */
	import { onMount } from 'svelte';
	import { applyAction, deserialize, enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import FormQuestions from './FormQuestions.svelte';
	import { ANONYMOUS_FIELD, EMAIL_MAX, HONEYPOT_FIELD, NAME_MAX } from '$lib/utils/formularios.js';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form = null;

	$: survey = data.kind === 'survey';
	$: ticket = data.access === 'ticket';
	$: heading = survey ? `¿Cómo la pasaste en ${data.eventTitle}?` : data.title;

	/** @type {'checking' | 'nokey' | 'invalid' | 'used' | 'ok'} */
	let keyState = 'checking';
	let token = '';
	let anonymous = Boolean(form?.typed?.anonymous);
	/*
	 * Lo que alguien marcó o escribió antes de que cargue el JavaScript (en un celu lento pasa)
	 * no se pisa al hidratar: los campos llevan `checked` y `value` solo si hay algo que devolver
	 * (después de un error), y al montar se lee la casilla como quedó.
	 */
	/** @type {HTMLInputElement | undefined} */
	let anonInput;
	/** @param {unknown} v */
	const valueOf = (v) => (v ? { value: String(v) } : {});
	let sending = false;

	onMount(async () => {
		if (anonInput) anonymous = anonInput.checked;
		if (!ticket) return;
		token = decodeURIComponent(location.hash.slice(1));
		if (!token) {
			keyState = 'nokey';
			return;
		}
		try {
			const body = new FormData();
			body.set('clave', token);
			const res = await fetch('?/check', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			/** @type {any} */
			const payload = result.type === 'success' ? result.data : null;
			keyState = payload?.check?.state ?? 'invalid';
		} catch {
			keyState = 'invalid';
		}
	});

	$: values = form?.values ?? {};
	$: errors = form?.errors ?? {};
	$: typed = form?.typed ?? {};
	$: needsName = data.privacy !== 'anonymous' && !ticket && data.access !== 'account';
</script>

<section class="public-form surface-card" aria-labelledby="form-title">
	{#if survey}<p class="kicker">Encuesta</p>{/if}
	{#if form?.sent}
		<h1 id="form-title">¡Gracias!</h1>
		<Notice tone="ok" role="status">
			{#if form.repeated}
				Ya teníamos tu respuesta: con una alcanza. ¡Gracias por tomarte el tiempo!
			{:else}
				Recibimos tu respuesta.{#if survey}
					Nos ayuda un montón para que lo próximo salga todavía mejor.{/if}
			{/if}
		</Notice>
		<Button surface="sitio" variant="secondary" href="/calendario">Ver lo que viene</Button>
	{:else if !data.open}
		<h1 id="form-title">{heading}</h1>
		<p>{survey ? 'Esta encuesta ya cerró.' : 'Este formulario ya no recibe respuestas.'}</p>
	{:else if ticket && keyState !== 'ok'}
		<h1 id="form-title">{heading}</h1>
		{#if keyState === 'checking'}
			<p class="muted" aria-live="polite">Un momento…</p>
			<noscript>
				<p>Para responder necesitás tener JavaScript prendido.</p>
			</noscript>
		{:else if keyState === 'nokey'}
			<p>
				{survey
					? 'Esta encuesta es para quienes fueron: buscala en tu mail.'
					: 'Este formulario es para quienes tienen entrada: buscalo en tu mail.'}
			</p>
		{:else if keyState === 'used'}
			<p>Ya contestaste. ¡Gracias!</p>
		{:else}
			<Notice tone="error" role="alert">Este link no es válido. Revisá que esté completo.</Notice>
		{/if}
	{:else if data.access === 'account' && !data.signedIn}
		<h1 id="form-title">{heading}</h1>
		{#if data.intro}<p class="lead">{data.intro}</p>{/if}
		<p>Para responder, entrá con tu cuenta.</p>
		<Button surface="sitio" href={data.loginHref}>Entrar</Button>
	{:else}
		<h1 id="form-title">{heading}</h1>
		{#if data.intro}<p class="lead">{data.intro}</p>{/if}
		<!-- La encuesta ya dice en su texto de arriba que es anónima: no se repite. -->
		<p class="privacy">
			{#if data.privacy === 'anonymous' && !survey}
				Es anónimo: no guardamos quién respondió.
			{:else if data.privacy === 'choose'}
				Podés responder con tu nombre o anónimamente.
			{:else if ticket}
				Se guarda con el nombre de tu compra.
			{:else if data.access === 'account'}
				Respondés como {data.memberEmail}.
			{/if}
		</p>
		{#if form?.error}<Notice tone="error" role="alert">{form.error}</Notice>{/if}
		<form
			method="POST"
			action="?/send"
			use:enhance={() => {
				sending = true;
				return async ({ result }) => {
					sending = false;
					await applyAction(result);
				};
			}}
		>
			{#if ticket}<input type="hidden" name="clave" value={token} />{/if}
			{#if !ticket}
				<div class="trap" aria-hidden="true">
					<label
						>No completes este campo <input
							type="text"
							name={HONEYPOT_FIELD}
							tabindex="-1"
							autocomplete="off"
						/></label
					>
				</div>
			{/if}
			{#if data.privacy === 'choose'}
				<label class="check anon">
					<input
						bind:this={anonInput}
						type="checkbox"
						name={ANONYMOUS_FIELD}
						{...anonymous ? { checked: true } : {}}
						on:change={(e) => (anonymous = e.currentTarget.checked)}
					/>
					<span
						>Responder anónimamente <small
							>Si la marcás, no guardamos tu nombre, tu mail ni tu cuenta.</small
						></span
					>
				</label>
			{/if}
			{#if needsName && !anonymous}
				<div class="who">
					<label class="field">
						<span>Tu nombre</span>
						<input
							name="nombre"
							autocomplete="name"
							maxlength={NAME_MAX}
							{...valueOf(typed.name)}
							aria-invalid={errors.nombre ? 'true' : undefined}
						/>
						{#if errors.nombre}<span class="field-error">{errors.nombre}</span>{/if}
					</label>
					<label class="field">
						<span>Tu mail</span>
						<input
							name="mail"
							type="email"
							autocomplete="email"
							maxlength={EMAIL_MAX}
							{...valueOf(typed.email ?? data.memberEmail)}
							aria-invalid={errors.mail ? 'true' : undefined}
						/>
						{#if errors.mail}<span class="field-error">{errors.mail}</span>{/if}
					</label>
				</div>
			{:else if data.access === 'account' && data.privacy !== 'anonymous' && !anonymous}
				<label class="field">
					<span>Tu nombre <small>(opcional)</small></span>
					<input name="nombre" autocomplete="name" maxlength={NAME_MAX} {...valueOf(typed.name)} />
				</label>
			{/if}
			<FormQuestions questions={data.questions} {values} {errors} idPrefix="formulario" />
			<Button surface="sitio" type="submit" disabled={sending} busy={sending}
				>{sending ? 'Un momento…' : 'Mandar'}</Button
			>
		</form>
	{/if}
</section>

<style>
	.public-form {
		display: grid;
		gap: 0.9em;
		width: min(36rem, 100%);
		margin: 2em auto;
		border-top: 0.35rem solid var(--2);
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
	}
	.kicker {
		color: var(--muted);
		font-size: var(--step--1);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.lead,
	.privacy,
	.muted {
		color: var(--muted);
		white-space: pre-line;
	}
	form {
		display: grid;
		gap: 1.2em;
		justify-items: stretch;
		min-width: 0;
	}
	form > :global(button) {
		justify-self: start;
	}
	.trap {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	.who {
		display: grid;
		gap: 0.8em;
	}
	@media (min-width: 560px) {
		.who {
			grid-template-columns: 1fr 1fr;
		}
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}
	.field > span {
		font-weight: bold;
	}
	.field input {
		font: inherit;
		font-size: max(1rem, 16px);
		padding: 0.55em 0.7em;
		border-radius: var(--radius-s);
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: var(--surface, white);
		color: inherit;
		min-height: 2.8em;
		width: 100%;
		box-sizing: border-box;
	}
	.check {
		display: flex;
		gap: 0.5em;
		align-items: flex-start;
		font-weight: bold;
	}
	.check input {
		width: 1.2em;
		height: 1.2em;
		margin-top: 0.15em;
		flex: none;
	}
	.check small {
		display: block;
		font-weight: normal;
		color: var(--muted);
	}
	.anon {
		padding: 0.7em 0.8em;
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--2) 7%, var(--surface, white));
	}
	.field-error {
		color: var(--bad, #b00020);
		font-size: var(--step--1);
		font-weight: bold;
	}
</style>
