<script>
	/**
	 * Ventas › Gastos y reparto (interruptor `gastos_reparto`; docs/tickets.md, «Gastos y
	 * reparto»). Lo que entró sale de las órdenes del evento (el servidor); el lugar, las
	 * contrataciones, los gastos, los otros ingresos y el reparto se cargan acá y se guardan en la
	 * base con «Guardar». «Cerrar la cuenta» congela los números y guarda el resumen para el
	 * resumen del año. La cuenta la hace src/lib/admin/reparto.js (la misma que en el servidor).
	 */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Lock, LockOpen, Plus, Save, Trash2 } from '@lucide/svelte';
	import {
		Button,
		Card,
		Checkbox,
		Chip,
		Notice,
		SaveStatus,
		Segmented,
		askConfirm
	} from '$lib/components/ui';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import { CAJA, CAJA_LABEL, computeAccount, fondoLine } from '$lib/admin/reparto.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { formatARS, formatSignedARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @typedef {import('$lib/admin/reparto.js').AccountData} AccountData */

	const PRESETS = ['Materiales', 'Transporte', 'Difusión', 'Comida y bebida', 'Limpieza'];
	// Los roles que se contratan con un pago fijo (gorrite, Mesa 5/11): suman una contratación.
	const FEE_PRESETS = ['Monitorea', 'Anfitrione', 'Fotografía', 'Técnica'];
	const LOSS_OPTIONS = [
		{ value: 'produccion', label: 'Quienes producen' },
		{ value: 'todes', label: 'Todes, como la ganancia' }
	];
	const MODES = [
		{ value: 'iguales', label: 'Partes iguales' },
		{ value: 'porcentajes', label: 'Porcentajes' }
	];
	const VENUE_OPTIONS = [
		{ value: 'fijo', label: 'Monto fijo' },
		{ value: 'hora', label: 'Por hora' },
		{ value: 'porcentaje', label: 'Porcentaje de los ingresos' },
		{ value: 'porcentaje_minimo', label: 'Porcentaje con un mínimo' }
	];

	$: e = data.event;
	$: closing = data.closing;
	$: closed = Boolean(closing);

	/** @type {AccountData} */
	let account = structuredClone(data.closing ? data.closing.account : data.account);
	let version = data.version;
	let savedPayload = JSON.stringify(account);
	/** @type {'' | 'saving' | 'saved' | 'error'} */
	let status = '';
	let errorText = '';
	let venueRuleSaved = false;
	let lastData = data;

	// Al volver del servidor (guardar, cerrar, reabrir), lo de la base manda.
	$: if (data !== lastData) {
		lastData = data;
		account = structuredClone(data.closing ? data.closing.account : data.account);
		version = data.version;
		savedPayload = JSON.stringify(account);
	}

	$: income = closing ? closing.income : data.income;
	$: result = computeAccount(income, account);
	$: hasFondo = data.fondoEnabled || income.fondoUsed > 0 || income.fondoContributed > 0;
	$: who = [
		{ value: CAJA, label: CAJA_LABEL },
		...account.people.map((p, i) => ({
			value: p.id,
			label: p.name.trim() || `Facilitadore ${i + 1}`
		})),
		...account.coproducers.map((c, i) => ({
			value: c.id,
			label: c.name.trim() || `Co-productore ${i + 1}`
		}))
	];
	$: cajaProductionShare = Math.max(
		0,
		100 - account.coproducers.reduce((t, c) => t + (Number(c.share) || 0), 0)
	);

	/** Al cambiar algo, el «Guardado» de antes ya no vale. */
	function touch() {
		if (status !== 'saving') status = '';
	}

	const newId = () => Math.random().toString(36).slice(2, 10);

	function addPerson() {
		account.people = [...account.people, { id: newId(), name: '', team: false, pct: null }];
		touch();
	}
	/** @param {string} id */
	function removePerson(id) {
		account.people = account.people.filter((p) => p.id !== id);
		touch();
	}
	function addCoproducer() {
		account.coproducers = [...account.coproducers, { id: newId(), name: '', share: 50 }];
		touch();
	}
	/** @param {string} id */
	function removeCoproducer(id) {
		account.coproducers = account.coproducers.filter((c) => c.id !== id);
		touch();
	}
	/** @param {string} concept */
	function addExpense(concept = '') {
		account.expenses = [
			...account.expenses,
			{ id: newId(), concept, amount: 0, paidBy: '', paidAt: '' }
		];
		touch();
	}
	/** @param {string} concept */
	function addFee(concept = '') {
		account.fees = [
			...account.fees,
			{ id: newId(), concept, amount: 0, team: false, keep: 'cobra', paidBy: '', paidAt: '' }
		];
		touch();
	}
	function addOtherIncome() {
		account.otherIncome = [
			...account.otherIncome,
			{ id: newId(), concept: '', amount: 0, heldBy: CAJA }
		];
		touch();
	}
	/** @param {'expenses' | 'fees' | 'otherIncome'} list @param {string} id */
	function removeLine(list, id) {
		// @ts-expect-error las tres listas tienen `id`
		account[list] = account[list].filter((/** @type {{ id: string }} */ x) => x.id !== id);
		touch();
	}

	function useVenueDefault() {
		if (!data.venue?.rule) return;
		account.venue = { ...data.venue.rule, hours: account.venue.hours ?? 0 };
		touch();
	}

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		status = 'saving';
		errorText = '';
		return async ({ result: r }) => {
			if (r.type === 'success') {
				status = 'saved';
				if (r.data?.venueRuleSaved) venueRuleSaved = true;
				await invalidateAll();
			} else if (r.type === 'failure') {
				status = 'error';
				errorText = String(r.data?.error ?? 'No se pudo guardar.');
			} else {
				status = 'error';
				errorText = 'No se pudo guardar. Probá de nuevo en un rato.';
			}
		};
	};

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submitClose = async ({ cancel }) => {
		const ok = await askConfirm({
			title: '¿Cerrar la cuenta?',
			text: 'Se guardan los números como están ahora y quedan en el resumen del año. Para cambiar algo después, hay que reabrirla.',
			confirmLabel: 'Cerrar la cuenta'
		});
		if (!ok) {
			cancel();
			return;
		}
		return submit(/** @type {any} */ ({}));
	};

	const when = fmtDateTime;

	/** Un monto del reparto: con pérdida, «pone $ …». @param {number} n */
	const money = (n) => (n < 0 ? `pone ${formatARS(-n)}` : formatARS(n));
	// Con pérdida: quién pone cuánto (antes de las transferencias, que ya lo incluyen).
	$: lossLine =
		result.profit < 0
			? 'Por la pérdida: ' +
				[
					...result.split.shares
						.filter((x) => !x.team && x.amount < 0)
						.map((x) => `${x.name} pone ${formatARS(-x.amount)}`),
					...result.split.coproducers
						.filter((x) => x.amount < 0)
						.map((x) => `${x.name} pone ${formatARS(-x.amount)}`),
					...(result.split.caja < 0
						? [`la ${CAJA_LABEL} pone ${formatARS(-result.split.caja)}`]
						: [])
				].join(', ') +
				'.'
			: '';
	$: cajaNote = result.feesToCaja
		? ` (con ${formatARS(result.feesToCaja)} de contrataciones que se dejaron en la caja)`
		: '';
	$: payload = JSON.stringify(account);
	// Hay algo sin guardar si lo de la página no es lo que vino de la base.
	$: dirty = payload !== savedPayload;
	// Ganancia o pérdida, cada una con su nombre (el monto siempre sin signo).
	$: profitLabel = result.profit < 0 ? 'Pérdida' : 'Ganancia';
	$: profitAmount = formatARS(Math.abs(result.profit));
	$: summaryRows = [
		['Entradas', String(income.tickets)],
		['Preventa', formatARS(income.presale)],
		['Puerta', formatARS(income.door)],
		['Fondo neto', formatSignedARS(result.fondo)],
		['Otros ingresos', formatARS(result.otherIncome)],
		['Ingresos', formatARS(result.totalIncome)],
		['Lugar', formatARS(result.venue.amount)],
		['Contrataciones', formatARS(result.feesTotal)],
		['Otros gastos', formatARS(result.expensesTotal)],
		['Gastos', formatARS(result.allExpenses)],
		[CAJA_LABEL, money(result.caja)],
		[profitLabel, profitAmount]
	];
