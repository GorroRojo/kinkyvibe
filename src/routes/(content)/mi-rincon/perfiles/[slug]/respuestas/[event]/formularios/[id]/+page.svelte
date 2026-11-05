<script>
	import Button from '$lib/components/ui/Button.svelte';
	import { argDateLong } from '$lib/utils/dates.js';

	export let data;

	$: base = `/mi-rincon/perfiles/${data.profile.slug}/respuestas/${data.event.slug}`;
	$: title = data.form.kind === 'survey' ? 'Encuesta de después del evento' : data.form.title;
	/** @param {number} n @param {string} one @param {string} many */
	const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
</script>

<svelte:head>
	<title>{title} · {data.event.title} · Mi rincón · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p class="back"><a href={base}>← Respuestas de {data.event.title}</a></p>
	<h1>{title}</h1>
	<p class="hint">
		<strong>{data.event.title}</strong>{#if data.event.start}{' · '}{argDateLong(
				data.event.start
			)}{/if}
		· como organizadore ({data.profile.title})
	</p>

	<section class="surface-card" aria-labelledby="summary-title">
		<h2 id="summary-title">{count(data.total, 'respuesta', 'respuestas')}</h2>
		<p class="hint">
			Usalas solo para organizar y mejorar el evento, y no las compartas. Cada vez que entrás o
			bajás el CSV queda registrado.
		</p>
		{#if data.total === 0}
			<p>Todavía nadie respondió.</p>
		{:else}
			<p>
				<Button surface="sitio" href="{base}/formularios/{data.form.id}/respuestas.csv"
					>Bajar CSV</Button
				>
			</p>
			{#each data.summary as q (q.id)}
				<div class="q">
					<h3>{q.label}</h3>
					{#if q.distribution}
						<p>
							{#if q.average !== null && q.average !== undefined}<strong
									>{String(q.average).replace('.', ',')}</strong
								> de 5 en promedio ·
							{/if}{count(q.answered, 'respuesta', 'respuestas')} · 1 = {q.low} · 5 = {q.high}
						</p>
						<ul class="bars">
							{#each [5, 4, 3, 2, 1] as n (n)}
								<li>{n}: {q.distribution[n - 1]}</li>
							{/each}
						</ul>
					{:else if q.counts}
						<ul class="bars">
							{#each q.counts as c (c.option)}<li>{c.option}: {c.count}</li>{/each}
						</ul>
					{:else if q.texts?.length}
						<ul class="texts">
							{#each q.texts as text, i (i)}<li>{text}</li>{/each}
						</ul>
					{:else}
						<p class="hint">Sin respuestas de texto.</p>
					{/if}
				</div>
			{/each}
		{/if}
	</section>

	{#if data.total}
		<section class="surface-card" aria-labelledby="list-title">
			<h2 id="list-title">Cada respuesta</h2>
			{#if data.shuffled}
				<p class="hint">Van mezcladas, no en el orden en que llegaron.</p>
			{/if}
			<ul class="list">
				{#each data.responses as r, i (i)}
					<li>
						<strong>{r.hidden ? 'Anónima' : r.name || 'Sin nombre'}</strong
						>{#if !r.hidden && r.pronouns}
							({r.pronouns}){/if}
						<dl>
							{#each r.answers as a (a.id)}
								<dt>{a.label}</dt>
								<dd>{a.value}</dd>
							{/each}
						</dl>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		width: min(40rem, 100%);
		margin: 1.5em auto;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
		overflow-wrap: anywhere;
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-1);
	}
	h3 {
		margin: 0.6em 0 0.2em;
		font-size: var(--step-0);
		overflow-wrap: anywhere;
	}
	section {
		display: grid;
		gap: 0.6em;
	}
	p {
		margin: 0;
	}
	.back a {
		color: var(--2-dark);
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.bars,
	.texts {
		margin: 0;
		padding-left: 1.2em;
		display: grid;
		gap: 0.2em;
	}
	.texts {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.8em;
	}
	.list li {
		display: grid;
		gap: 0.3em;
		padding-bottom: 0.8em;
		border-bottom: 1px solid var(--line);
		overflow-wrap: anywhere;
	}
	dl {
		display: grid;
		gap: 0.15em;
		margin: 0;
	}
	dt {
		color: var(--muted);
		font-size: var(--step--1);
	}
	dd {
		margin: 0 0 0.4em;
		white-space: pre-wrap;
	}
</style>
