<script>
	/**
	 * Mensajes › Lo que sigo: para mirar, nada de acá cambia lo que sigue la gente. Arriba los dos
	 * interruptores; después los números (solo totales), los avisos que salieron, el paso de
	 * «Avisame si se repite», Telegram y «Lo más seguido» (cuántas cuentas siguen cada cosa, nunca
	 * quiénes). Abajo, los links a donde se configura cada cosa.
	 */
	import '$lib/admin/panel-forms.scss';
	import { Badge, Card, Notice, PageHeader } from '$lib/components/ui';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import { fmtDateTime, fmtRelative } from '$lib/admin/format.js';
	import { Bot, Link, Power, Repeat, Send, Sigma, Trophy } from '@lucide/svelte';

	export let data;

	/** Cuántos de cada grupo se ven antes de «Ver todo». */
	const TOP = 10;

	$: s = data.stats;
	$: sigoOn = data.flags.lo_que_sigo;
	$: botOn = data.flags.telegram_bot;
	$: tgConfigOk = data.telegramConfig.secretOk && data.telegramConfig.tokenOk;
	// Qué falta del bot, en palabras (si están cargados, nunca el valor).
	$: tgMissing = [
		data.telegramConfig.secretOk ? '' : 'el secreto del webhook',
		data.telegramConfig.tokenOk ? '' : 'el token para mandar avisos'
	]
		.filter(Boolean)
		.join(' y ');

	/** @param {number | null | undefined} v */
	const num = (v) => (v == null ? '—' : v.toLocaleString('es-AR'));

	/**
	 * @param {number} count
	 * @param {string} one
	 * @param {string} many
	 */
	const plural = (count, one, many) => `${num(count)} ${count === 1 ? one : many}`;

	const NOTICE_ROWS = /** @type {const} */ ([
		{ kind: 'nuevo', channel: 'mail', label: 'Algo nuevo', via: 'Mail' },
		{ kind: 'nuevo', channel: 'telegram', label: 'Algo nuevo', via: 'Telegram' },
		{ kind: 'recordatorio', channel: 'mail', label: 'Recordatorio', via: 'Mail' },
		{ kind: 'recordatorio', channel: 'telegram', label: 'Recordatorio', via: 'Telegram' }
	]);

	/** @type {Record<string, string>} */
	const STATE_LABEL = { oculto: 'oculto', borrado: 'borrado', 'no-existe': 'ya no existe' };
	/** @type {Record<string, string>} */
	const PROFILE_KIND = { persona: 'persona', proyecto: 'proyecto' };

	/** @param {import('$lib/server/sigo/stats.js').RankRow} r */
	function sub(r) {
		const bits = [];
		if (r.series) bits.push('serie');
		if (r.profileKind && PROFILE_KIND[r.profileKind]) bits.push(PROFILE_KIND[r.profileKind]);
		if (r.state) bits.push(STATE_LABEL[r.state]);
		return bits.join(' · ') || undefined;
	}

	/** @param {import('$lib/server/sigo/stats.js').RankRow[]} rows */
	const bars = (rows) =>
		rows.map((r) => ({
			label: r.title,
			value: r.count,
			text: num(r.count),
			title: `${r.title}: ${plural(r.count, 'cuenta lo sigue', 'cuentas lo siguen')}`,
			href: r.href ?? undefined,
			sub: sub(r)
		}));

	$: groups = s.ranking
		? [
				{ id: 'etiqueta', title: 'Etiquetas y series', rows: s.ranking.etiqueta },
				{ id: 'perfil', title: 'Perfiles', rows: s.ranking.perfil },
				{ id: 'lugar', title: 'Lugares', rows: s.ranking.lugar }
			]
		: [];
</script>

<PageHeader
	title="Lo que sigo"
	subtitle="Qué sigue la gente con cuenta y qué avisos salieron, en números. Es para mirar: nada de acá cambia lo que sigue alguien."
/>

