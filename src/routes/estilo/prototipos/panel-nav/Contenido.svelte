<script>
	/**
	 * El contenido de cada pantalla de los prototipos de navegación (el mismo en A, B y C, para
	 * comparar solo la navegación): encabezado de la sección con su botón de crear, sus pestañas y
	 * una página con datos inventados, o la ficha de un evento con sus pestañas.
	 *
	 * Props: `secciones` (mapa de la opción), `estado` (de la URL), `pestanasEvento` y
	 * `pestanasEventoMas` (las de la ficha; las de «Más» solo en C), `tabsArriba`: 'siempre' |
	 * 'angosto' (B: en la compu las páginas de la sección están en la barra lateral).
	 */
	import { ArrowLeft, Check, ChevronDown, Plus, ScanLine, UserCheck } from '@lucide/svelte';
	import { Badge, Button, Card, Table, Tabs } from '$lib/components/ui';
	import { EVENTO, EVENTOS, ORDENES, PUERTA, VENTAS_SEMANA } from './datos.js';
	import { enlace, pestanaActiva } from './estado.js';

	/** @type {import('./datos.js').Seccion[]} */
	export let secciones;
	/** @type {import('./estado.js').Estado} */
	export let estado;
	/** @type {import('./datos.js').Pestana[]} */
	export let pestanasEvento;
	/** @type {import('./datos.js').Pestana[]} */
	export let pestanasEventoMas = [];
	/** @type {'siempre' | 'angosto'} */
	export let tabsArriba = 'siempre';

	$: seccion = secciones.find((x) => x.id === estado.s) ?? secciones[0];
	$: tab = pestanaActiva(seccion, estado.t);
	$: tabDef = seccion.tabs.find((x) => x.id === tab);
	$: evento = estado.e ? (EVENTOS.find((x) => x.slug === estado.e) ?? EVENTO) : null;
	$: todasEvento = [...pestanasEvento, ...pestanasEventoMas];
	$: et = todasEvento.some((x) => x.id === estado.et) ? estado.et : todasEvento[0].id;
	$: etDef = todasEvento.find((x) => x.id === et);
	$: enMas = pestanasEventoMas.some((x) => x.id === et);
	/** La pantalla que se dibuja: `evento:<pestaña>` o `<sección>:<pestaña>`. */
	$: pantalla = evento ? `evento:${et}` : `${seccion.id}:${tab}`;
	// En Ajustes, la página suelta que eligió (B la elige desde la barra lateral).
	$: parte = tabDef?.partes?.find((p) => p.id === estado.t);

	$: tabs = seccion.tabs.map((x) => ({
		href: enlace(estado, { s: seccion.id, t: x.id }),
		label: x.label,
		icon: x.icon,
		count: x.count
	}));
	$: tabActual = enlace(estado, { s: seccion.id, t: tab });
	$: tabsEv = pestanasEvento.map((x) => ({
		href: enlace(estado, { e: evento?.slug ?? '', et: x.id }),
		label: x.label,
		icon: x.icon
	}));
	$: tabEvActual = enlace(estado, { e: evento?.slug ?? '', et });

	let masAbierto = false;
	$: if (pantalla) masAbierto = false;

	/** Ingresos marcados en la puerta (estado local). */
	/** @type {Record<string, boolean>} */
	let adentro = { p1: true, p2: true };
	$: nAdentro = PUERTA.filter((p) => adentro[p.id]).length;

	const columnasOrdenes = [
		{ key: 'id', label: 'Orden' },
		{ key: 'nombre', label: 'Quién' },
		{ key: 'entradas', label: 'Entradas', align: /** @type {'right'} */ ('right') },
		{ key: 'tipo', label: 'Tipo' },
		{ key: 'estado', label: 'Estado' }
	];
	$: filasVentas = ORDENES.map((o) => ({ ...o, evento: EVENTO.nombre }));
	const columnasVentas = [
		{ key: 'id', label: 'Orden' },
		{ key: 'evento', label: 'Evento' },
		{ key: 'nombre', label: 'Quién' },
		{ key: 'estado', label: 'Estado' }
	];
	const maxSemana = Math.max(...VENTAS_SEMANA.map((v) => v.n));
