<script>
	/**
	 * Visitas anónimas del sitio en Estadísticas → Visitas al sitio (docs/analiticas.md): visitas
	 * del período (`visits.topDays` días) por día y, de toda la historia, por mes;
	 * páginas, de dónde llegan, países, dispositivos y, por evento, «visitas → compras» con el
	 * embudo. Los datos salen de $lib/server/analytics/report.js (`loadVisits`). Props: `visits` y
	 * `period` (opcional: cómo se dice el período, «últimos 30 días»). Sin
	 * CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN muestra qué falta configurar (y la historia de D1, si hay).
	 */
	import { ChartLine } from '@lucide/svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import Chart from '$lib/components/admin/charts/Chart.svelte';
	import { VISITS_MAX_DAYS, changeText } from '$lib/admin/statsPeriod.js';

	/** @type {import('$lib/server/analytics/report.js').VisitsReport} */
	export let visits;
	/** @type {string} */
	export let period = '';

	/** @param {number} x */
	const pct = (x) => `${Math.round(x * 100)} %`;
	/** @param {string} key @param {string} label */
	const col = (key, label) => ({ key, label });

	/** @type {Record<string, string>} */
	const DEVICES = { phone: 'Celu', tablet: 'Tablet', desktop: 'Compu' };

	/** @type {Intl.DisplayNames | null} */
	let regions = null;
	try {
		regions = new Intl.DisplayNames(['es'], { type: 'region' });
	} catch {
		regions = null;
	}
	/** @param {string} code */
	function countryName(code) {
		if (!code) return 'Sin dato';
		if (code === 'T1') return 'Tor';
		if (code === 'XX') return 'Sin dato';
		try {
			return regions?.of(code) ?? code;
		} catch {
			return code;
		}
	}

	$: v = visits;
	$: live = v.configured && !v.error;
	$: hasHistory = v.months.length > 0;
	$: devicesTotal = v.devices.reduce((s, d) => s + d.n, 0);
	$: when = period || `últimos ${v.topDays} días`;
	$: vsBefore = changeText(v.totals.views, v.previousViews, {
		id: 'visitas',
		label: '',
		days: v.topDays
	});
	$: firstDay = v.daily[0]?.day ?? v.liveFrom;

	/** Pasos del embudo que se muestran en la tabla (mismo orden que FUNNEL_STEPS). */
	/** @type {{ id: 'evento' | 'abrio' | 'datos' | 'pagar' | 'orden' | 'aprobada', label: string }[]} */
	const STEPS = [
		{ id: 'evento', label: 'Vieron' },
		{ id: 'abrio', label: 'Compra' },
		{ id: 'datos', label: 'Tus datos' },
		{ id: 'pagar', label: 'Pagar' },
		{ id: 'orden', label: 'Orden' },
		{ id: 'aprobada', label: 'Pagaron' }
	];
</script>

