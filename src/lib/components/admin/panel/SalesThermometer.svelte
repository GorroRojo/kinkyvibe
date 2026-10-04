<script>
	/**
	 * Termómetro de ventas: entradas vendidas acumuladas desde que abrió la venta hasta el evento,
	 * apiladas por canal, con el cupo, "hoy", los cierres de tipos, la estimación al ritmo reciente
	 * y (opcional) la edición anterior alineada por días antes del evento.
	 *
	 * Props: `chart` (lo que arma `buildSalesChart` de $lib/admin/salesChart.js); `progress`
	 * (opcional): el avance contra la meta de venta ($lib/utils/salesGoal.js); si la meta es en
	 * entradas, además una línea «meta N».
	 * Con el teclado: foco en el gráfico y flechas ←/→ (Inicio/Fin) para recorrer los días.
	 */
	import { CHANNELS, CHANNEL_LABELS, dayShort } from '$lib/admin/salesChart.js';

	/** @type {import('$lib/admin/salesChart.js').SalesChart} */
	export let chart;
	/** @type {import('$lib/utils/salesGoal.js').GoalProgress | null} */
	export let progress = null;

	let width = 640;
	let showPrevious = true;
	/** @type {number | null} día elegido (hover o teclado) */
	let active = null;

	$: c = chart;
	$: compact = width < 520;
	$: W = Math.max(280, Math.round(width));
	$: H = compact ? 210 : 270;
	$: PAD = { l: 34, r: compact ? 14 : 70, t: compact ? 16 : 30, b: 26 };
	$: span = Math.max(1, c.to - c.from);
	$: plotW = W - PAD.l - PAD.r;
	$: x = (/** @type {number} */ day) => PAD.l + ((day - c.from) / span) * plotW;

	$: prev = showPrevious ? c.previous : null;
	$: goalLine = progress?.kind === 'entradas' ? progress.target : null;
	$: maxY = Math.max(
		4,
		c.capacity ?? 0,
		goalLine ?? 0,
		c.sold,
		c.projection?.final ?? 0,
		c.previous ? Math.max(...c.previous.points.map((p) => p.total)) : 0
	);
	$: step = niceStep(maxY, compact ? 3 : 4);
	$: top = Math.ceil((maxY * 1.04) / step) * step;
	$: ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
	$: y = (/** @type {number} */ v) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);

	$: last = c.series[c.series.length - 1];
	$: showToday = c.today >= c.from && c.today < c.to;

	// Bandas apiladas por canal (de abajo hacia arriba, en el orden fijo de CHANNELS).
	$: bands = bandPaths(c, x, y);

	/**
	 * @param {typeof chart} c
	 * @param {(d: number) => number} x
	 * @param {(v: number) => number} y
	 */
	function bandPaths(c, x, y) {
		/** @type {{ channel: string, area: string, line: string }[]} */
		const out = [];
		if (!c.series.length) return out;
		let lower = c.series.map(() => 0);
		for (const ch of CHANNELS) {
			if (!c.channels.includes(ch)) continue;
			const upper = c.series.map((p, i) => lower[i] + p[ch]);
			// Un solo día: un trazo corto para que se vea algo.
			const xs = c.series.length === 1 ? [x(c.series[0].day) - 3, x(c.series[0].day) + 3] : null;
			const pts = (/** @type {number[]} */ vals) =>
				xs
					? xs.map((px) => `${px.toFixed(1)},${y(vals[0]).toFixed(1)}`)
					: c.series.map((p, i) => `${x(p.day).toFixed(1)},${y(vals[i]).toFixed(1)}`);
			const up = pts(upper);
			const down = pts(lower).reverse();
			out.push({
				channel: ch,
				area: `M${up.join('L')}L${down.join('L')}Z`,
				line: `M${up.join('L')}`
			});
			lower = upper;
		}
		return out;
	}

	$: linePath = (/** @type {{ day: number, total: number }[]} */ pts) =>
		'M' + pts.map((p) => `${x(p.day).toFixed(1)},${y(p.total).toFixed(1)}`).join('L');

	/** @param {number} max @param {number} n */
	function niceStep(max, n) {
		const raw = max / n;
		const pow = 10 ** Math.floor(Math.log10(raw));
		for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow;
		return 10 * pow;
	}

	// Etiquetas del eje x: la apertura, el evento y "hoy", más algunas en el medio que no choquen.
	$: xTicks = xTickList(c, compact, x);

	/**
	 * @param {typeof chart} c
	 * @param {boolean} compact
	 * @param {(d: number) => number} px
	 */
	function xTickList(c, compact, px) {
		/** @typedef {{ day: number, label: string, anchor: 'start' | 'middle' | 'end', strong?: boolean }} Tick */
		/** @type {Tick[]} en orden de prioridad: hoy, el evento, la apertura, el resto */
		const wanted = [];
		if (c.today > c.from && c.today < c.to)
			wanted.push({ day: c.today, label: 'hoy', anchor: 'middle', strong: true });
		if (c.to !== c.from) {
			const strong = c.eventDay === c.to;
			if (strong)
				wanted.push({ day: c.to, label: `evento ${dayShort(c.to)}`, anchor: 'end', strong });
			// Si "evento 17/10" no entra (celu, hoy cerca del evento), la fecha sola.
			wanted.push({ day: c.to, label: dayShort(c.to), anchor: 'end', strong });
		}
		wanted.push({ day: c.from, label: dayShort(c.from), anchor: 'start' });
		const minGap = compact ? 44 : 60;
		const every = [1, 2, 7, 14, 28, 56].find((n) => px(c.from + n) - px(c.from) >= minGap) ?? 56;
		for (let d = c.from + every; d < c.to; d += every)
			wanted.push({ day: d, label: dayShort(d), anchor: 'middle' });
		// Ancho aproximado del texto (11 px): alcanza para que no se pisen.
		const extent = (/** @type {Tick} */ t) => {
			const w = t.label.length * (t.strong ? 6.6 : 6.1);
			const at = px(t.day);
			const left = t.anchor === 'start' ? at : t.anchor === 'end' ? at - w : at - w / 2;
			return [left - 6, left + w + 6];
		};
		/** @type {Tick[]} */
		const out = [];
		for (const t of wanted) {
			const [l, r] = extent(t);
			if (out.some((o) => o.day === t.day)) continue;
			if (
				out.every((o) => {
					const [ol, or] = extent(o);
					return r <= ol || l >= or;
				})
			)
				out.push(t);
		}
		return out;
	}

	// Marcas de cierre: en dos alturas si quedan cerca.
	$: markers = c.markers.map((m, i, all) => {
		const near = i > 0 && x(m.day) - x(all[i - 1].day) < 120;
		return { ...m, row: near && i % 2 ? 1 : 0, px: x(m.day) };
	});

	// --- Interacción: día elegido → valores del tooltip ---
	$: days = Array.from({ length: c.to - c.from + 1 }, (_, i) => c.from + i);
	$: info = active === null ? null : describe(active, c, prev);

	/**
	 * @param {number} day
	 * @param {typeof chart} c
	 * @param {typeof chart.previous} prev
	 */
	function describe(day, c, prev) {
		const point = c.series.find((p) => p.day === day) ?? null;
		const prevPoint = prev?.points.find((p) => p.day === day) ?? null;
		let projected = null;
		const pr = c.projection;
		if (!point && pr) {
			const [a, b] = pr.points;
			if (day >= a.day && day <= b.day)
				projected = a.total + ((b.total - a.total) * (day - a.day)) / Math.max(1, b.day - a.day);
			else if (day > b.day && pr.sellOutDay !== null) projected = pr.final;
		}
		const lines = [];
		if (point) {
			lines.push(`${point.total} ${point.total === 1 ? 'vendida' : 'vendidas'} en total`);
			if (point.added) lines.push(`+${point.added} ese día`);
		} else if (projected !== null) {
			lines.push(`~${Math.round(projected)} (estimación)`);
		}
		if (prevPoint) lines.push(`Edición anterior: ${prevPoint.total}`);
		const marker = c.markers.find((m) => m.day === day);
		return {
			day,
			title:
				(day === c.today ? 'Hoy, ' : day === c.eventDay ? 'Evento, ' : '') + dayShort(day, true),
			point,
			projected,
			prevPoint,
			lines,
			marker: marker?.label ?? null
		};
	}

	/** @param {PointerEvent} e */
	function onPointer(e) {
		const svg = /** @type {SVGSVGElement} */ (e.currentTarget);
		const rect = svg.getBoundingClientRect();
		const px = ((e.clientX - rect.left) / rect.width) * W;
		const d = Math.round(c.from + ((px - PAD.l) / plotW) * span);
		active = Math.min(c.to, Math.max(c.from, d));
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		const cur = active ?? Math.min(c.today, c.to);
		/** @type {Record<string, number>} */
		const moves = {
			ArrowLeft: cur - 1,
			ArrowRight: cur + 1,
			ArrowDown: cur - 1,
			ArrowUp: cur + 1,
			PageDown: cur - 7,
			PageUp: cur + 7,
			Home: c.from,
			End: c.to
		};
		if (!(e.key in moves)) return;
		e.preventDefault();
		active = Math.min(c.to, Math.max(c.from, moves[e.key]));
	}

	$: tipLeft = info ? x(info.day) : 0;
	$: tipRight = info ? tipLeft > W * 0.6 : false;

	// --- Textos ---
	const plural = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) =>
		`${n} ${n === 1 ? one : many}`;
	$: capacityText =
		c.capacity === null
			? 'sin cupo total'
			: `cupo ${c.capacity}${c.sold > c.capacity ? `, sobrevendidas ${c.sold - c.capacity}` : ''}`;
	$: prevText = c.previous
		? `${c.previous.title}: ${c.previous.atToday !== null ? `llevaba ${c.previous.atToday} a esta altura y ` : ''}terminó con ${plural(c.previous.final, 'entrada', 'entradas')}.`
		: '';
	$: summary =
		`Termómetro de ventas: ${plural(c.sold, 'entrada vendida', 'entradas vendidas')} ` +
		`desde el ${dayShort(c.from)}, ${capacityText}. ${progress ? `Meta: ${progress.text}. ` : ''}${c.sentence} ` +
		(c.previous ? `Edición anterior (${prevText})` : '');
	$: multi = c.channels.length > 1;
	/** @type {import('$lib/admin/salesChart.js').Channel[]} */
	$: legendChannels = c.channels.length ? c.channels : ['online'];
	// En el celu la tabla va sin columnas por canal (el tooltip y la leyenda las tienen).
	$: tableChannels = multi && !compact ? c.channels : [];
	$: tableRows = c.series.filter((p) => p.added > 0 || p.day === c.today);