</script>

<div class="contenido">
	{#if evento}
		<header class="head">
			<a class="back kv-link" href={enlace(estado, { s: 'eventos', e: '', t: 'proximos' })}
				><ArrowLeft size={16} aria-hidden="true" />Eventos</a
			>
			<div class="row">
				<h2>{evento.nombre}</h2>
				<Badge tone="ok">A la venta</Badge>
			</div>
			<p class="sub">{evento.fecha} · {evento.lugar}</p>
		</header>
		<div class="tabs-ev">
			<Tabs tabs={tabsEv} current={enMas ? '' : tabEvActual} label="Pestañas del evento" />
			{#if pestanasEventoMas.length}
				<div class="mas-ev">
					<button
						type="button"
						class="tab-mas"
						class:on={enMas}
						aria-expanded={masAbierto}
						on:click={() => (masAbierto = !masAbierto)}
						>{enMas ? etDef?.label : 'Más'}<ChevronDown size={16} aria-hidden="true" /></button
					>
					{#if masAbierto}
						<ul class="menu" role="list">
							{#each pestanasEventoMas as p (p.id)}
								<li>
									<a href={enlace(estado, { e: evento.slug, et: p.id })}
										><svelte:component this={p.icon} size={16} aria-hidden="true" />{p.label}</a
									>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{:else if tab === 'crear' || tab === 'importar'}
		<header class="head">
			<a class="back kv-link" href={enlace(estado, { s: seccion.id, t: seccion.tabs[0].id })}
				><ArrowLeft size={16} aria-hidden="true" />{seccion.label}</a
			>
			<h2>{tab === 'crear' ? 'Crear evento' : 'Importar planilla de eventos'}</h2>
		</header>
	{:else}
		<header class="head">
			<div class="row">
				<h2>{seccion.label}</h2>
				{#if seccion.accion}
					<span class="accion">
						<Button icon={Plus} href={enlace(estado, { s: seccion.id, t: seccion.accion.t })}
							>{seccion.accion.label}</Button
						>
					</span>
				{/if}
			</div>
		</header>
		{#if seccion.tabs.length > 1}
			<div class="tabs-sec" class:solo-angosto={tabsArriba === 'angosto'}>
				<Tabs {tabs} current={tabActual} label="Pestañas de {seccion.label}" />
			</div>
		{/if}
	{/if}

	<div class="cuerpo">
		{#if pantalla === 'inicio:hoy'}
			<div class="grilla-cards">
				<Card title="Lo que viene" icon={ScanLine}>
					<p class="evento-linea">
						<strong>{EVENTO.nombre}</strong><br />{EVENTO.fecha} · {EVENTO.vendidas} de {EVENTO.cupo}
						entradas
					</p>
					<div class="botones">
						<Button
							size="small"
							href={secciones.some((x) => x.id === 'puerta')
								? enlace(estado, { s: 'puerta', t: 'hoy' })
								: enlace(estado, { s: 'eventos', t: 'puerta' })}>Abrir la Puerta</Button
						>
						<Button
							size="small"
							variant="secondary"
							href={enlace(estado, { s: 'eventos', e: EVENTO.slug, et: 'ordenes' })}
							>Ver órdenes</Button
						>
					</div>
				</Card>
				<Card title="Para revisar" status="warn">
					<p>
						{EVENTO.transferencias} transferencias esperan que alguien confirme que llegó la plata.
					</p>
					<Button
						size="small"
						variant="secondary"
						href={enlace(estado, { s: 'ventas', t: 'transferencias' })}>Revisar</Button
					>
				</Card>
				<Card title="Esta semana">
					<p class="numero">{VENTAS_SEMANA[VENTAS_SEMANA.length - 1].n}</p>
					<p class="muted">entradas vendidas</p>
				</Card>
			</div>
		{:else if pantalla === 'eventos:proximos'}
			<ul class="lista">
				{#each EVENTOS as ev (ev.slug)}
					<li>
						<a href={enlace(estado, { s: 'eventos', e: ev.slug, et: '' })}>
							<strong>{ev.nombre}</strong>
							<span class="muted">{ev.fecha} · {ev.lugar}</span>
							{#if ev.cupo}<span class="chip">{ev.vendidas}/{ev.cupo}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		{:else if pantalla === 'eventos:puerta' || pantalla === 'puerta:hoy' || pantalla === 'evento:puerta'}
			<Card>
				<div class="puerta-head">
					<div>
						<strong>{EVENTO.nombre}</strong>
						<span class="muted">· hoy</span>
					</div>
					<span class="chip">{nAdentro} de {PUERTA.length} adentro</span>
				</div>
				<ul class="puerta">
					{#each PUERTA as p (p.id)}
						<li class:ok={adentro[p.id]}>
							<span class="quien"
								><strong>{p.nombre}</strong><span class="muted">{p.tipo} · DNI {p.dni}</span></span
							>
							{#if adentro[p.id]}
								<button
									type="button"
									class="kv-btn small ghost"
									on:click={() => (adentro = { ...adentro, [p.id]: false })}
									><Check size={16} aria-hidden="true" />Adentro</button
								>
							{:else}
								<button
									type="button"
									class="kv-btn small"
									on:click={() => (adentro = { ...adentro, [p.id]: true })}
									><UserCheck size={16} aria-hidden="true" />Marcar ingreso</button
								>
							{/if}
						</li>
					{/each}
				</ul>
			</Card>
		{:else if pantalla === 'evento:resumen'}
			<div class="grilla-cards">
				<Card title="Entradas"
					><p class="numero">{EVENTO.vendidas}<span class="muted"> / {EVENTO.cupo}</span></p></Card
				>
				<Card title="Recaudado"><p class="numero">{EVENTO.recaudado}</p></Card>
				<Card title="Transferencias" status="warn"
					><p class="numero">{EVENTO.transferencias}</p>
					<p class="muted">sin confirmar</p></Card
				>
			</div>
		{:else if pantalla === 'evento:ordenes' || pantalla === 'evento:ventas'}
			<Card>
				<Table columns={columnasOrdenes} rows={ORDENES} rowKey="id" caption="Órdenes del evento" />
			</Card>
		{:else if pantalla === 'ventas:todas'}
			<Card>
				<Table columns={columnasVentas} rows={filasVentas} rowKey="id" caption="Todas las ventas" />
			</Card>
		{:else if pantalla === 'ventas:transferencias' || pantalla === 'evento:transferencias'}
			<Card>
				<ul class="puerta">
					{#each ORDENES.slice(2, 4) as o (o.id)}
						<li>
							<span class="quien"
								><strong>{o.nombre}</strong><span class="muted"
									>{o.id} · {EVENTO.nombre} · {o.entradas} entrada{o.entradas > 1 ? 's' : ''}</span
								></span
							>
							<button type="button" class="kv-btn small">Llegó la plata</button>
						</li>
					{/each}
				</ul>
			</Card>
		{:else if pantalla === 'estadisticas:ventas'}
			<Card title="Entradas vendidas por semana">
				<div class="barras" role="img" aria-label="Entradas por semana (inventadas)">
					{#each VENTAS_SEMANA as v (v.semana)}
						<div class="barra">
							<span class="n">{v.n}</span>
							<span class="b" style="height: {(v.n / maxSemana) * 100}%"></span>
							<span class="muted">{v.semana}</span>
						</div>
					{/each}
				</div>
			</Card>
		{:else if seccion.id === 'ajustes' && !evento && tabDef?.partes}
			<div class="grilla-cards">
				{#each parte ? [parte] : tabDef.partes as p (p.id)}
					<Card title={p.label} icon={p.icon}>
						<p class="muted">Pantalla de ejemplo: acá van los ajustes de «{p.label}».</p>
						<label class="switch-linea"
							><input type="checkbox" role="switch" checked /> Algo prendido</label
						>
					</Card>
				{/each}
			</div>
		{:else if pantalla === 'eventos:crear'}
			<Card>
				<div class="form">
					<label>Nombre<input class="kv-input" placeholder="Ej.: Fiesta de Primavera" /></label>
					<label>Fecha<input class="kv-input" type="date" /></label>
					<div class="botones"><Button>Crear borrador</Button></div>
				</div>
			</Card>
		{:else}
			<Card title={evento ? etDef?.label : tab === 'importar' ? 'Planilla' : tabDef?.label}>
				<p class="muted">
					Pantalla de ejemplo (el contenido de verdad no cambia con la navegación).
				</p>
				<ul class="filas">
					<li>Fila de ejemplo 1</li>
					<li>Fila de ejemplo 2</li>
					<li>Fila de ejemplo 3</li>
				</ul>
			</Card>
		{/if}
	</div>
</div>

<style>
	.contenido {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		min-width: 0;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	h2 {
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.15;
	}
	.accion {
		margin-left: auto;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
	}
	.sub,
	.muted {
		color: var(--muted);
		font-size: var(--text-sm);
		margin: 0;
	}
	.tabs-sec :global(.tabs-wrap),
	.tabs-ev :global(.tabs-wrap) {
		margin-bottom: 0;
	}
	.tabs-ev {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.tabs-ev > :global(.tabs-wrap) {
		flex: 0 1 auto;
		min-width: 0;
	}
	.mas-ev {
		position: relative;
		flex: none;
	}
	.tab-mas {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		padding: var(--space-2xs) var(--space-xs);
		border: 0;
		border-radius: var(--round);
		background: none;
		font: inherit;
		font-weight: 700;
		color: var(--accent);
		cursor: pointer;
	}
	.tab-mas.on {
		background: var(--surface);
		color: var(--link);
		box-shadow: var(--shadow-1);
	}
	.menu {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 3;
		margin: var(--space-3xs) 0 0;
		padding: var(--space-3xs);
		list-style: none;
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-2);
		min-width: 12rem;
	}
	.menu a {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--round);
		color: var(--accent);
		font-weight: 700;
		text-decoration: none;
	}
	.menu a:hover {
		background: var(--surface-2);
	}
	.cuerpo {
		margin-top: var(--space-2xs);
	}
	.grilla-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: var(--space-xs);
	}
	.grilla-cards p {
		margin: 0 0 var(--space-2xs);
	}
	.numero {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--link);
	}
	.botones {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	.lista {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.lista a {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-3xs) var(--space-xs);
		padding: var(--space-xs) var(--space-s);
		background: var(--surface);
		border-radius: var(--card-round);
		box-shadow: var(--shadow);
		color: var(--text);
		text-decoration: none;
	}
	.lista a:hover {
		box-shadow: var(--shadow-2);
	}
	.lista strong {
		color: var(--accent-text);
	}
	.chip {
		margin-left: auto;
		font-size: var(--text-xs);
		font-weight: 700;
		padding: 0 0.6em;
		border-radius: var(--radius-pill);
		background: var(--link-bg);
		color: var(--link);
		white-space: nowrap;
	}
	.puerta-head {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		margin-bottom: var(--space-2xs);
	}
	.puerta {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.puerta li {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-2xs) 0;
		border-top: 1px solid var(--line);
	}
	.puerta li.ok .quien strong {
		color: var(--ok);
	}
	.quien {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.barras {
		display: flex;
		align-items: flex-end;
		gap: var(--space-xs);
		height: 10rem;
	}
	.barra {
		flex: 1;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3xs);
	}
	.barra .b {
		width: 100%;
		max-width: 3rem;
		background: var(--link);
		border-radius: var(--radius-s) var(--radius-s) 0 0;
	}
	.barra .n {
		font-size: var(--text-xs);
		font-weight: 700;
	}
	.switch-linea {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		font-size: var(--text-sm);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		max-width: 28rem;
	}
	.form label {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-weight: 700;
		font-size: var(--text-sm);
	}
	.filas {
		margin: var(--space-2xs) 0 0;
		padding-left: 1.2em;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.evento-linea {
		font-size: var(--text-sm);
	}
	/* B: en la compu las páginas de la sección están en la barra lateral. */
	@container pantalla (min-width: 1000px) {
		.solo-angosto {
			display: none;
		}
	}
</style>