</script>

<svelte:head><title>Gastos y reparto · {e.title} · Panel</title></svelte:head>

{#if closing}
	<Notice tone="ok" role={null}>
		<strong>Cuenta cerrada</strong> el {when(closing.closedAt)} por {closing.closedBy}. Los números
		quedaron congelados y están en el resumen del año.
		{#if closing.changed}
			<br />Ojo: desde el cierre cambiaron las ventas (hay órdenes nuevas o reembolsadas). Si hace
			falta, reabrila y volvé a cerrarla.
		{/if}
		<form method="POST" action="?/reabrir" use:enhance={submit} class="inline-form">
			<Button variant="secondary" size="small" icon={LockOpen} type="submit"
				>Reabrir la cuenta</Button
			>
		</form>
	</Notice>
	<Card title="Resumen de la cuenta cerrada">
		<dl class="summary">
			{#each summaryRows as [label, value] (label)}
				<div class:key={label === profitLabel || label === 'Ingresos' || label === 'Gastos'}>
					<dt>{label}</dt>
					<dd class="num">{value}</dd>
				</div>
			{/each}
		</dl>
	</Card>
{/if}
{#if data.missingMigration}<Notice tone="error">{data.missingMigration}</Notice>{/if}
{#if errorText}<Notice tone="error">{errorText}</Notice>{/if}
<p class="year-link muted small"><a href="/admin/ventas/cuentas">Ver las cuentas del año</a></p>

<div class="stats">
	<Stat
		label="Ingresos"
		value={formatARS(result.totalIncome)}
		sub="entradas, Fondo y otros ingresos"
	/>
	<Stat label="Gastos" value={formatARS(result.allExpenses)} sub="lugar, contrataciones y otros" />
	<Stat
		label={profitLabel}
		value={profitAmount}
		tone={result.profit > 0 ? 'ok' : result.profit < 0 ? 'bad' : ''}
	/>
	<Stat label={CAJA_LABEL} value={money(result.caja)} sub="la plata de Kinky Vibe" />
</div>

<fieldset class="sheet" disabled={closed || Boolean(data.missingMigration)}>
	<div class="cols">
		<div class="area ing">
			<Card title="Ingresos">
				<p class="muted small">
					Lo que entró: las órdenes aprobadas del evento. Elegí quién tiene cada plata (la cuenta de
					Mercado Pago, el alias de las transferencias, la caja de la puerta): sirve para saber
					quién le pasa a quién.
				</p>
				<div class="kv-table-wrap">
					<table class="kv-table">
						<thead>
							<tr><th>De dónde</th><th class="r">Cobrado</th><th>¿Quién la tiene?</th></tr>
						</thead>
						<tbody>
							{#each income.rows as row (row.key)}
								<tr>
									<td
										>{row.label}<br /><span class="muted small"
											>{row.tickets} {row.tickets === 1 ? 'entrada' : 'entradas'}</span
										></td
									>
									<td class="r num">{formatARS(row.amount)}</td>
									<td>
										<select
											class="kv-input"
											aria-label="Quién tiene la plata de {row.label}"
											value={account.holders[row.key] || CAJA}
											on:change={(ev) => {
												account.holders = { ...account.holders, [row.key]: ev.currentTarget.value };
												touch();
											}}
										>
											{#each who as w (w.value)}<option value={w.value}>{w.label}</option>{/each}
										</select>
									</td>
								</tr>
							{:else}
								<tr><td colspan="3" class="muted">Todavía no hay compras aprobadas.</td></tr>
							{/each}
						</tbody>
						<tfoot>
							<tr><td>Preventa</td><td class="r num">{formatARS(income.presale)}</td><td></td></tr>
							<tr><td>Puerta</td><td class="r num">{formatARS(income.door)}</td><td></td></tr>
							{#if income.mpFee}
								<tr>
									<td colspan="3" class="muted small"
										>Sin el recargo de Mercado Pago ({formatARS(income.mpFee)}): lo pagó quien
										compró y se lo quedó MP.</td
									>
								</tr>
							{/if}
						</tfoot>
					</table>
				</div>
				{#if hasFondo}
					<p class="fondo" class:pos={result.fondo > 0} class:neg={result.fondo < 0}>
						{fondoLine(income, formatARS)}
					</p>
					<p class="muted small">
						Orden por orden: lo que cubrió el descuento del Fondo lo pone el Fondo; lo que se pagó
						de más en las entradas solidarias es del Fondo.
					</p>
				{/if}
				<p class="total-line">
					<span>Ingresos por entradas</span>
					<strong class="num">{formatARS(result.ticketIncome)}</strong>
				</p>
				{#if income.refunded.orders || income.awaiting.orders}
					<p class="muted small">
						{#if income.refunded.orders}No cuentan {income.refunded.orders}
							{income.refunded.orders === 1 ? 'orden reembolsada' : 'órdenes reembolsadas'} ({formatARS(
								income.refunded.amount
							)}).{/if}
						{#if income.awaiting.orders}
							Tampoco {income.awaiting.orders}
							{income.awaiting.orders === 1
								? 'transferencia sin confirmar'
								: 'transferencias sin confirmar'} ({formatARS(income.awaiting.amount)}).{/if}
					</p>
				{/if}
				<h3 class="sub">Otros ingresos</h3>
				<p class="muted small">La barra, un sponsor, efectivo que no se cargó en la puerta.</p>
				{#if account.otherIncome.length}
					<ul class="lines">
						{#each account.otherIncome as x, i (x.id)}
							<li class="line">
								<label class="kv-field concept">
									<span class="visually-hidden">Concepto del ingreso {i + 1}</span>
									<input
										class="kv-input"
										bind:value={x.concept}
										on:input={touch}
										placeholder="Concepto"
									/>
								</label>
								<label class="kv-field amount">
									<span class="visually-hidden">Monto de {x.concept || `el ingreso ${i + 1}`}</span>
									<input
										class="kv-input"
										type="number"
										inputmode="numeric"
										min="0"
										step="1"
										bind:value={x.amount}
										on:input={touch}
									/>
								</label>
								<label class="kv-field who">
									<span class="visually-hidden"
										>Quién tiene {x.concept || `el ingreso ${i + 1}`}</span
									>
									<select class="kv-input" bind:value={x.heldBy} on:change={touch}>
										{#each who as w (w.value)}<option value={w.value}>Lo tiene {w.label}</option
											>{/each}
									</select>
								</label>
								<Button
									variant="danger"
									size="small"
									iconOnly
									icon={Trash2}
									label="Sacar {x.concept || `el ingreso ${i + 1}`}"
									on:click={() => removeLine('otherIncome', x.id)}
								/>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="row">
					<Button variant="secondary" size="small" icon={Plus} on:click={addOtherIncome}
						>Otro ingreso</Button
					>
					<strong class="num">Otros ingresos: {formatARS(result.otherIncome)}</strong>
				</div>
				<p class="total-line grand">
					<span>Ingresos</span>
					<strong class="num">{formatARS(result.totalIncome)}</strong>
				</p>
			</Card>
		</div>
		<div class="area gas">
			<Card title="Gastos">
				<h3 class="sub first">Lugar</h3>
				{#if data.venue}
					<p class="muted small">
						{data.venue.title}{#if data.venue.rule}: tiene una regla guardada.{:else}: todavía no
							tiene una regla guardada.{/if}
					</p>
				{/if}
				<div class="venue-kinds" role="radiogroup" aria-label="Cómo cobra el lugar">
					{#each VENUE_OPTIONS as o (o.value)}
						<label class="radio">
							<input
								type="radio"
								name="venue-kind"
								value={o.value}
								bind:group={account.venue.kind}
								on:change={touch}
							/>
							{o.label}
						</label>
					{/each}
				</div>
				<div class="venue-fields">
					{#if account.venue.kind === 'fijo'}
						<label class="kv-field">
							<span>Monto</span>
							<input
								class="kv-input"
								type="number"
								min="0"
								step="1"
								bind:value={account.venue.amount}
								on:input={touch}
							/>
						</label>
					{/if}
					{#if account.venue.kind === 'porcentaje' || account.venue.kind === 'porcentaje_minimo'}
						<label class="kv-field">
							<span>Porcentaje</span>
							<span class="affix"
								><input
									class="kv-input"
									type="number"
									min="0"
									max="100"
									step="0.5"
									bind:value={account.venue.pct}
									on:input={touch}
								/><span aria-hidden="true">%</span></span
							>
						</label>
					{/if}
					{#if account.venue.kind === 'porcentaje_minimo'}
						<label class="kv-field">
							<span>El mínimo es</span>
							<select class="kv-input" bind:value={account.venue.minKind} on:change={touch}>
								<option value="fijo">un monto fijo</option>
								<option value="hora">por hora</option>
							</select>
						</label>
						{#if account.venue.minKind !== 'hora'}
							<label class="kv-field">
								<span>Mínimo</span>
								<input
									class="kv-input"
									type="number"
									min="0"
									step="1"
									bind:value={account.venue.minAmount}
									on:input={touch}
								/>
							</label>
						{/if}
					{/if}
					{#if account.venue.kind === 'hora' || (account.venue.kind === 'porcentaje_minimo' && account.venue.minKind === 'hora')}
						<label class="kv-field">
							<span>Horas</span>
							<input
								class="kv-input"
								type="number"
								min="0"
								step="0.5"
								bind:value={account.venue.hours}
								on:input={touch}
							/>
						</label>
						<label class="kv-field">
							<span>Precio por hora</span>
							<input
								class="kv-input"
								type="number"
								min="0"
								step="1"
								bind:value={account.venue.rate}
								on:input={touch}
							/>
						</label>
					{/if}
					<label class="kv-field">
						<span>Pagó</span>
						<select class="kv-input" bind:value={account.venuePayment.paidBy} on:change={touch}>
							<option value="">Falta pagarlo</option>
							{#each who as w (w.value)}<option value={w.value}>{w.label}</option>{/each}
						</select>
					</label>
					<label class="kv-field">
						<span>Pagado el</span>
						<input
							class="kv-input"
							type="date"
							bind:value={account.venuePayment.paidAt}
							on:input={touch}
						/>
					</label>
				</div>
				{#if account.venue.kind === 'porcentaje' || account.venue.kind === 'porcentaje_minimo'}
					<p class="muted small">
						El porcentaje es sobre los ingresos por entradas con lo que cubrió el Fondo y sin los
						aportes al Fondo ({formatARS(result.ticketIncome)}). No cuenta otros ingresos.
						{#if result.venue.usedMin}Esta vez el porcentaje da {formatARS(result.venue.byPct)}: se
							cobra el mínimo.{/if}
					</p>
				{/if}
				<div class="row">
					{#if data.venue && !closed}
						<span class="venue-actions">
							{#if data.venue.rule}
								<Button variant="link" size="small" on:click={useVenueDefault}
									>Usar la regla del lugar</Button
								>
							{/if}
							<form method="POST" action="?/reglaLugar" use:enhance={submit} class="inline-form">
								<input type="hidden" name="rule" value={JSON.stringify(account.venue)} />
								<Button variant="link" size="small" type="submit"
									>Guardar como regla de {data.venue.title}</Button
								>
							</form>
						</span>
					{:else}
						<span></span>
					{/if}
					<strong class="num">Lugar: {formatARS(result.venue.amount)}</strong>
				</div>
				{#if venueRuleSaved}<p class="muted small">
						Listo: los próximos eventos en {data.venue?.title} arrancan con esta regla.
					</p>{/if}

				<h3 class="sub">Contrataciones</h3>
				<p class="muted small">
					Quien cobra un monto fijo: monitorea, anfitrione, fotografía, técnica. Si es del equipo de
					KV, elegí si cobra o lo deja en la caja.
				</p>
				{#if !closed}
					<div class="presets" role="group" aria-label="Agregar una contratación">
						{#each FEE_PRESETS as p (p)}
							<Chip pressable icon={Plus} on:click={() => addFee(p)}>{p}</Chip>
						{/each}
					</div>
				{/if}
				{#if account.fees.length}
					<ul class="lines">
						{#each account.fees as f, i (f.id)}
							<li class="line fee">
								<label class="kv-field concept">
									<span class="visually-hidden">Quién y qué, contratación {i + 1}</span>
									<input
										class="kv-input"
										bind:value={f.concept}
										on:input={touch}
										placeholder="Ej.: Monitorea: Lu"
									/>
								</label>
								<label class="kv-field amount">
									<span class="visually-hidden"
										>Monto de {f.concept || `la contratación ${i + 1}`}</span
									>
									<input
										class="kv-input"
										type="number"
										inputmode="numeric"
										min="0"
										step="1"
										bind:value={f.amount}
										on:input={touch}
									/>
								</label>
								<span class="team">
									<Checkbox bind:checked={f.team} on:change={touch}>Es del equipo de KV</Checkbox>
									{#if f.team}
										<select
											class="kv-input"
											aria-label="Qué hace con lo que cobra"
											bind:value={f.keep}
											on:change={touch}
										>
											<option value="cobra">Cobra</option>
											<option value="caja">Lo deja en la caja</option>
										</select>
									{/if}
								</span>
								{#if !(f.team && f.keep === 'caja')}
									<label class="kv-field who">
										<span class="visually-hidden"
											>Quién pagó {f.concept || `la contratación ${i + 1}`}</span
										>
										<select class="kv-input" bind:value={f.paidBy} on:change={touch}>
											<option value="">Falta pagarle</option>
											{#each who as w (w.value)}<option value={w.value}>Pagó {w.label}</option
												>{/each}
										</select>
									</label>
									<label class="kv-field date">
										<span class="visually-hidden">Pagado el</span>
										<input class="kv-input" type="date" bind:value={f.paidAt} on:input={touch} />
									</label>
								{/if}
								<Button
									variant="danger"
									size="small"
									iconOnly
									icon={Trash2}
									label="Sacar {f.concept || `la contratación ${i + 1}`}"
									on:click={() => removeLine('fees', f.id)}
								/>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="row">
					<Button variant="secondary" size="small" icon={Plus} on:click={() => addFee()}
						>Otra contratación</Button
					>
					<strong class="num">Contrataciones: {formatARS(result.feesTotal)}</strong>
				</div>

				<h3 class="sub">Otros gastos</h3>
				{#if !closed}
					<div class="presets" role="group" aria-label="Agregar un gasto">
						{#each PRESETS as p (p)}
							<Chip pressable icon={Plus} on:click={() => addExpense(p)}>{p}</Chip>
						{/each}
					</div>
				{/if}
				{#if account.expenses.length}
					<ul class="lines">
						{#each account.expenses as x, i (x.id)}
							<li class="line dated">
								<label class="kv-field concept">
									<span class="visually-hidden">Concepto del gasto {i + 1}</span>
									<input
										class="kv-input"
										bind:value={x.concept}
										on:input={touch}
										placeholder="Concepto"
									/>
								</label>
								<label class="kv-field amount">
									<span class="visually-hidden">Monto de {x.concept || `el gasto ${i + 1}`}</span>
									<input
										class="kv-input"
										type="number"
										inputmode="numeric"
										min="0"
										step="1"
										bind:value={x.amount}
										on:input={touch}
									/>
								</label>
								<label class="kv-field who">
									<span class="visually-hidden">Quién pagó {x.concept || `el gasto ${i + 1}`}</span>
									<select class="kv-input" bind:value={x.paidBy} on:change={touch}>
										<option value="">Falta pagarlo</option>
										{#each who as w (w.value)}<option value={w.value}>Pagó {w.label}</option>{/each}
									</select>
								</label>
								<label class="kv-field date">
									<span class="visually-hidden">Pagado el</span>
									<input class="kv-input" type="date" bind:value={x.paidAt} on:input={touch} />
								</label>
								<Button
									variant="danger"
									size="small"
									iconOnly
									icon={Trash2}
									label="Sacar {x.concept || `el gasto ${i + 1}`}"
									on:click={() => removeLine('expenses', x.id)}
								/>
							</li>
						{/each}
					</ul>
				{:else if !closed}
					<p class="muted small">Tocá un tipo de gasto para sumarlo.</p>
				{/if}
				<div class="row">
					<Button variant="secondary" size="small" icon={Plus} on:click={() => addExpense()}
						>Otro gasto</Button
					>
					<strong class="num">Otros gastos: {formatARS(result.expensesTotal)}</strong>
				</div>
				<p class="total-line grand">
					<span>Gastos</span>
					<strong class="num">{formatARS(result.allExpenses)}</strong>
				</p>
			</Card>
		</div>
		<div class="area rep">
			<Card title="Reparto">
				<p class="total-line grand top" class:pos={result.profit > 0} class:neg={result.profit < 0}>
					<span>{profitLabel}</span>
					<strong class="num">{profitAmount}</strong>
				</p>
				<p class="muted small">
					Ingresos − lugar − contrataciones − otros gastos. De la ganancia, un porcentaje va a la
					producción (la {CAJA_LABEL} y quien co-produzca); el resto se reparte entre les facilitadores.
					La parte de quien es del equipo de KV va a la {CAJA_LABEL}, y la {CAJA_LABEL} se queda con los
					pesos que sobran al redondear.
				</p>
				<div class="split-row">
					<label class="kv-field prod">
						<span>Para la producción</span>
						<span class="affix"
							><input
								class="kv-input"
								type="number"
								min="0"
								max="100"
								step="1"
								bind:value={account.split.productionPct}
								on:input={touch}
							/><span aria-hidden="true">%</span></span
						>
					</label>
					<div class="kv-field loss-by">
						<span>Si hay pérdida, la ponen</span>
						<Segmented
							options={LOSS_OPTIONS}
							bind:value={account.split.lossBy}
							label="Si hay pérdida, la ponen"
						/>
					</div>
				</div>
				<h3 class="sub">Producción</h3>
				<p class="muted small">
					Produce la {CAJA_LABEL}. Si alguien más co-produce (otra organización o persona), sumalo
					con su parte de la producción; la {CAJA_LABEL} tiene el resto ({cajaProductionShare} %).
				</p>
				{#if account.coproducers.length}
					<ul class="lines">
						{#each account.coproducers as c, i (c.id)}
							{@const cop = result.split.coproducers[i]}
							<li class="person">
								<label class="kv-field name">
									<span class="visually-hidden">Quién co-produce {i + 1}</span>
									<input
										class="kv-input"
										bind:value={c.name}
										on:input={touch}
										placeholder="Co-productore {i + 1}"
									/>
								</label>
								<label class="kv-field value">
									<span class="visually-hidden"
										>Parte de la producción de {c.name || `co-productore ${i + 1}`}</span
									>
									<span class="affix"
										><input
											class="kv-input"
											type="number"
											min="0"
											max="100"
											step="1"
											bind:value={c.share}
											on:input={touch}
										/><span aria-hidden="true">%</span></span
									>
								</label>
								<span class="share num">{money(cop?.amount ?? 0)}</span>
								<Button
									variant="danger"
									size="small"
									iconOnly
									icon={Trash2}
									label="Sacar a {c.name || `co-productore ${i + 1}`}"
									on:click={() => removeCoproducer(c.id)}
								/>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="row">
					<Button variant="secondary" size="small" icon={Plus} on:click={addCoproducer}
						>Sumar quien co-produce</Button
					>
				</div>
				<div class="row sub-row">
					<h3 class="sub">Facilitadores</h3>
					<Segmented
						options={MODES}
						bind:value={account.split.mode}
						label="Cómo se reparte entre les facilitadores"
					/>
				</div>
				<p class="muted small">
					Quienes facilitan el taller (en el evento, «Facilita» o «Enseña»).
				</p>
				<ul class="lines">
					{#each account.people as p, i (p.id)}
						{@const share = result.split.shares[i]}
						<li class="person">
							<label class="kv-field name">
								<span class="visually-hidden">Nombre de le facilitadore {i + 1}</span>
								<input
									class="kv-input"
									bind:value={p.name}
									on:input={touch}
									placeholder="Facilitadore {i + 1}"
								/>
							</label>
							{#if account.split.mode === 'porcentajes'}
								<label class="kv-field value">
									<span class="visually-hidden"
										>Porcentaje de {p.name || `le facilitadore ${i + 1}`}</span
									>
									<span class="affix"
										><input
											class="kv-input"
											type="number"
											min="0"
											max="100"
											step="0.5"
											bind:value={p.pct}
											on:input={touch}
										/><span aria-hidden="true">%</span></span
									>
								</label>
							{/if}
							<span class="team"
								><Checkbox bind:checked={p.team} on:change={touch}>Es del equipo de KV</Checkbox
								></span
							>
							<span class="share num">
								{money(share?.amount ?? 0)}
								{#if share?.team}<span class="muted small to-caja">→ {CAJA_LABEL}</span>{/if}
							</span>
							<Button
								variant="danger"
								size="small"
								iconOnly
								icon={Trash2}
								label="Sacar a {p.name || `le facilitadore ${i + 1}`}"
								on:click={() => removePerson(p.id)}
							/>
						</li>
					{/each}
				</ul>
				{#if result.split.problem}<Notice tone="warn" compact>{result.split.problem}</Notice>{/if}
				{#if result.profit < 0}
					<Notice tone="warn" compact
						>{#if account.split.lossBy === 'todes'}Hubo pérdida: la ponen todes, con el mismo
							reparto que la ganancia (la parte de quien es del equipo la pone la {CAJA_LABEL}).{:else}Hubo
							pérdida: la ponen quienes producen.{/if}</Notice
					>
				{/if}
				<p class="total-line">
					<span>{CAJA_LABEL}{cajaNote}</span>
					<strong class="num">{money(result.caja)}</strong>
				</p>
				<div class="row">
					<Button variant="secondary" size="small" icon={Plus} on:click={addPerson}
						>Otre facilitadore</Button
					>
				</div>
			</Card>
		</div>
		<div class="area quien">
			<Card title="Quién le pasa a quién">
				{#if lossLine && !result.split.problem}<p class="loss">{lossLine}</p>{/if}
				{#if result.split.problem}
					<p class="muted small">Primero arreglá el reparto.</p>
				{:else if result.transfers.length}
					<ol class="transfers">
						{#each result.transfers as t, i (i)}
							<li>
								<strong>{t.fromName}</strong> le pasa
								<strong class="num">{formatARS(t.amount)}</strong>
								a <strong>{t.toName}</strong>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="muted small">Están a mano: nadie le tiene que pasar nada a nadie.</p>
				{/if}
				<details class="detail">
					<summary>Cómo sale la cuenta</summary>
					<p class="muted small">
						Saldo = lo que le toca + lo que puso en gastos − la plata del evento que tiene.
						Positivo: le tienen que pasar; negativo: tiene que pasar.
					</p>
					<div class="kv-table-wrap">
						<table class="kv-table">
							<thead>
								<tr
									><th>Quién</th><th class="r">Le toca</th><th class="r">Puso</th><th class="r"
										>Tiene</th
									><th class="r">Saldo</th></tr
								>
							</thead>
							<tbody>
								{#each result.parties as p (p.id)}
									<tr>
										<td
											>{p.name}{#if p.kind === 'pendiente'}<span class="muted small">
													(a pagarle)</span
												>{/if}</td
										>
										<td class="r num">{formatARS(p.share)}</td>
										<td class="r num">{formatARS(p.paid)}</td>
										<td class="r num">{formatARS(p.held)}</td>
										<td class="r num" class:pos={p.balance > 0} class:neg={p.balance < 0}
											>{formatSignedARS(p.balance)}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			</Card>
		</div>
	</div>
</fieldset>

{#if !closed && !data.missingMigration}
	<div class="save-bar">
		<SaveStatus {status} error={errorText} />
		{#if dirty && status !== 'saving'}<span class="muted small">Hay cambios sin guardar.</span>{/if}
		{#if data.updatedAt && !dirty && !status}
			<span class="muted small">Guardado el {when(data.updatedAt)} por {data.updatedBy}.</span>
		{/if}
		<span class="spacer"></span>
		<form method="POST" action="?/guardar" use:enhance={submit} class="inline-form">
			<input type="hidden" name="data" value={payload} />
			<input type="hidden" name="version" value={version} />
			<Button variant="primary" icon={Save} type="submit" disabled={status === 'saving'}
				>Guardar</Button
			>
		</form>
		<form method="POST" action="?/cerrar" use:enhance={submitClose} class="inline-form">
			<input type="hidden" name="data" value={payload} />
			<input type="hidden" name="version" value={version} />
			<Button
				variant="secondary"
				icon={Lock}
				type="submit"
				disabled={status === 'saving' || Boolean(result.split.problem)}>Cerrar la cuenta</Button
			>
		</form>
	</div>
{/if}

<style>
	.year-link {
		margin: var(--space-3xs) 0 0;
		text-align: right;
	}
	.sheet {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	.stats {
		display: grid;
		gap: var(--space-2xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
		margin-block: var(--space-2xs) var(--space-xs);
	}
	/* En el celu, una columna en el orden de la cuenta: ingresos, gastos, reparto y quién le pasa a
	   quién. Con lugar, dos: ingresos con el reparto abajo a la izquierda, y gastos (la más larga)
	   con quién le pasa a quién abajo a la derecha, para que no queden huecos grandes. */
	.cols {
		display: grid;
		gap: var(--space-xs);
		align-items: start;
	}
	.area {
		min-width: 0;
	}
	@media (min-width: 64rem) {
		.cols {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-areas: 'ing gas' 'rep gas' 'rep quien';
			/* La última fila flexible: el alto que sobra del reparto va ahí, no entre gastos y quién
			   le pasa a quién. */
			grid-template-rows: auto auto 1fr;
		}
		.ing {
			grid-area: ing;
		}
		.gas {
			grid-area: gas;
		}
		.rep {
			grid-area: rep;
		}
		.quien {
			grid-area: quien;
		}
	}
	.small {
		font-size: var(--text-xs);
		margin: 0;
	}
	.kv-table .num {
		white-space: nowrap;
	}
	.kv-table select {
		width: 100%;
		min-width: 8rem;
	}
	/* El resumen de la cuenta cerrada: renglones de dos en dos (o de a uno en el celu). */
	.summary {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
		gap: 0 var(--space-s);
		margin: 0;
	}
	.summary div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2xs);
		padding: var(--space-3xs) 0;
		border-bottom: 1px solid var(--line);
	}
	.summary dt {
		color: var(--muted);
	}
	.summary dd {
		margin: 0;
		white-space: nowrap;
	}
	.summary .key dt,
	.summary .key dd {
		color: inherit;
		font-weight: 700;
	}
	.fondo {
		margin: var(--space-2xs) 0 0;
		padding: var(--space-3xs) var(--space-2xs);
		border-radius: var(--radius, 0.5rem);
		background: var(--surface-2, rgba(127, 127, 127, 0.08));
		font-weight: 600;
	}
	.total-line {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2xs);
		margin: var(--space-3xs) 0 0;
		padding-top: var(--space-3xs);
		border-top: 1px solid var(--line);
	}
	/* El total de la tarjeta (ingresos, gastos, ganancia o pérdida). */
	.total-line.grand {
		font-weight: 700;
		border-top-width: 2px;
		margin-top: var(--space-2xs);
	}
	.total-line.top {
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.lines {
		container-type: inline-size;
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	/* Cada renglón, angosto: concepto (y sacar) arriba; monto, quién y cuándo abajo. Con lugar,
	   todo lo que entra en un renglón (más abajo). */
	.line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
		grid-template-areas: 'concept concept del' 'amount who who';
		align-items: center;
		gap: var(--space-3xs);
		padding-bottom: var(--space-3xs);
		border-bottom: 1px solid var(--line);
	}
	.line.dated {
		grid-template-areas: 'concept concept del' 'amount who who' 'date date .';
	}
	.line.fee {
		grid-template-areas: 'concept concept del' 'amount who who' 'date date .' 'team team team';
	}
	@container (min-width: 26rem) {
		.line {
			grid-template-columns: minmax(0, 1.6fr) 6.5rem minmax(0, 1.4fr) auto;
			grid-template-areas: 'concept amount who del';
		}
		.line.dated {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 6.5rem auto;
			grid-template-areas: 'concept concept amount del' 'who who date date';
		}
		.line.fee {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 6.5rem auto;
			grid-template-areas: 'concept concept amount del' 'who who date date' 'team team team team';
		}
	}
	@container (min-width: 40rem) {
		.line.dated {
			grid-template-columns: minmax(0, 1.4fr) 6.5rem minmax(0, 1fr) 9.5rem auto;
			grid-template-areas: 'concept amount who date del';
		}
		.line.fee {
			grid-template-columns: minmax(0, 1.4fr) 6.5rem minmax(0, 1fr) 9.5rem auto;
			grid-template-areas: 'concept amount who date del' 'team team team team team';
		}
	}
	.line .concept {
		grid-area: concept;
	}
	.line .amount {
		grid-area: amount;
	}
	.line .who {
		grid-area: who;
	}
	.line .date {
		grid-area: date;
	}
	.line .team {
		grid-area: team;
	}
	.line > :global(:last-child) {
		grid-area: del;
	}
	.team {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
	}
	.team select {
		width: auto;
	}
	.person {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas: 'name name del' 'value team share';
		align-items: center;
		gap: var(--space-3xs);
		padding-bottom: var(--space-3xs);
		border-bottom: 1px solid var(--line);
	}
	@container (min-width: 30rem) {
		.person {
			grid-template-columns: minmax(0, 1fr) auto auto auto auto;
			grid-template-areas: 'name value team share del';
		}
	}
	.person .name {
		grid-area: name;
	}
	.person .value {
		grid-area: value;
		max-width: 6.5rem;
	}
	.person .team {
		grid-area: team;
	}
	.person .share {
		grid-area: share;
	}
	.person > :global(:last-child) {
		grid-area: del;
	}
	.kv-field input,
	.kv-field select {
		width: 100%;
	}
	.affix {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.share {
		min-width: 6.5rem;
		text-align: right;
		font-weight: 700;
	}
	.to-caja {
		display: block;
		font-weight: 400;
	}
	/* Para la producción y quién pone la pérdida, en un renglón si entran. */
	.split-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2xs) var(--space-xs);
	}
	.prod .affix input {
		width: 5.5rem;
	}
	.venue-kinds {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-s);
	}
	.radio {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.venue-fields {
		display: grid;
		gap: var(--space-2xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr));
	}
	.venue-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2xs);
	}
	.inline-form {
		display: inline;
	}
	/* Los títulos de adentro de cada tarjeta: chicos, para que no compitan con el de la tarjeta. */
	.sub {
		margin: var(--space-2xs) 0 0;
		padding-top: var(--space-2xs);
		border-top: 1px solid var(--line);
		font-size: var(--text-sm);
	}
	.sub.first {
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}
	.sub-row .sub {
		margin: 0;
		padding: 0;
		border: 0;
	}
	.sub-row {
		margin-top: var(--space-2xs);
		padding-top: var(--space-2xs);
		border-top: 1px solid var(--line);
	}
	.loss {
		margin: 0;
		font-weight: 600;
	}
	.transfers {
		margin: 0;
		padding-left: 1.25em;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.detail summary {
		cursor: pointer;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.save-bar {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		margin-top: var(--space-xs);
		padding: var(--space-2xs) var(--space-xs);
		background: var(--bg);
		border-top: 1px solid var(--line);
	}
	.spacer {
		flex: 1;
	}
	.pos {
		color: var(--ok);
	}
	.neg {
		color: var(--bad);
	}
</style>