</script>

<div class="thermo">
	<div class="head">
		<p class="big">
			<b class="num">{c.sold}</b>
			<span class="muted">
				{c.sold === 1 ? 'vendida' : 'vendidas'}{c.capacity !== null
					? ` de ${c.capacity}`
					: ' · sin cupo'}
			</span>
			{#if c.capacity !== null && c.sold > c.capacity}
				<span class="over">+{c.sold - c.capacity} sobre el cupo</span>
			{/if}
		</p>
		{#if progress}
			<p class="goal-line">
				Meta: <b class="num">{progress.text}</b>{#if progress.reached}{' '}· cumplida{/if}
			</p>
		{/if}
		{#if c.sentence}
			<p class="sentence">
				{#if c.projection}<span class="est-tag">Estimación</span>{/if}
				{c.sentence}
				{#if c.pace && c.projection}
					<span class="muted"
						>(promedio de los últimos {c.pace.days} días: {c.pace.perDay.toLocaleString('es-AR', {
							maximumFractionDigits: 1
						})} por día)</span
					>
				{/if}
			</p>
		{/if}
		{#if c.previous}
			<label class="toggle">
				<input type="checkbox" bind:checked={showPrevious} />
				<span>Comparar con la edición anterior</span>
			</label>
			{#if showPrevious}
				<p class="muted small">{prevText}</p>
			{/if}
		{/if}
	</div>

	<div class="plot-wrap" bind:clientWidth={width}>
		<svg
			class="plot"
			viewBox="0 0 {W} {H}"
			width={W}
			height={H}
			role="slider"
			tabindex="0"
			aria-label="{summary} Usá las flechas para recorrer los días."
			aria-valuemin={0}
			aria-valuemax={days.length - 1}
			aria-valuenow={info ? info.day - c.from : Math.min(c.today, c.to) - c.from}
			aria-valuetext={info ? `${info.title}: ${info.lines.join(', ')}` : 'Ningún día elegido'}
			on:pointermove={onPointer}
			on:pointerdown={onPointer}
			on:pointerleave={() => (active = null)}
			on:keydown={onKey}
			on:blur={() => (active = null)}
		>
			<!-- Grilla y eje y -->
			{#each ticks as v}
				<line class="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
				<text class="tick" x={PAD.l - 6} y={y(v) + 4} text-anchor="end">{v}</text>
			{/each}

			<!-- Futuro (de hoy al evento): fondo apenas distinto -->
			{#if showToday}
				<rect
					class="future"
					x={x(c.today)}
					y={PAD.t}
					width={W - PAD.r - x(c.today)}
					height={H - PAD.t - PAD.b}
				/>
			{/if}

			<!-- Cierres de tipos -->
			{#each markers as m (m.day)}
				<line
					class="close-line"
					x1={m.px}
					x2={m.px}
					y1={PAD.t - (compact ? 0 : 4)}
					y2={H - PAD.b}
				/>
				{#if !compact}
					<text
						class="tick marker-label"
						x={m.px > W - PAD.r - 110 ? m.px - 4 : m.px + 4}
						y={PAD.t - 18 + m.row * 11}
						text-anchor={m.px > W - PAD.r - 110 ? 'end' : 'start'}>{m.label}</text
					>
				{/if}
			{/each}

			<!-- Hoy -->
			{#if showToday}
				<line class="today-line" x1={x(c.today)} x2={x(c.today)} y1={PAD.t} y2={H - PAD.b} />
			{/if}

			<!-- Cupo -->
			{#if c.capacity !== null && c.capacity > 0}
				<line class="cap-line" x1={PAD.l} x2={W - PAD.r} y1={y(c.capacity)} y2={y(c.capacity)} />
				<text class="tick cap-label" x={PAD.l + 4} y={y(c.capacity) - 5}>cupo {c.capacity}</text>
			{:else if c.capacity === null}
				<text class="tick" x={PAD.l + 4} y={PAD.t + 10}>sin cupo</text>
			{/if}

			<!-- Meta de venta (en entradas) -->
			{#if goalLine !== null}
				<line class="goal-chart-line" x1={PAD.l} x2={W - PAD.r} y1={y(goalLine)} y2={y(goalLine)} />
				<text class="tick goal-label" x={W - PAD.r - 4} y={y(goalLine) - 5} text-anchor="end"
					>meta {goalLine}</text
				>
			{/if}

			<!-- Edición anterior -->
			{#if prev}
				<path class="prev-line" d={linePath(prev.points)} />
				{#if !compact}
					<text
						class="tick"
						x={W - PAD.r + 6}
						y={Math.min(H - PAD.b, y(prev.points[prev.points.length - 1].total) + 4)}>anterior</text
					>
				{/if}
			{/if}

			<!-- Vendidas, apiladas por canal -->
			{#each bands as b (b.channel)}
				<path class="band ch-{b.channel}" d={b.area} />
			{/each}
			<!-- Bordes de arriba hacia abajo: donde un canal no suma, se ve el borde del de abajo. -->
			{#each [...bands].reverse() as b (b.channel)}
				<path class="band-line ch-{b.channel}" d={b.line} />
			{/each}

			<!-- Estimación -->
			{#if c.projection}
				{@const end = c.projection.points[1]}
				<path class="proj-line" d={linePath(c.projection.points)} />
				<circle class="proj-dot" cx={x(end.day)} cy={y(end.total)} r="4" />
				{#if !compact}
					<text
						class="tick proj-label"
						x={x(end.day) + (end.day === c.to ? 8 : 0)}
						y={y(end.total) - 9}
						text-anchor={end.day === c.to ? 'start' : 'middle'}
						>~{Math.round(end.total)}{c.projection.sellOutDay !== null ? ' agotadas' : ''}</text
					>
				{/if}
			{/if}

			<!-- Punto de hoy -->
			{#if last}
				<circle class="now-dot" cx={x(last.day)} cy={y(last.total)} r="4.5" />
			{/if}

			<!-- Eje x -->
			<line class="axis" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
			{#each xTicks as t (t.day + t.label)}
				<text class="tick" class:strong={t.strong} x={x(t.day)} y={H - 8} text-anchor={t.anchor}
					>{t.label}</text
				>
			{/each}

			<!-- Día elegido -->
			{#if info}
				<line class="cross" x1={x(info.day)} x2={x(info.day)} y1={PAD.t} y2={H - PAD.b} />
				{#if info.point}
					<circle class="hover-dot" cx={x(info.day)} cy={y(info.point.total)} r="4.5" />
				{:else if info.projected !== null}
					<circle class="hover-dot proj" cx={x(info.day)} cy={y(info.projected)} r="4.5" />
				{/if}
				{#if info.prevPoint}
					<circle class="hover-dot prev" cx={x(info.day)} cy={y(info.prevPoint.total)} r="4" />
				{/if}
			{/if}
		</svg>

		{#if info}
			<div
				class="tip"
				class:right={tipRight}
				style="left:{(tipLeft / W) * 100}%"
				aria-hidden="true"
			>
				<strong>{info.title}</strong>
				{#each info.lines as line}<span>{line}</span>{/each}
				{#if info.point && multi}
					{#each c.channels as ch}
						<span class="tip-ch"
							><i class="sw ch-{ch}"></i>{CHANNEL_LABELS[ch]}: {info.point[ch]}</span
						>
					{/each}
				{/if}
				{#if info.marker}<span class="muted">{info.marker}</span>{/if}
			</div>
		{/if}
	</div>

	<ul class="legend" aria-label="Referencias">
		{#each legendChannels as ch}
			<li>
				<i class="sw ch-{ch}" aria-hidden="true"></i>{multi ? CHANNEL_LABELS[ch] : 'Vendidas'}
			</li>
		{/each}
		{#if c.projection}<li><i class="key proj" aria-hidden="true"></i>Estimación</li>{/if}
		{#if prev}<li><i class="key prev" aria-hidden="true"></i>Edición anterior</li>{/if}
		{#if c.capacity !== null && c.capacity > 0}<li>
				<i class="key cap" aria-hidden="true"></i>Cupo
			</li>{/if}
		{#if goalLine !== null}<li><i class="key goal" aria-hidden="true"></i>Meta</li>{/if}
		{#if c.markers.length}
			<li>
				<i class="key close" aria-hidden="true"></i>{compact
					? c.markers.map((m) => `${m.label} (${dayShort(m.day)})`).join(' · ')
					: 'Cierre de un tipo'}
			</li>
		{/if}
	</ul>

	<details class="table-view">
		<summary>Ver como tabla</summary>
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr>
						<th>Día</th>
						<th class="r">Ese día</th>
						<th class="r">Acumuladas</th>
						{#each tableChannels as ch}<th class="r">{CHANNEL_LABELS[ch]}</th>{/each}
						{#if prev}<th class="r">Anterior</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each tableRows as p (p.day)}
						<tr>
							<td class="day">{p.day === c.today ? 'hoy' : dayShort(p.day, !compact)}</td>
							<td class="r num">{p.added}</td>
							<td class="r num">{p.total}</td>
							{#each tableChannels as ch}<td class="r num">{p[ch]}</td>{/each}
							{#if prev}
								<td class="r num">{prev.points.find((q) => q.day === p.day)?.total ?? '—'}</td>
							{/if}
						</tr>
					{:else}
						<tr><td colspan="3" class="muted">Todavía no hay ventas aprobadas.</td></tr>
					{/each}
				</tbody>
				{#if c.projection || (prev && c.eventDay !== null)}
					<tfoot>
						{#if c.projection}
							<tr>
								<td colspan="2"
									>Estimación ({c.projection.sellOutDay !== null
										? `se agota el ${dayShort(c.projection.sellOutDay, true)}`
										: `al ${dayShort(c.projection.points[1].day, true)}`})</td
								>
								<td class="r num">~{Math.round(c.projection.final)}</td>
								{#if tableChannels.length}<td colspan={tableChannels.length}></td>{/if}
								{#if prev}<td></td>{/if}
							</tr>
						{/if}
						{#if prev}
							<tr>
								<td colspan={3 + tableChannels.length}>Edición anterior, al terminar</td>
								<td class="r num">{prev.final}</td>
							</tr>
						{/if}
					</tfoot>
				{/if}
			</table>
		</div>
	</details>
</div>

<style>
	/* Colores de los canales: los mismos tres validados del gráfico "Cómo pagaron" (daltonismo y
	   contraste, en claro y en oscuro). El texto nunca va en estos colores. */
	.thermo {
		--ch-online: #813df5;
		--ch-puerta: #0d9b78;
		--ch-cortesia: #f79c06;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root[data-theme='auto']) .thermo {
			--ch-online: #9d6cf7;
			--ch-puerta: #119a77;
			--ch-cortesia: #bb800a;
		}
	}
	:global(:root[data-theme='dark']) .thermo {
		--ch-online: #9d6cf7;
		--ch-puerta: #119a77;
		--ch-cortesia: #bb800a;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.head p {
		margin: 0;
	}
	.big {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem var(--space-2xs);
	}
	.big b {
		font-size: var(--text-2xl);
		line-height: 1;
	}
	.over {
		color: var(--bad);
		font-weight: 700;
	}
	.sentence {
		font-size: var(--text-sm);
	}
	.goal-line {
		font-size: var(--text-sm);
	}
	.est-tag {
		display: inline-block;
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border: 1px dashed var(--muted);
		color: var(--muted);
		border-radius: var(--radius-m);
		padding: 0 0.5em;
		margin-right: 0.3em;
		vertical-align: 0.1em;
	}
	.small {
		font-size: var(--text-xs);
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-sm);
		cursor: pointer;
		width: fit-content;
	}
	.toggle input {
		accent-color: var(--link);
		width: 1.05rem;
		height: 1.05rem;
	}
	.plot-wrap {
		position: relative;
		min-width: 0;
	}
	.plot {
		display: block;
		width: 100%;
		height: auto;
		touch-action: pan-y;
		border-radius: 0.4rem;
	}
	.plot:focus {
		outline: none;
	}
	.plot:focus-visible {
		outline: 2px solid var(--link);
		outline-offset: 2px;
	}
	.tick {
		fill: var(--muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
	.tick.strong {
		fill: var(--text);
		font-weight: 700;
	}
	.grid-line {
		stroke: var(--line);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.future {
		fill: var(--surface-2);
	}
	.today-line {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.close-line {
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.marker-label {
		fill: var(--text);
	}
	.cap-line {
		stroke: var(--text);
		stroke-width: 1.5;
		opacity: 0.6;
	}
	.cap-label {
		fill: var(--text);
		font-weight: 700;
	}
	.goal-chart-line {
		stroke: var(--ok, var(--3-dark));
		stroke-width: 2;
		stroke-dasharray: 6 3;
	}
	.goal-label {
		fill: var(--ok, var(--3-dark));
		font-weight: 700;
	}
	.band {
		stroke: none;
		fill-opacity: 0.28;
	}
	.band-line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.band.ch-online {
		fill: var(--ch-online);
	}
	.band.ch-puerta {
		fill: var(--ch-puerta);
	}
	.band.ch-cortesia {
		fill: var(--ch-cortesia);
	}
	.band-line.ch-online {
		stroke: var(--ch-online);
	}
	.band-line.ch-puerta {
		stroke: var(--ch-puerta);
	}
	.band-line.ch-cortesia {
		stroke: var(--ch-cortesia);
	}
	.proj-line {
		fill: none;
		stroke: var(--text);
		stroke-width: 2;
		stroke-dasharray: 7 5;
		opacity: 0.75;
	}
	.proj-dot {
		fill: var(--surface);
		stroke: var(--text);
		stroke-width: 2;
		opacity: 0.85;
	}
	.proj-label {
		fill: var(--text);
		font-weight: 700;
	}
	.prev-line {
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-dasharray: 2 4;
		stroke-linecap: round;
		opacity: 0.9;
	}
	.now-dot {
		fill: var(--text);
		stroke: var(--surface);
		stroke-width: 2;
	}
	.cross {
		stroke: var(--text);
		stroke-width: 1;
		opacity: 0.5;
	}
	.hover-dot {
		fill: var(--text);
		stroke: var(--surface);
		stroke-width: 2;
	}
	.hover-dot.proj {
		fill: var(--surface);
		stroke: var(--text);
	}
	.hover-dot.prev {
		fill: var(--muted);
	}
	.tip {
		position: absolute;
		top: 0.2rem;
		margin-left: 10px;
		background: var(--surface);
		border: 1px solid var(--line);
		box-shadow: var(--shadow);
		border-radius: var(--radius-s);
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
		display: flex;
		flex-direction: column;
		pointer-events: none;
		white-space: nowrap;
		z-index: 1;
	}
	.tip.right {
		margin-left: -10px;
		transform: translateX(-100%);
	}
	.tip-ch {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
		font-size: var(--text-xs);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.sw {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 0.2rem;
		flex: none;
	}
	.sw.ch-online {
		background: var(--ch-online);
	}
	.sw.ch-puerta {
		background: var(--ch-puerta);
	}
	.sw.ch-cortesia {
		background: var(--ch-cortesia);
	}
	.key {
		display: inline-block;
		width: 1.4rem;
		height: 0;
		flex: none;
	}
	.key.proj {
		border-top: 2px dashed var(--text);
		opacity: 0.75;
	}
	.key.prev {
		border-top: 2px dotted var(--muted);
	}
	.key.cap {
		border-top: 2px solid var(--text);
		opacity: 0.6;
	}
	.key.close {
		border-top: 2px dashed var(--accent);
	}
	.key.goal {
		border-top: 2px dashed var(--ok, var(--3-dark));
	}
	.table-view summary {
		cursor: pointer;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.kv-table .num,
	.kv-table .day {
		white-space: nowrap;
	}
</style>
