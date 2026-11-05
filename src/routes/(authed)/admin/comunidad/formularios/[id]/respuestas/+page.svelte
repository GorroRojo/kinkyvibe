<script>
	/**
	 * Respuestas de un formulario (docs/formularios.md): resumen por pregunta (promedio y barras
	 * del puntaje, conteo de cada opción, lista de textos), cada respuesta y el CSV.
	 */
	import '$lib/admin/panel-forms.scss';
	import { Download, Inbox, Shuffle } from '@lucide/svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { Badge, Button, Card, EmptyState } from '$lib/components/ui';
	import { PRIVACY_LABELS } from '$lib/utils/formularios.js';

	/** @type {import('./$types').PageData} */
	export let data;

	$: f = data.form;
	$: title = f.kind === 'survey' ? `Encuesta: ${data.eventTitle}` : f.title;
	/** @param {number} n @param {string} one @param {string} many */
	const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
	/** @param {string} day AAAA-MM-DD */
	const dayText = (day) => {
		const [y, m, d] = day.split('-');
		return `${Number(d)}/${Number(m)}/${y.slice(2)}`;
	};
</script>

<PageHeader
	{title}
	subtitle="Respuestas · {count(data.total, 'respuesta', 'respuestas')}"
	back={{ href: `/admin/comunidad/formularios/${f.id}`, label: 'Volver al formulario' }}
>
	<svelte:fragment slot="meta">
		<Badge tone="info">{PRIVACY_LABELS[f.privacy]}</Badge>
	</svelte:fragment>
	<svelte:fragment slot="actions">
		{#if data.total}
			<Button
				variant="secondary"
				icon={Download}
				href="/admin/comunidad/formularios/{f.id}/respuestas/respuestas.csv">Bajar CSV</Button
			>
		{/if}
	</svelte:fragment>
</PageHeader>

{#if data.total === 0}
	<Card>
		<EmptyState
			icon={Inbox}
			title="Todavía no hay respuestas"
			text="Cuando alguien responda, las vas a ver acá."
		/>
	</Card>
{:else}
	<div class="kv-stack respuestas">
		<Card title="Resumen">
			<div class="summary">
				{#each data.summary as q (q.id)}
					<section class="q">
						<h3>{q.label}</h3>
						<p class="kv-note">{count(q.answered, 'respuesta', 'respuestas')}</p>
						{#if q.distribution}
							<p class="avg">
								{#if q.average !== null}
									<strong>{String(q.average).replace('.', ',')}</strong> de 5 en promedio
								{:else}—{/if}
							</p>
							<p class="kv-note">1 = {q.low} · 5 = {q.high}</p>
							<BarList
								label="Puntajes de «{q.label}»"
								items={[5, 4, 3, 2, 1].map((n) => ({
									label: String(n),
									value: q.distribution?.[n - 1] ?? 0
								}))}
							/>
						{:else if q.counts}
							<BarList
								label="Opciones de «{q.label}»"
								items={q.counts.map((/** @type {any} */ c) => ({
									label: c.option,
									value: c.count
								}))}
							/>
						{:else if q.texts}
							{#if q.texts.length}
								<ul class="texts">
									{#each q.texts as text, i (i)}<li>{text}</li>{/each}
								</ul>
							{:else}
								<p class="kv-note">Sin respuestas de texto.</p>
							{/if}
						{/if}
					</section>
				{/each}
			</div>
		</Card>

		<Card title="Cada respuesta">
			{#if data.shuffled}
				<p class="kv-note mixed">
					<Shuffle size={16} aria-hidden="true" /> Van mezcladas, no en el orden en que llegaron: así
					el orden no ayuda a saber quién mandó una anónima.
				</p>
			{/if}
			<ol class="responses">
				{#each data.responses as r, i (i)}
					<li>
						<div class="who">
							{#if r.hidden}
								<Badge>Anónima</Badge>
							{:else}
								<strong>{r.name || 'Sin nombre'}</strong>
								{#if r.pronouns}<span class="kv-note">({r.pronouns})</span>{/if}
								{#if r.email}<span class="kv-note">{r.email}</span>{/if}
							{/if}
							<span class="kv-note">{dayText(r.day)}</span>
						</div>
						<dl>
							{#each r.answers as a (a.id)}
								<dt>{a.label}</dt>
								<dd>{a.value}</dd>
							{/each}
						</dl>
					</li>
				{/each}
			</ol>
		</Card>
	</div>
{/if}

<style>
	.respuestas {
		max-width: 64rem;
	}
	.summary {
		display: grid;
		gap: var(--space-s);
	}
	@media (min-width: 900px) {
		.summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.q h3 {
		margin: 0;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.q .kv-note {
		margin: 0.15rem 0 0.4rem;
	}
	.avg {
		margin: 0 0 0.4rem;
	}
	.avg strong {
		font-size: var(--text-lg);
	}
	.texts {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.35rem;
		max-height: 18rem;
		overflow: auto;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.mixed {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.responses {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.responses > li {
		padding: var(--space-2xs) 0;
		border-top: 1px solid var(--line);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		margin-bottom: 0.35rem;
	}
	dl {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(8rem, 14rem) minmax(0, 1fr);
		gap: 0.25rem var(--space-xs);
	}
	dt {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	dd {
		margin: 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	@media (max-width: 600px) {
		dl {
			grid-template-columns: 1fr;
		}
		dd {
			margin-bottom: 0.3rem;
		}
	}
</style>
