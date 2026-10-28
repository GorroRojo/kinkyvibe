<script>
	/**
	 * Ventas › Gastos y reparto (prototipo, interruptor `gastos_reparto`; docs/tickets.md, «Gastos y
	 * reparto»). Lo que entró sale de las órdenes del evento (el servidor); los gastos, las personas
	 * y el reparto se cargan acá y se guardan solo en este navegador (`localStorage`), con exportar e
	 * importar un archivo. Nada va a la base.
	 */
	import { onMount } from 'svelte';
	import { Download, Plus, RotateCcw, Trash2, Upload } from '@lucide/svelte';
	import { Button, Card, Checkbox, Chip, Notice, Segmented, askConfirm } from '$lib/components/ui';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import { computeReparto } from '$lib/admin/reparto.js';
	import { formatARS, formatSignedARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @typedef {import('$lib/admin/reparto.js').Person} Person */
	/** @typedef {import('$lib/admin/reparto.js').Expense} Expense */
	/** @typedef {import('$lib/admin/reparto.js').SplitMode} SplitMode */

	const PRESETS = [
		'Lugar',
		'Materiales',
		'Honorarios',
		'Transporte',
		'Difusión',
		'Comida y bebida'
	];
	const MODES = [
		{ value: 'iguales', label: 'Partes iguales' },
		{ value: 'porcentajes', label: 'Porcentajes' },
		{ value: 'montos', label: 'Montos fijos' }
	];

	$: e = data.event;
	$: income = data.income;
	$: storageKey = `kv:gastos-reparto:${e.slug}`;
	$: hasFondo = data.fondoEnabled || income.fondoUsed > 0 || income.fondoContributed > 0;

	/** @type {Person[]} */
	let people = [];
	/** @type {Expense[]} */
	let expenses = [];
	/** @type {SplitMode} */
	let mode = 'iguales';
	/** @type {Record<string, string>} */
	let holders = {};
	let separateAportes = true;
	let addFondoUsed = false;
	let loaded = false;
	let importError = '';
	/** @type {HTMLInputElement} */
	let fileInput;

	const newId = () => Math.random().toString(36).slice(2, 10);

	/** Lo que se guarda (y se exporta). */
	$: state = { v: 1, people, expenses, mode, holders, separateAportes, addFondoUsed };

	/** @param {any} s */
	function applyState(s) {
		if (!s || s.v !== 1) throw new Error('formato');
		people = Array.isArray(s.people)
			? s.people.map((/** @type {any} */ p) => ({
					id: String(p.id || newId()),
					name: String(p.name ?? ''),
					value: p.value === null || p.value === undefined ? null : Number(p.value)
				}))
			: [];
		expenses = Array.isArray(s.expenses)
			? s.expenses.map((/** @type {any} */ x) => ({
					id: String(x.id || newId()),
					concept: String(x.concept ?? ''),
					amount: Number(x.amount) || 0,
					paidBy: String(x.paidBy ?? '')
				}))
			: [];
		mode = ['iguales', 'porcentajes', 'montos'].includes(s.mode) ? s.mode : 'iguales';
		holders = s.holders && typeof s.holders === 'object' ? { ...s.holders } : {};
		separateAportes = s.separateAportes !== false;
		addFondoUsed = s.addFondoUsed === true;
	}

	onMount(() => {
		try {
			const raw = localStorage.getItem(storageKey);
			if (raw) applyState(JSON.parse(raw));
		} catch {
			// Sin localStorage (o con algo roto guardado): se empieza de cero.
		}
		if (!people.length) people = [{ id: newId(), name: '', value: null }];
		loaded = true;
	});

	$: if (loaded) {
		try {
			localStorage.setItem(storageKey, JSON.stringify(state));
		} catch {
			// Navegador sin almacenamiento: la página anda igual, sin recordar.
		}
	}

	$: result = computeReparto({
		income,
		separateAportes,
		addFondoUsed,
		expenses,
		people,
		mode,
		holders
	});
	$: peopleParties = result.parties.filter((p) => p.kind === 'persona');
	$: otherParties = result.parties.filter((p) => p.kind !== 'persona');

	function addPerson() {
		people = [...people, { id: newId(), name: '', value: null }];
	}
	/** @param {string} id */
	function removePerson(id) {
		people = people.filter((p) => p.id !== id);
		expenses = expenses.map((x) => (x.paidBy === id ? { ...x, paidBy: '' } : x));
		holders = Object.fromEntries(Object.entries(holders).filter(([, v]) => v !== id));
	}
	/** @param {string} concept */
	function addExpense(concept = '') {
		expenses = [...expenses, { id: newId(), concept, amount: 0, paidBy: people[0]?.id ?? '' }];
	}
	/** @param {string} id */
	function removeExpense(id) {
		expenses = expenses.filter((x) => x.id !== id);
	}

	function exportFile() {
		const blob = new Blob([JSON.stringify({ ...state, evento: e.slug }, null, 2)], {
			type: 'application/json'
		});
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `gastos-${e.slug}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	/** @param {Event} ev */
	async function importFile(ev) {
		importError = '';
		const input = /** @type {HTMLInputElement} */ (ev.currentTarget);
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			applyState(JSON.parse(await file.text()));
		} catch {
			importError = 'Ese archivo no es una exportación de Gastos y reparto.';
		}
	}

	async function reset() {
		const ok = await askConfirm({
			title: '¿Empezar de cero?',
			text: 'Se borran los gastos y las personas que cargaste en este navegador.',
			confirmLabel: 'Borrar y empezar de cero',
			tone: 'permanent'
		});
		if (!ok) return;
		people = [{ id: newId(), name: '', value: null }];
		expenses = [];
		mode = 'iguales';
		holders = {};
		separateAportes = true;
		addFondoUsed = false;
	}
</script>

<svelte:head><title>Gastos y reparto · {e.title} · Panel</title></svelte:head>

<Notice tone="warn" role={null}>
	<strong>Prototipo: no se guarda en la base.</strong> Lo que cargás queda solo en este navegador.
	Para seguir en otra compu o pasárselo a alguien, exportalo e importalo allá.
	<div class="file-actions">
		<Button variant="secondary" size="small" icon={Download} on:click={exportFile}>Exportar</Button>
		<Button variant="secondary" size="small" icon={Upload} on:click={() => fileInput.click()}
			>Importar…</Button
		>
		<Button variant="link" size="small" icon={RotateCcw} on:click={reset}>Empezar de cero</Button>
		<input
			class="visually-hidden"
			type="file"
			accept="application/json,.json"
			bind:this={fileInput}
			on:change={importFile}
			tabindex="-1"
			aria-hidden="true"
		/>
	</div>
</Notice>
{#if importError}<Notice tone="error">{importError}</Notice>{/if}

<div class="stats">
	<Stat
		label="Entró (neto)"
		value={formatARS(result.net)}
		sub="sin comisión de MP ni lo del Fondo"
	/>
	<Stat label="Gastos" value={formatARS(result.totalExpenses)} />
	<Stat
		label={result.pot < 0 ? 'Pérdida' : 'Queda para repartir'}
		value={formatARS(result.pot)}
		tone={result.pot > 0 ? 'ok' : result.pot < 0 ? 'bad' : ''}
	/>
</div>

<div class="grid">
	<Card title="Lo que entró">
		<p class="muted small">
			Las órdenes aprobadas del evento. Elegí quién tiene cada plata (la cuenta de Mercado Pago, el
			alias de las transferencias, la caja de la puerta): sirve para saber quién le pasa a quién.
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
									value={holders[row.key] ?? people[0]?.id ?? ''}
									on:change={(ev) => (holders = { ...holders, [row.key]: ev.currentTarget.value })}
								>
									{#each people as p, i (p.id)}
										<option value={p.id}>{p.name.trim() || `Persona ${i + 1}`}</option>
									{/each}
								</select>
							</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="muted">Todavía no hay compras aprobadas.</td></tr>
					{/each}
				</tbody>
				<tfoot>
					<tr><td>Cobrado</td><td class="r num">{formatARS(income.gross)}</td><td></td></tr>
					{#if income.mpFee}
						<tr
							><td>Comisión de Mercado Pago</td><td class="r num">−{formatARS(income.mpFee)}</td><td
							></td></tr
						>
					{/if}
					{#if result.aportes}
						<tr
							><td>Aportes al Fondo (son del Fondo)</td><td class="r num"
								>−{formatARS(result.aportes)}</td
							><td></td></tr
						>
					{/if}
					{#if result.fondoIn}
						<tr
							><td>Lo que cubrió el Fondo</td><td class="r num">+{formatARS(result.fondoIn)}</td><td
							></td></tr
						>
					{/if}
					<tr class="total"><td>Neto</td><td class="r num">{formatARS(result.net)}</td><td></td></tr
					>
				</tfoot>
			</table>
		</div>
		{#if hasFondo}
			<div class="checks">
				<Checkbox bind:checked={separateAportes}>
					Separar los aportes al Fondo ({formatARS(income.fondoContributed)}): lo que se pagó de más
					en las solidarias va al Fondo
				</Checkbox>
				<Checkbox bind:checked={addFondoUsed}>
					Sumar lo que cubrió el Fondo ({formatARS(income.fondoUsed)}), si el Fondo se lo pasa al
					evento
				</Checkbox>
			</div>
		{/if}
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
	</Card>

	<Card title="Gastos">
		<div class="presets" role="group" aria-label="Agregar un gasto">
			{#each PRESETS as p (p)}
				<Chip pressable icon={Plus} on:click={() => addExpense(p)}>{p}</Chip>
			{/each}
		</div>
		{#if expenses.length}
			<ul class="lines">
				{#each expenses as x, i (x.id)}
					<li class="expense">
						<label class="kv-field concept">
							<span class="visually-hidden">Concepto del gasto {i + 1}</span>
							<input class="kv-input" bind:value={x.concept} placeholder="Concepto" />
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
							/>
						</label>
						<label class="kv-field paid">
							<span class="visually-hidden">Quién pagó {x.concept || `el gasto ${i + 1}`}</span>
							<select class="kv-input" bind:value={x.paidBy}>
								{#each people as p, j (p.id)}
									<option value={p.id}>Pagó {p.name.trim() || `Persona ${j + 1}`}</option>
								{/each}
								<option value="">Falta pagarlo</option>
							</select>
						</label>
						<Button
							variant="danger"
							size="small"
							iconOnly
							icon={Trash2}
							label="Sacar {x.concept || `el gasto ${i + 1}`}"
							on:click={() => removeExpense(x.id)}
						/>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted small">Tocá un tipo de gasto para sumarlo.</p>
		{/if}
		<div class="row">
			<Button variant="secondary" size="small" icon={Plus} on:click={() => addExpense()}
				>Otro gasto</Button
			>
			<strong class="num">Total: {formatARS(result.totalExpenses)}</strong>
		</div>
	</Card>

	<Card title="Reparto">
		<Segmented options={MODES} bind:value={mode} label="Cómo se reparte" />
		<p class="muted small">
			{#if mode === 'iguales'}Lo que queda, en partes iguales.
			{:else if mode === 'porcentajes'}Cada quien su porcentaje; tienen que sumar 100 %.
			{:else}Quien tiene un monto se lleva ese monto; el resto se reparte en partes iguales entre
				quienes no tienen.{/if}
			Los pesos que sobran al redondear van a las primeras personas.
		</p>
		<ul class="lines">
			{#each people as p, i (p.id)}
				<li class="person">
					<label class="kv-field name">
						<span class="visually-hidden">Nombre de la persona {i + 1}</span>
						<input class="kv-input" bind:value={p.name} placeholder="Persona {i + 1}" />
					</label>
					{#if mode !== 'iguales'}
						<label class="kv-field value">
							<span class="visually-hidden"
								>{mode === 'porcentajes' ? 'Porcentaje' : 'Monto'} de {p.name ||
									`la persona ${i + 1}`}</span
							>
							<span class="affix">
								{#if mode === 'montos'}<span aria-hidden="true">$</span>{/if}
								<input
									class="kv-input"
									type="number"
									inputmode="decimal"
									min="0"
									step={mode === 'porcentajes' ? '0.5' : '1'}
									placeholder={mode === 'montos' ? 'el resto' : '0'}
									bind:value={p.value}
								/>
								{#if mode === 'porcentajes'}<span aria-hidden="true">%</span>{/if}
							</span>
						</label>
					{/if}
					<span class="share num">{formatARS(result.shares[i] ?? 0)}</span>
					<Button
						variant="danger"
						size="small"
						iconOnly
						icon={Trash2}
						label="Sacar a {p.name || `la persona ${i + 1}`}"
						disabled={people.length === 1}
						on:click={() => removePerson(p.id)}
					/>
				</li>
			{/each}
		</ul>
		{#if result.problem}<Notice tone="warn" compact>{result.problem}</Notice>{/if}
		<div class="row">
			<Button variant="secondary" size="small" icon={Plus} on:click={addPerson}>Otra persona</Button
			>
		</div>
	</Card>

	<Card title="Quién le pasa a quién">
		{#if result.problem}
			<p class="muted small">Primero arreglá el reparto.</p>
		{:else if result.transfers.length}
			<ol class="transfers">
				{#each result.transfers as t, i (i)}
					<li>
						<strong>{t.fromName}</strong> le pasa <strong class="num">{formatARS(t.amount)}</strong>
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
				Saldo = lo que le toca + lo que puso en gastos − la plata del evento que tiene. Positivo: le
				tienen que pasar; negativo: tiene que pasar.
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
						{#each [...peopleParties, ...otherParties] as p (p.id)}
							<tr>
								<td
									>{p.name}{#if p.kind === 'pendiente'}<span class="muted small">
											(falta pagar)</span
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

<style>
	.file-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		margin-top: var(--space-2xs);
	}
	.stats {
		display: grid;
		gap: var(--space-xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
		margin-block: 1rem;
	}
	.grid {
		display: grid;
		gap: var(--space-xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
		align-items: start;
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
	}
	tfoot .total td {
		font-weight: 700;
	}
	.checks {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		margin-block: var(--space-xs);
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
		margin-bottom: var(--space-xs);
	}
	.lines {
		list-style: none;
		margin: 0 0 var(--space-xs);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.expense,
	.person {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3xs);
	}
	.expense .concept,
	.person .name {
		flex: 2 1 9rem;
	}
	.expense .amount {
		flex: 1 1 6rem;
	}
	.expense .paid {
		flex: 2 1 9rem;
	}
	.person .value {
		flex: 1 1 7rem;
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
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2xs);
	}
	.transfers {
		margin: 0 0 var(--space-xs);
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
	.pos {
		color: var(--ok);
	}
	.neg {
		color: var(--bad);
	}
</style>
