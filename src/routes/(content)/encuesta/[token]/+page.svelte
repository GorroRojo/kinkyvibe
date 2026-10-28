<script>
	/**
	 * Encuesta después del evento (prototipo). Formulario común (sin `use:enhance`), como las otras
	 * páginas a las que lleva un link de un mail (MailLinkCard): anda sin JavaScript.
	 */
	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	/** @type {Record<string, string>} */
	let values = {};
	$: values =
		form && 'values' in form && form.values
			? /** @type {Record<string, string>} */ (form.values)
			: {};
	/*
	 * Lo elegido vuelve solo después de un error (`values`). Sin nada para devolver no se pasa
	 * `checked` ni `value`: si no, al hidratar se borraría lo que alguien ya eligió o escribió antes
	 * de que cargue el JavaScript (en un celu lento pasa).
	 */
	$: picked = (/** @type {string} */ id, /** @type {string} */ v) =>
		values[id] === v ? { checked: true } : {};
	let sending = false;
	/** @param {SubmitEvent} ev */
	function guard(ev) {
		if (sending) ev.preventDefault();
		else sending = true;
	}
</script>

<svelte:head>
	<title>Encuesta · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="survey surface-card" aria-labelledby="survey-title">
	{#if !data.valid}
		<h1 id="survey-title">Encuesta</h1>
		<p class="error" role="alert">Este link no es válido. Revisá que esté completo.</p>
	{:else if form && 'ok' in form && form.ok}
		<h1 id="survey-title">¡Gracias!</h1>
		<p class="ok" role="status">
			{#if 'repeated' in form && form.repeated}
				Ya teníamos tu respuesta: con una alcanza. ¡Gracias por tomarte el tiempo!
			{:else}
				Recibimos tu respuesta. Nos ayuda un montón para que lo próximo salga todavía mejor.
			{/if}
		</p>
		<a class="pill-btn ghost" href="/calendario">Ver lo que viene</a>
	{:else if data.answered}
		<h1 id="survey-title">Ya contestaste</h1>
		<p>Ya recibimos tu respuesta sobre <strong>{data.title}</strong>. ¡Gracias!</p>
		<a class="pill-btn ghost" href="/calendario">Ver lo que viene</a>
	{:else}
		<p class="kicker">Encuesta</p>
		<h1 id="survey-title">¿Cómo la pasaste en {data.title}?</h1>
		<p class="lead">
			Son {data.questions.length} preguntas cortas, todas opcionales. Es anónima: no guardamos quién contestó
			qué.
		</p>
		{#if form && 'error' in form && form.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST" on:submit={guard}>
			{#each data.questions as q (q.id)}
				{#if q.kind === 'rating'}
					<fieldset>
						<legend>{q.label}</legend>
						<div class="kv-segmented rating" role="radiogroup" aria-label={q.label}>
							{#each [1, 2, 3, 4, 5] as n}
								<label
									><input
										type="radio"
										name={q.id}
										value={String(n)}
										{...picked(q.id, String(n))}
									/>{n}</label
								>
							{/each}
						</div>
						<small class="scale"><span>1 = {q.low}</span><span>5 = {q.high}</span></small>
					</fieldset>
				{:else if q.kind === 'choice'}
					<fieldset>
						<legend>{q.label}</legend>
						<div class="kv-segmented" role="radiogroup" aria-label={q.label}>
							{#each q.options as o}
								<label
									><input
										type="radio"
										name={q.id}
										value={o.value}
										{...picked(q.id, o.value)}
									/>{o.label}</label
								>
							{/each}
						</div>
					</fieldset>
				{:else}
					<label class="field">
						<span>{q.label}</span>
						<textarea
							name={q.id}
							rows="3"
							maxlength={data.textMax}
							aria-describedby={q.hint ? `${q.id}-hint` : undefined}
							{...values[q.id] ? { value: values[q.id] } : {}}></textarea>
						{#if q.hint}<small id="{q.id}-hint">{q.hint}</small>{/if}
					</label>
				{/if}
			{/each}
			<button class="pill-btn" type="submit" disabled={sending} aria-busy={sending}
				>{sending ? 'Un momento…' : 'Mandar'}</button
			>
		</form>
	{/if}
</section>

<style>
	.survey {
		display: grid;
		gap: 0.9em;
		width: min(34rem, 100%);
		margin: 2em auto;
		border-top: 0.35rem solid var(--2);
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
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
	.lead {
		color: var(--muted);
	}
	form {
		display: grid;
		gap: 1.2em;
		justify-items: start;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4em;
		min-width: 0;
	}
	legend,
	.field > span {
		font-weight: 700;
		padding: 0;
		margin-bottom: 0.4em;
	}
	.rating > label {
		min-width: 2.6rem;
	}
	.scale {
		display: flex;
		justify-content: space-between;
		gap: 1em;
		color: var(--muted);
		max-width: 16rem;
	}
	.field {
		display: grid;
		gap: 0.3em;
		width: 100%;
	}
	.field small {
		color: var(--muted);
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
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
