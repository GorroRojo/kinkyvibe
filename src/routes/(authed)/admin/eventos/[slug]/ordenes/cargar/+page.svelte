<script>
	/**
	 * Cargar entradas a mano: invitaciones, cortesías o pagos que llegaron por otro lado. Si se
	 * pasa un límite (cupo, máximo por compra, venta cerrada), el servidor pide confirmar y la
	 * página pregunta con un diálogo (OverrideDialog); sin JavaScript, la confirmación aparece en
	 * la página con un botón.
	 */
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { TicketPlus, TriangleAlert } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import OverrideDialog from '$lib/components/admin/panel/OverrideDialog.svelte';
	import { eventHref } from '$lib/admin/nav.js';
	import { formatARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: ordersHref = eventHref(data.slug, 'ordenes');

	/** @type {Record<string, string>} */
	const v = /** @type {any} */ (form && 'values' in form ? form.values : {}) ?? {};
	let typeId =
		v.type ||
		(data.types.find((t) => t.available === null || t.available > 0)?.id ??
			data.types[0]?.id ??
			'');
	let quantity = Number(v.quantity) || 1;
	let method = v.method || 'cortesia';
	let amount = v.amount ?? '';
	let email = v.email ?? '';
	let busy = false;
	/** @type {OverrideDialog} */
	let overrideDialog;
	/** Clave de confirmación (la manda el diálogo; se borra al cambiar algo). */
	let overrideKey = '';

	$: type = data.types.find((t) => t.id === typeId);
	// Al cambiar de tipo, el monto sugerido es su precio (o el sugerido de la gorra). Si el
	// formulario volvió del servidor con un monto, se respeta.
	let amountFor = v.amount ? v.type : '';
	$: if (type && amountFor !== type.id) {
		amountFor = type.id;
		amount = String(type.gorra?.suggested ?? type.price);
	}
	$: unit = method === 'cortesia' ? 0 : Number(String(amount).replace(/[.\s$]/g, ''));
	$: total = Number.isFinite(unit) && quantity > 0 ? unit * quantity : null;
	$: count = Math.max(1, Math.min(data.maxOrder, Number(quantity) || 1));

	// Avisos antes de enviar (el servidor es el que decide y pide confirmar).
	$: hints = [
		type && type.capacity !== null && type.taken + count > type.capacity
			? `Pasa el cupo de «${type.name}»: quedarían ${type.taken + count} / ${type.capacity}.`
			: '',
		count > data.maxPerPurchase ? `Son más de ${data.maxPerPurchase} entradas por compra.` : '',
		data.salesClosed || (type && !type.open) ? 'Venta cerrada.' : ''
	].filter(Boolean);

	/** @type {import('./$types').SubmitFunction} */
	function submit({ formElement }) {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			const needs =
				result.type === 'failure' ? /** @type {any} */ (result.data)?.needsConfirmation : null;
			if (needs) {
				const key = await overrideDialog.ask(needs);
				if (key) {
					overrideKey = key;
					// Esperar a que esté el input oculto con la clave antes de reenviar.
					await tick();
					formElement.requestSubmit();
				} else overrideKey = '';
				return;
			}
			overrideKey = '';
			// Sin `reset` del formulario (desincroniza los campos atados): se limpian a mano los
			// datos de la persona y se mantienen tipo, medio y monto (para cargar varias seguidas).
			await update({ reset: false });
			if (result.type === 'success') {
				for (const el of formElement.querySelectorAll(
					'input[name=name], input[name^=holder_], textarea[name=note], input[name=send_email]'
				)) {
					const input = /** @type {HTMLInputElement} */ (el);
					if (input.type === 'checkbox') input.checked = false;
					else input.value = '';
				}
				quantity = 1;
				email = '';
			}
		};
	}

	/** @param {{ capacity: number | null, taken: number, available: number | null, open: boolean }} t */
	function typeState(t) {
		if (!t.open) return 'venta cerrada';
		if (t.capacity === null) return 'sin cupo';
		if (t.taken > t.capacity) return `pasada del cupo (${t.taken} / ${t.capacity})`;
		if (t.available === 0) return `agotada (${t.taken} / ${t.capacity})`;
		return `quedan ${t.available} de ${t.capacity}`;
	}
</script>

<PageHeader
	title="Cargar entradas a mano"
	subtitle={data.title}
	back={{ href: ordersHref, label: 'Órdenes' }}
/>

