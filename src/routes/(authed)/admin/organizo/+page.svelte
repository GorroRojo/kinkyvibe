<script>
	/** «Tus eventos» (organizadores en el panel): ver +page.server.js. */
	import { Card, PageHeader } from '$lib/components/ui';
	import { eventHref } from '$lib/admin/nav.js';
	import { fmtDateTime } from '$lib/admin/format.js';

	/** @type {import('./$types').PageData} */
	export let data;
</script>

<PageHeader title="Tus eventos" subtitle="Los eventos publicados que organizás." />

<!-- Siempre hay al menos uno: sin eventos, la cuenta no entra al panel como organizadore. -->
<ul class="events">
	{#each data.events as e (e.slug)}
		<li>
			<Card>
				<a class="title" href={eventHref(e.slug)}>{e.title}</a>
				<p class="muted">
					{e.start ? `${fmtDateTime(e.start)} · ` : ''}Organizás como {e.profiles.join(', ')}
				</p>
				<p class="links">
					<a class="kv-btn small" href={eventHref(e.slug, 'ventas')}>Ventas</a>
					<a class="kv-btn small ghost" href={eventHref(e.slug, 'ingreso')}>Puerta</a>
					<a class="kv-btn small ghost" href={eventHref(e.slug, 'editar')}>Editar</a>
				</p>
			</Card>
		</li>
	{/each}
</ul>

<style>
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-s, 1rem);
	}
	.title {
		font-weight: 600;
		font-size: var(--step-1, 1.2rem);
	}
	p {
		margin: 0.35rem 0 0;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
</style>
