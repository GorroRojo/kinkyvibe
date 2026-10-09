<script>
	import { argDateLong } from '$lib/utils/dates.js';

	export let data;

	$: base = `/mi-rincon/perfiles/${data.profile.slug}`;
</script>

<svelte:head>
	<title>Respuestas · {data.event.title} · Mi rincón · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p class="back"><a href={base}>← {data.profile.title}</a></p>
	<h1>Respuestas de inscripción</h1>
	<p class="hint">
		<strong>{data.event.title}</strong>{#if data.event.start}{' · '}{argDateLong(
				data.event.start
			)}{/if}
		· como organizadore ({data.profile.title})
	</p>

	<section class="surface-card" aria-labelledby="answers-title">
		<h2 id="answers-title">
			{data.rows.length}
			{data.rows.length === 1 ? 'persona respondió' : 'personas respondieron'}
		</h2>
		<p class="hint">
			Solo las compras confirmadas. Son datos personales de quienes compraron: usalos solo para
			organizar el evento y no los compartas. Cada vez que entrás o bajás el CSV queda registrado.
		</p>
		{#if data.columns.length === 0}
			<p>Este evento no tiene preguntas de inscripción.</p>
		{:else if data.rows.length === 0}
			<p>Todavía nadie respondió.</p>
		{:else}
			<p>
				<a class="pill-btn" href="{base}/respuestas/{data.event.slug}/respuestas.csv" download>
					⬇ Bajar CSV
				</a>
			</p>
			<ul class="list">
				{#each data.rows as row, i (i)}
					<li>
						<strong>{row.name}</strong>
						<dl>
							{#each data.columns as col, j (col.id)}
								<dt>{col.label}</dt>
								<dd>{row.values[j] || '—'}</dd>
							{/each}
						</dl>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
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
	.pill-btn {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		text-decoration: none;
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