{#if !v.configured}
	<Card>
		<EmptyState icon={ChartLine} title="Falta configurar las visitas">
			<div class="setup">
				<p>
					Las visitas se guardan en Cloudflare (Analytics Engine), pero para leerlas desde acá hay
					que cargar en <b>Workers &amp; Pages → kinkyvibe → Settings → Variables and Secrets</b>
					(en
					<b>Production</b>):
				</p>
				<ul>
					{#each v.missing as m (m.name)}
						<li><code>{m.name}</code> ({m.kind === 'Secret' ? 'Secret' : 'Text'}): {m.why}.</li>
					{/each}
				</ul>
				<p class="kv-note">
					El paso a paso está en <code>docs/analiticas.md</code>. Mientras tanto, el sitio sigue
					anotando las visitas: no se pierde nada.
				</p>
			</div>
		</EmptyState>
	</Card>
{:else if v.error}
	<p class="kv-flash warn" role="status">{v.error}</p>
{/if}

{#if live}
	<div class="kv-stats">
		<Stat
			label="Visitas"
			value={v.totals.views}
			sub={[when, vsBefore].filter(Boolean).join(' · ')}
		/>
		<Stat label="Desde el celu" value={pct(v.totals.phoneShare)} sub="de las visitas" />
		<Stat label="Países" value={v.totals.countries} sub={when} />
	</div>
{/if}

<div class="kv-stack">
	{#if live}
		<Card title="Visitas por día">
			<Chart
				title="Visitas por día desde el {firstDay}"
				rows={v.daily}
				x={{ key: 'day', label: 'día', tick: 'label' }}
				series={[{ key: 'views', label: 'Visitas' }]}
				csv="visitas-por-dia"
				empty="Todavía no hay visitas anotadas."
			/>
		</Card>
	{/if}

	{#if hasHistory}
		<Card title="Visitas por mes">
			<Chart
				title="Visitas por mes"
				rows={v.months}
				x={{ key: 'label', label: 'mes' }}
				series={[{ key: 'views', label: 'Visitas' }]}
				csv="visitas-por-mes"
				csvColumns={[col('month', 'clave')]}
				empty="Todavía no hay visitas anotadas."
			/>
			<p class="kv-note">
				Toda la historia, sin importar el período elegido. Los meses viejos salen del resumen que se
				guarda cada noche en la base (Cloudflare guarda el detalle unos 3 meses).
			</p>
		</Card>
	{/if}

	{#if live}
		<div class="kv-grid-2">
			<Card title="Páginas más vistas">
				<svelte:fragment slot="actions">
					<CsvButton
						rows={v.pages}
						columns={[col('key', 'pagina'), col('n', 'visitas')]}
						filename={csvFilename('paginas-mas-vistas')}
					/>
				</svelte:fragment>
				<BarList
					label="Visitas por página, {when}"
					items={v.pages.slice(0, 12).map((p) => ({
						label: p.key,
						value: p.n,
						text: `${p.n}`,
						href: p.key
					}))}
				/>
			</Card>

			<Card title="De dónde llegan">
				<svelte:fragment slot="actions">
					<CsvButton
						rows={v.sources}
						columns={[col('key', 'origen'), col('n', 'visitas')]}
						filename={csvFilename('origen-de-las-visitas')}
					/>
				</svelte:fragment>
				<BarList
					label="Visitas por sitio de origen, {when}"
					items={v.sources.slice(0, 12).map((s) => ({
						label: s.key || 'Directo o desde el mismo sitio',
						value: s.n,
						text: `${s.n}`
					}))}
				/>
			</Card>

			<Card title="Países">
				<BarList
					label="Visitas por país, {when}"
					items={v.countries.slice(0, 12).map((c) => ({
						label: countryName(c.key),
						value: c.n,
						text: `${c.n}`
					}))}
				/>
			</Card>

			<Card title="Dispositivos">
				<BarList
					label="Visitas por tipo de dispositivo, {when}"
					max={1}
					items={v.devices.map((d) => ({
						label: DEVICES[d.key] ?? d.key,
						value: devicesTotal ? d.n / devicesTotal : 0,
						text: pct(devicesTotal ? d.n / devicesTotal : 0),
						sub: `${d.n} visitas`
					}))}
				/>
			</Card>
		</div>
	{/if}

	{#if live || v.funnel.length}
		<Card title="Visitas → compras, por evento">
			<svelte:fragment slot="actions">
				<CsvButton
					rows={v.funnel}
					columns={[
						col('slug', 'slug'),
						col('title', 'evento'),
						...STEPS.map((s) => col(s.id, s.label)),
						col('rate', 'conversion')
					]}
					filename={csvFilename('visitas-a-compras')}
				/>
			</svelte:fragment>
			{#if v.funnel.length === 0}
				<p class="kv-note">Todavía no hay visitas a eventos anotadas.</p>
			{:else}
				<div class="kv-table-wrap">
					<table class="kv-table">
						<thead>
							<tr>
								<th>Evento</th>
								{#each STEPS as s (s.id)}<th class="r">{s.label}</th>{/each}
								<th class="r">Conversión</th>
							</tr>
						</thead>
						<tbody>
							{#each v.funnel as e (e.slug)}
								<tr>
									<td><a href={eventPanelLink(e.slug, { tickets: true })}>{e.title}</a></td>
									{#each STEPS as s (s.id)}<td class="r num">{e[s.id]}</td>{/each}
									<td class="r num" title="Compras pagadas sobre visitas a la página del evento"
										>{e.rate === null ? '—' : pct(e.rate)}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<p class="kv-note">
				«Vieron»: visitas a la página del evento. «Compra»: a la página de compra. «Tus datos» y
				«Pagar»: llegaron a ese paso. «Orden»: la crearon (cualquier medio). «Pagaron»: aprobada.
				Cada paso cuenta visitas, no personas.
			</p>
		</Card>
	{/if}

	<p class="kv-note">
		Cloudflare guarda el detalle de las visitas unos 3 meses: por eso el período llega hasta
		{VISITS_MAX_DAYS} días. Más atrás solo quedan los totales por mes («Visitas por mes»). «Visitas →
		compras» suma toda la historia guardada.
	</p>
	<p class="kv-note">
		Anónimo: sin IP, sin cookies y sin cuentas; no cuenta bots conocidos ni el panel. Qué se guarda
		y qué no, en <code>docs/analiticas.md</code>.
	</p>
</div>

<style>
	.setup {
		text-align: left;
		max-width: 38rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.setup p,
	.setup ul {
		margin: 0;
	}
	.setup ul {
		padding-left: 1.2rem;
	}
	code {
		font-size: 0.9em;
		word-break: break-word;
	}
	th.r,
	td.r {
		text-align: right;
	}
</style>
