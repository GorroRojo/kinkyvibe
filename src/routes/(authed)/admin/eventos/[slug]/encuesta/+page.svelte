<script>
	/**
	 * Mails › Encuesta, en la ficha del evento (prototipo; ver +page.server.js): estado del envío,
	 * resumen de las respuestas (anónimas) y vista previa del mail.
	 */
	import { enhance } from '$app/forms';
	import { ClipboardList } from '@lucide/svelte';
	import { Card, EmptyState, Notice } from '$lib/components/ui';
	import { argDateList } from '$lib/utils/dates.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: s = data.summary;
	$: maxBar = Math.max(1, ...s.distribution);
	$: textQuestions = data.questions.filter((q) => q.kind === 'text');
	$: choiceQuestions = data.questions.filter((q) => q.kind === 'choice');
	/** @param {number} n */
	const people = (n) => (n === 1 ? '1 persona' : `${n} personas`);
	/** @param {number} n */
	const responsesLabel = (n) => (n === 1 ? '1 respuesta' : `${n} respuestas`);

	$: status = !data.enabled
		? 'La encuesta está apagada en Ajustes → Interruptores (prueba).'
		: data.cancelled
			? 'El evento está cancelado: no se manda la encuesta.'
			: !data.eventSurvey
				? 'Este evento no la manda (se cambia en Editar → Entradas → «Mandar la encuesta después del evento»).'
				: data.due === null
					? 'El evento no tiene fecha.'
					: data.due > data.now
						? `Sale ${argDateList(data.due, { now: data.now })}, a quienes tengan entrada aprobada.`
						: data.lastDay !== null && data.lastDay > data.now
							? `Está saliendo (desde ${argDateList(data.due, { now: data.now })}).`
							: `Ya pasó el plazo para mandarla (salía ${argDateList(data.due, { now: data.now })}).`;
</script>

<div class="survey-panel">
	<Notice tone="warn">
		<b>Prototipo.</b> Las preguntas y el mail son fijos y las respuestas todavía no se guardan en la
		base: {data.storeAvailable
			? 'en este servidor de desarrollo viven en memoria y se pierden al reiniciarlo.'
			: 'fuera de desarrollo no se manda nada.'}
	</Notice>

	<Card title="Envío" icon={ClipboardList}>
		<p>{status}</p>
		{#if data.counts}
			<p class="muted">
				Le salió a {people(data.counts.sent)} de {people(data.counts.orders)} con entrada{#if data.counts.pending}
					· {data.counts.pending} en camino{/if}{#if data.counts.failed}
					· <span class="bad">{data.counts.failed} no salieron</span>{/if}.
			</p>
		{/if}
		{#if data.dev && data.enabled}
			<form method="POST" action="?/mandar" use:enhance>
				<button class="kv-btn ghost" type="submit">Mandarla ahora (solo en desarrollo)</button>
			</form>
			{#if form && 'sent' in form}
				<p role="status" class="muted">
					Listo: {form.sent} enviados{#if form.failed}, {form.failed} fallaron{/if}. Los mails están
					en la consola del servidor.
				</p>
			{:else if form && 'error' in form}
				<p role="alert" class="bad">{form.error}</p>
			{/if}
		{/if}
	</Card>

	{#if s.total === 0}
		<EmptyState
			icon={ClipboardList}
			title="Todavía no hay respuestas"
			text="Cuando alguien conteste la encuesta, acá vas a ver el promedio y lo que escribieron. No se ve quién contestó."
		/>
	{:else}
		<Card title="Respuestas">
			<div class="stats">
				<div class="stat">
					<span class="num">{s.total}</span>
					<span class="lbl">{s.total === 1 ? 'respuesta' : 'respuestas'}</span>
				</div>
				<div class="stat">
					<span class="num"
						>{s.ratingAverage === null ? '–' : String(s.ratingAverage).replace('.', ',')}</span
					>
					<span class="lbl"
						>puntaje promedio (de 5){#if s.ratingCount}, {s.ratingCount} lo puntuaron{/if}</span
					>
				</div>
				{#if data.counts?.sent}
					<div class="stat">
						<span class="num">{Math.round((s.total / data.counts.sent) * 100)} %</span>
						<span class="lbl">contestó</span>
					</div>
				{/if}
			</div>
			<h3>¿Cómo la pasaste?</h3>
			<ul class="bars" aria-label="Puntajes">
				{#each s.distribution as n, i}
					<li>
						<span class="k">{i + 1}</span>
						<span class="bar"><span style="width:{(n / maxBar) * 100}%"></span></span>
						<span class="v">{n}</span>
					</li>
				{/each}
			</ul>
			{#each choiceQuestions as q (q.id)}
				{#if q.kind === 'choice'}
					<h3>{q.label}</h3>
					<p class="choices">
						{#each q.options as o, i}{i > 0 ? ' · ' : ''}{o.label}:
							<b>{s.choices[q.id][o.value]}</b>{/each}
					</p>
				{/if}
			{/each}
		</Card>

		{#each textQuestions as q (q.id)}
			<Card title={q.label}>
				{#if s.texts[q.id].length}
					<p class="muted">{responsesLabel(s.texts[q.id].length)}</p>
					<ul class="texts">
						{#each s.texts[q.id] as t}<li>{t}</li>{/each}
					</ul>
				{:else}
					<p class="muted">Nadie escribió acá todavía.</p>
				{/if}
			</Card>
		{/each}
	{/if}

	<Card title="Así se ve el mail">
		<p class="muted">Asunto: «{data.preview.subject}»</p>
		<iframe title="Vista previa del mail de la encuesta" srcdoc={data.preview.html} sandbox=""
		></iframe>
	</Card>
</div>

<style>
	.survey-panel {
		display: grid;
		gap: var(--space-s, 1rem);
	}
	p {
		margin: 0 0 0.5em;
	}
	.muted {
		color: var(--muted);
	}
	.bad {
		color: var(--1-ink);
		font-weight: 700;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5em;
		margin-bottom: 1em;
	}
	.stat {
		display: grid;
	}
	.num {
		font-size: var(--step-3, 2rem);
		font-weight: 700;
		line-height: 1.1;
	}
	.lbl {
		color: var(--muted);
		font-size: var(--step--1);
	}
	h3 {
		margin: 1em 0 0.4em;
		font-size: var(--step-0);
	}
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3em;
		max-width: 28rem;
	}
	.bars li {
		display: grid;
		grid-template-columns: 1.5em 1fr 2.5em;
		align-items: center;
		gap: 0.5em;
	}
	.bar {
		background: var(--line, #eee);
		border-radius: 999px;
		height: 0.7em;
		overflow: hidden;
	}
	.bar > span {
		display: block;
		height: 100%;
		background: var(--1);
	}
	.v {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.texts {
		margin: 0;
		padding-left: 1.2em;
		display: grid;
		gap: 0.5em;
		white-space: pre-line;
	}
	iframe {
		width: 100%;
		height: 640px;
		border: 1px solid var(--line, #ddd);
		border-radius: var(--radius-s, 8px);
		background: #fff;
	}
</style>