<div class="kv-stack sigo">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible: no se pueden contar los números.</p>
	{/if}

	<Card title="Estado" icon={Power}>
		<dl class="facts">
			<div>
				<dt>Lo que sigo</dt>
				<dd>
					<Badge tone={sigoOn ? 'ok' : 'neutral'}>{sigoOn ? 'Prendido' : 'Apagado'}</Badge>
				</dd>
			</div>
			<div>
				<dt>Bot de Telegram</dt>
				<dd>
					{#if botOn && !tgConfigOk}
						<Badge tone="warn">Prendido, pero falta configurarlo</Badge>
					{:else}
						<Badge tone={botOn ? 'ok' : 'neutral'}>{botOn ? 'Prendido' : 'Apagado'}</Badge>
					{/if}
				</dd>
			</div>
		</dl>
		{#if !sigoOn}
			<p class="note">
				Con «Lo que sigo» apagado no se ve nada de esto en el sitio y no sale ningún aviso. Al
				prenderlo, la gente con cuenta puede seguir etiquetas, series, perfiles y lugares. La
				primera vuelta de mails anota lo que ya estaba anunciado, así que no sale una tanda de mails
				por todo eso: solo avisa lo que se anuncie después. Las suscripciones con cuenta de «Avisame
				si se repite» pasan solas a Lo que sigo.
			</p>
		{/if}
		<p class="config"><a href="/admin/ajustes/interruptores">Se cambian en Interruptores →</a></p>
	</Card>

	<Card title="En números" icon={Sigma}>
		<div class="kv-stats">
			<Stat label="Cuentas que siguen algo" value={num(s.accounts)} />
			<Stat label="Cosas seguidas" value={num(s.follows?.total)} sub="sumando todas las cuentas" />
			<Stat label="Etiquetas y series" value={num(s.follows?.etiqueta)} />
			<Stat label="Perfiles" value={num(s.follows?.perfil)} />
			<Stat label="Lugares" value={num(s.follows?.lugar)} />
		</div>
		<h3>Qué tienen prendido</h3>
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr>
						<th scope="col">Opción</th>
						<th scope="col" class="r">Mail</th>
						<th scope="col" class="r">Telegram</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<th scope="row">En mi calendario</th>
						<td class="r num" colspan="2">{num(s.options?.inCalendar)}</td>
					</tr>
					<tr>
						<th scope="row">Algo nuevo</th>
						<td class="r num">{num(s.options?.mailNew)}</td>
						<td class="r num">{num(s.options?.tgNew)}</td>
					</tr>
					<tr>
						<th scope="row">Recordatorio el día antes</th>
						<td class="r num">{num(s.options?.mailReminder)}</td>
						<td class="r num">{num(s.options?.tgReminder)}</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p class="kv-note">Cada número cuenta cosas seguidas, no cuentas.</p>
	</Card>

	<Card title="Avisos mandados" icon={Send}>
		{#if s.notices}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th scope="col">Aviso</th>
							<th scope="col">Por</th>
							<th scope="col" class="r">7 días</th>
							<th scope="col" class="r">30 días</th>
							<th scope="col" class="r">Desde el principio</th>
						</tr>
					</thead>
					<tbody>
						{#each NOTICE_ROWS as row (`${row.kind}:${row.channel}`)}
							{@const c = s.notices[row.kind][row.channel]}
							<tr>
								<th scope="row">{row.label}</th>
								<td>{row.via}</td>
								<td class="r num">{num(c.d7)}</td>
								<td class="r num">{num(c.d30)}</td>
								<td class="r num">{num(c.total)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="last">
				{#if s.notices.last}
					El último salió el <time datetime={new Date(s.notices.last).toISOString()}
						>{fmtDateTime(s.notices.last)}</time
					>
					<span class="muted">({fmtRelative(s.notices.last, data.now)})</span>.
				{:else}
					Todavía no salió ningún aviso.
				{/if}
			</p>
		{:else}
			<p class="muted">No se pudieron contar los avisos.</p>
		{/if}
		<p class="kv-note">
			Cuenta los avisos que salieron, no los que llegaron. Los que fallan no quedan guardados: se
			vuelven a intentar en la vuelta siguiente.
		</p>
		<p class="config">
			<a href="/admin/ajustes/automatizaciones"
				>Cuándo corre la vuelta de mails: Automatizaciones →</a
			>
		</p>
	</Card>

	<Card title="«Avisame si se repite»" icon={Repeat}>
		<dl class="facts">
			<div>
				<dt>Con cuenta, ya en Lo que sigo</dt>
				<dd class="num">{num(s.avisame.migrated)}</dd>
			</div>
			<div>
				<dt>Con cuenta, por pasar</dt>
				<dd class="num">{num(s.avisame.pendingWithAccount)}</dd>
			</div>
			<div>
				<dt>Sin cuenta, con el mail</dt>
				<dd class="num">{num(s.avisame.withoutAccount)}</dd>
			</div>
		</dl>
		<p class="kv-note">
			Las suscripciones con cuenta pasan solas a Lo que sigo en la vuelta de mails, con el
			interruptor prendido{#if !sigoOn}{' '}(ahora está apagado){/if}. Las que son sin cuenta siguen
			como siempre: un mail con doble confirmación y los avisos de la serie.
		</p>
		<p class="config">
			<a href="/admin/eventos/series">Las series y quiénes piden aviso: Series →</a>
		</p>
	</Card>

	<Card title="Telegram" icon={Bot}>
		{#if s.telegram}
			<dl class="facts">
				<div>
					<dt>Cuentas con el chat conectado</dt>
					<dd class="num">{num(s.telegram.linked)}</dd>
				</div>
				<div>
					<dt>En silencio</dt>
					<dd class="num">{num(s.telegram.muted)}</dd>
				</div>
			</dl>
		{:else}
			<p class="muted">No se pudieron contar los chats conectados.</p>
		{/if}
		{#if botOn && !tgConfigOk}
			<Notice tone="warn" role={null} compact>
				El bot está prendido, pero falta configurarlo: {tgMissing}. Pedíselo a quien maneja el sitio
				(detalle en
				<a href="/admin/ajustes/automatizaciones#telegram">Automatizaciones</a>).
			</Notice>
		{:else if !botOn}
			<p class="kv-note">
				Con el bot apagado no sale ningún aviso por Telegram, aunque la gente lo tenga prendido.
			</p>
		{/if}
		<p class="config">
			<a href="/admin/ajustes/textos-bot">Lo que dice el bot: Textos del bot →</a>
		</p>
	</Card>

	<Card title="Lo más seguido" icon={Trophy}>
		<p class="kv-note">
			Cuántas cuentas siguen cada cosa, aunque sea una. Nunca quiénes: lo que sigue cada persona se
			ve solo en su ficha.
		</p>
		{#if !s.ranking}
			<p class="muted">No se pudo armar la lista.</p>
		{:else}
			<div class="ranking">
				{#each groups as g (g.id)}
					<section class="group" aria-labelledby="rank-{g.id}">
						<h3 id="rank-{g.id}">{g.title}</h3>
						{#if g.rows.length === 0}
							<p class="muted">Nadie sigue ninguno todavía.</p>
						{:else}
							<BarList items={bars(g.rows.slice(0, TOP))} label={g.title} />
							{#if g.rows.length > TOP}
								<details>
									<summary>Ver {g.rows.length - TOP} más</summary>
									<BarList
										items={bars(g.rows.slice(TOP))}
										max={g.rows[0].count}
										label="{g.title} (el resto)"
									/>
								</details>
							{/if}
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	</Card>

	<Card title="Dónde se configura" icon={Link}>
		<ul class="links">
			<li>
				<a href="/admin/ajustes/interruptores">Interruptores</a>: prender o apagar Lo que sigo y el
				bot.
			</li>
			<li>
				<a href="/admin/ajustes/automatizaciones">Automatizaciones</a>: cuándo corre la vuelta de
				mails y el último aviso.
			</li>
			<li><a href="/admin/eventos/series">Series</a>: las series y su «Avisame si se repite».</li>
			<li>
				<a href="/admin/ajustes/textos-bot">Textos del bot</a>: lo que contesta el bot de Telegram.
			</li>
			<li>
				<a href="/mi-rincon/sigo">Cómo lo ve una persona</a>: Mi rincón → Lo que sigo, con tu cuenta{#if !sigoOn}{' '}(con
					el interruptor apagado da «no encontrado»){/if}.
			</li>
		</ul>
	</Card>
</div>

<style>
	.sigo {
		max-width: 56rem;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.8rem;
		margin: 0;
	}
	.facts dt {
		font-weight: 600;
		font-size: 0.88rem;
	}
	.facts dd {
		margin: 0.15rem 0 0;
	}
	.facts dd.num {
		font-size: var(--text-lg);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	h3 {
		margin: 0.8rem 0 0.4rem;
		font-size: 1rem;
	}
	.note,
	.last {
		margin: 0.7rem 0 0;
		font-size: 0.92rem;
	}
	.config {
		margin: 0.6rem 0 0;
		font-size: 0.9rem;
	}
	.kv-table th[scope='row'] {
		font-weight: 600;
		text-align: left;
	}
	.ranking {
		display: grid;
		gap: 1rem 1.6rem;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
	}
	.group h3 {
		margin-top: 0.2rem;
	}
	details {
		margin-top: 0.5rem;
	}
	summary {
		cursor: pointer;
		font-size: 0.9rem;
		margin-bottom: 0.4rem;
	}
	.links {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.35rem;
	}
</style>