<div class="layout">
	{#if form?.ok && 'tickets' in form}
		<Card title="Entradas cargadas">
			<p class="ok" role="status">{form.message}</p>
			<ul class="codes">
				{#each form.tickets ?? [] as t}
					<li><span>{t.holder}</span> <code>{t.code}</code></li>
				{/each}
			</ul>
			<p class="muted small">
				Quedan aprobadas en las órdenes del evento y sirven en la puerta con el código o el QR.
			</p>
			<p><a class="kv-btn ghost small" href={ordersHref}>Ver las órdenes</a></p>
		</Card>
	{/if}

	<Card>
		<form method="POST" class="stack" use:enhance={submit}>
			{#if overrideKey}<input type="hidden" name="override" value={overrideKey} />{/if}

			<div class="grid2">
				<label class="field">
					<span>Tipo de entrada</span>
					<select class="kv-input" name="type" bind:value={typeId} required>
						{#each data.types as t (t.id)}
							<option value={t.id}>{t.name} · {typeState(t)}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Cantidad</span>
					<input
						class="kv-input"
						name="quantity"
						type="number"
						min="1"
						max={data.maxOrder}
						bind:value={quantity}
						on:input={() => (overrideKey = '')}
						required
					/>
				</label>
			</div>

			<fieldset class="methods">
				<legend>Cómo se pagó</legend>
				<label
					><input type="radio" name="method" value="cortesia" bind:group={method} /> Cortesía / invitación</label
				>
				<label
					><input type="radio" name="method" value="efectivo" bind:group={method} /> Efectivo</label
				>
				<label
					><input type="radio" name="method" value="transferencia" bind:group={method} /> Transferencia</label
				>
				<label><input type="radio" name="method" value="otro" bind:group={method} /> Otro</label>
			</fieldset>

			{#if method !== 'cortesia'}
				<label class="field">
					<span>Monto por entrada (0 si no pagó nada)</span>
					<input class="kv-input" name="amount" inputmode="numeric" bind:value={amount} required />
				</label>
			{/if}
			<p class="total">
				Total: <strong class="num"
					>{total === null ? '—' : total === 0 ? 'sin cargo' : formatARS(total)}</strong
				>
			</p>

			<div class="grid2">
				<label class="field">
					<span>Nombre de quien recibe</span>
					<input class="kv-input" name="name" value={v.name ?? ''} autocomplete="off" required />
				</label>
				<label class="field">
					<span>Email (opcional)</span>
					<input class="kv-input" name="email" type="email" autocomplete="off" bind:value={email} />
				</label>
			</div>
			{#if email}
				<label class="check"
					><input type="checkbox" name="send_email" /> Mandarle las entradas por mail</label
				>
			{/if}

			<fieldset class="holders">
				<legend>A nombre de quién va cada entrada</legend>
				<p class="muted small">Si dejás uno vacío, va a nombre de quien recibe.</p>
				{#each Array.from({ length: count }) as _, i (i)}
					<input
						class="kv-input"
						name="holder_{i}"
						placeholder="Nombre de la persona {i + 1}"
						aria-label="Persona {i + 1}"
						autocomplete="off"
					/>
				{/each}
			</fieldset>

			<label class="field">
				<span>Nota (opcional; solo se ve en el panel)</span>
				<textarea class="kv-input note" name="note" maxlength={data.noteMax} rows="2"
					>{v.note ?? ''}</textarea
				>
			</label>

			{#if hints.length}
				<div class="warn" role="note">
					<TriangleAlert size={18} aria-hidden="true" />
					<div>
						{#each hints as h}<p>{h}</p>{/each}
						<p class="muted small">Podés seguir: te vamos a pedir que confirmes.</p>
					</div>
				</div>
			{/if}

			{#if form && !form.ok && 'needsConfirmation' in form && form.needsConfirmation}
				<!-- Sin JavaScript: la confirmación en la página. -->
				<div class="warn" role="alert">
					<TriangleAlert size={18} aria-hidden="true" />
					<div>
						{#each form.needsConfirmation.limits as l}<p>{l.message}</p>{/each}
						<button
							class="kv-btn small"
							type="submit"
							name="override"
							value={form.needsConfirmation.key}>Sí, cargar igual</button
						>
					</div>
				</div>
			{:else if form && !form.ok && 'message' in form}
				<p class="error" role="alert">{form.message}</p>
			{/if}

			<div>
				<button class="kv-btn" type="submit" disabled={busy}>
					<TicketPlus size={18} aria-hidden="true" />
					{busy ? 'Cargando…' : count === 1 ? 'Cargar 1 entrada' : `Cargar ${count} entradas`}
				</button>
			</div>
			<p class="muted small">
				Se crea una orden aprobada (cargada a mano) y las entradas quedan listas para la puerta.
				Queda en el registro de actividad.
			</p>
		</form>
	</Card>
</div>

<OverrideDialog bind:this={overrideDialog} confirmLabel="Sí, cargar igual" />

<style>
	.layout {
		display: grid;
		gap: var(--space-xs);
		max-width: 44rem;
	}
	.stack {
		display: grid;
		gap: var(--space-xs);
	}
	.grid2 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: var(--space-xs);
	}
	.field {
		display: grid;
		gap: var(--space-3xs);
	}
	.field > span,
	legend {
		font-weight: 700;
		font-size: var(--text-sm);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem var(--space-xs);
	}
	legend {
		margin-bottom: 0.3rem;
		padding: 0;
	}
	.holders {
		display: grid;
		gap: 0.4rem;
	}
	.holders p {
		margin: 0;
	}
	.note {
		border-radius: var(--radius-m);
		resize: vertical;
	}
	.total {
		margin: 0;
	}
	.check {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.warn {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
		background: var(--warn-bg);
		color: var(--text);
		border-radius: var(--card-round);
		padding: var(--space-2xs) var(--space-xs);
	}
	.warn p {
		margin: 0 0 0.2rem;
	}
	.error {
		color: var(--bad);
		font-weight: 700;
		margin: 0;
	}
	.ok {
		color: var(--ok);
		font-weight: 700;
		margin-top: 0;
	}
	.codes {
		list-style: none;
		padding: 0;
		margin: 0 0 0.6rem;
		display: grid;
		gap: var(--space-3xs);
	}
	.codes li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-xs);
	}
	.small {
		font-size: var(--text-xs);
	}
</style>
