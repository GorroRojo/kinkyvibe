<script>
	/**
	 * Tarjeta «Visitas» de una página, en las fichas del panel (evento, material, perfil,
	 * Kinkipedia) y en Estadísticas › Visitas con `?pagina=` (docs/analiticas.md, «Visitas de una
	 * página»): visitas de los últimos 7 y 30 días con un gráfico chiquito por día, de dónde llegan
	 * y, en un evento con entradas, los pasos de la compra. Solo sumas, nada de personas.
	 *
	 * Props:
	 * - `visits`: lo que da `loadPageVisits` ($lib/server/analytics/page.js), o la promesa (la
	 *   ficha la manda sin esperar: la página se ve antes y la tarjeta se llena después);
	 * - `title` (default «Visitas»);
	 * - `statsLink`: el link a Estadísticas › Visitas de esta página (default sí).
	 */
	import '$lib/admin/panel-forms.scss';
	import { ChartLine } from '@lucide/svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import Sparkline from '$lib/components/admin/charts/Sparkline.svelte';

	/** @typedef {import('$lib/server/analytics/page.js').PageVisits} PageVisits */

	/** @type {PageVisits | Promise<PageVisits> | null | undefined} */
	export let visits;
	export let title = 'Visitas';
	export let statsLink = true;

	/** Los pasos de la compra, en orden (los mismos de FUNNEL_STEPS en track.js). */
	/** @type {{ id: keyof import('$lib/server/analytics/page.js').PageFunnel, label: string }[]} */
	const STEPS = [
		{ id: 'evento', label: 'Vieron el evento' },
		{ id: 'abrio', label: 'Abrieron la compra' },
		{ id: 'datos', label: 'Llegaron a «Tus datos»' },
		{ id: 'pagar', label: 'Llegaron a «Pagar»' },
		{ id: 'orden', label: 'Crearon la orden' },
		{ id: 'aprobada', label: 'Pagaron' }
	];

	/** @param {number} x */
	const pct = (x) => `${Math.round(x * 100)} %`;
	/** @param {number} n */
	const visitas = (n) => (n === 1 ? '1 visita' : `${n} visitas`);

	/** @param {NonNullable<PageVisits['funnel']>} f */
	function funnelItems(f) {
		const base = Math.max(1, f.evento, f.abrio);
		return STEPS.map((s) => ({
			label: s.label,
			value: f[s.id],
			text: String(f[s.id]),
			sub: s.id !== 'evento' && f.evento ? `${pct(f[s.id] / f.evento)} de las visitas` : ''
		})).map((i) => ({ ...i, value: i.value / base }));
	}

	/** @param {PageVisits} v */
	const funnelEmpty = (v) => !v.funnel || STEPS.every((s) => !v.funnel?.[s.id]);
</script>

<Card {title} icon={ChartLine}>
	<svelte:fragment slot="actions">
		{#await visits then v}
			{#if statsLink && v?.statsHref && v.status === 'ok'}
				<a class="small-link" href={v.statsHref}>Ver en Estadísticas</a>
			{/if}
		{/await}
	</svelte:fragment>
	{#await visits}
		<p class="kv-note" role="status">Cargando las visitas…</p>
	{:then v}
		{#if !v}
			<p class="kv-note">No pudimos leer las visitas ahora.</p>
		{:else if v.status !== 'ok'}
			<p class="kv-note">
				{v.message}
				{#if v.status === 'unconfigured'}<a href="/admin/estadisticas/visitas">Qué falta</a>{/if}
			</p>
		{:else if v.month === 0 && funnelEmpty(v)}
			<p class="kv-note">Todavía no hay visitas anotadas en los últimos 30 días.</p>
		{:else}
			<div class="stats">
				<Stat label="Últimos 7 días" value={v.week} />
				<Stat label="Últimos 30 días" value={v.month} />
			</div>
			<Sparkline
				values={v.daily.map((d) => d.views)}
				label="Visitas por día de los últimos 30 días, del {v.daily[0]?.label ?? ''} al {v.daily[
					v.daily.length - 1
				]?.label ?? ''}: {visitas(v.month)} en total."
			/>
			<p class="axis kv-note" aria-hidden="true">
				<span>{v.daily[0]?.label ?? ''}</span><span>hoy</span>
			</p>

			{#if v.sources.length}
				<h3>De dónde llegan <small>(30 días)</small></h3>
				<BarList
					label="Visitas por sitio de origen, últimos 30 días"
					max={1}
					items={v.sources.map((s) => ({
						label: s.label,
						value: s.share,
						text: pct(s.share),
						title: `${s.label}: ${visitas(s.n)}`
					}))}
				/>
			{/if}

			{#if v.funnel}
				<h3>Pasos de la compra <small>({v.funnelDays} días)</small></h3>
				{#if funnelEmpty(v)}
					<p class="kv-note">Todavía nadie llegó a la compra.</p>
				{:else}
					<BarList
						label="Pasos de la compra, últimos {v.funnelDays} días"
						max={1}
						items={funnelItems(v.funnel)}
					/>
				{/if}
			{/if}
		{/if}
		{#if v && v.paths.length > 1}
			<p class="kv-note">Suma las visitas a {v.paths.join(', ')}.</p>
		{/if}
		{#if v?.status === 'ok'}
			<p class="kv-note">Anónimo: solo sumas de visitas, sin personas.</p>
		{/if}
	{:catch}
		<p class="kv-note">No pudimos leer las visitas ahora.</p>
	{/await}
</Card>

<style>
	.stats {
		display: grid;
		gap: var(--space-2xs);
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-bottom: var(--space-2xs);
	}
	.axis {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-xs);
		margin-top: 0.15rem;
	}
	h3 {
		font-size: var(--text-sm);
		margin: var(--space-xs) 0 var(--space-3xs);
	}
	h3 small {
		color: var(--muted);
		font-weight: 400;
	}
	.small-link {
		font-size: var(--text-xs);
	}
	p + p.kv-note {
		margin-top: var(--space-3xs);
	}
</style>
