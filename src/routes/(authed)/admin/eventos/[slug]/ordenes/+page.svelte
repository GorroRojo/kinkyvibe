<script>
	import { onDestroy, onMount, tick } from 'svelte';
	import { deserialize, enhance } from '$app/forms';
	import { CircleCheck, ReceiptText, Search, TicketPlus, TriangleAlert } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import OrderAnswers from '$lib/components/admin/OrderAnswers.svelte';
	import DniReveal from '$lib/components/admin/DniReveal.svelte';
	import { announce, announceResult } from '$lib/admin/announce.js';
	import { eventHref } from '$lib/admin/nav.js';
	import { foldSearch } from '$lib/admin/eventFormat.js';
	import {
		EMAIL_PROBLEM,
		ORDER_STATUS,
		ORDER_STATUS_TONE,
		PAYMENT_METHOD,
		dniQueryDigits,
		orderFilterFor,
		orderIdFromHash,
		shortTime
	} from '$lib/admin/orderFormat.js';
	import { formatARS } from '$lib/utils/money.js';
	import { fondoOptionLabel } from '$lib/utils/tickets.js';
	import { replaceState } from '$app/navigation';
	import {
		DEFAULT_ORDER_SORT,
		ORDER_SORTS,
		orderSortOf,
		sortOrders
	} from '$lib/admin/orderSort.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;
	let filter = 'approved';
	let query = '';
	$: words = foldSearch(query).split(/\s+/).filter(Boolean);
	$: byStatus =
		filter === 'all'
			? data.orders
			: filter === 'pending'
				? data.orders.filter((o) => o.status === 'pending' || o.status === 'awaiting_transfer')
				: data.orders.filter((o) => o.status === filter);
	// El DNI completo no está en la página: las palabras que parecen un DNI se buscan en el
	// servidor (`?/dniSearch`, devuelve los ids de las órdenes que coinciden). Nombre, email,
	// referencia y personas se buscan acá.
	/** @type {Record<string, string[]>} dígitos → ids de las órdenes con ese DNI (o que empieza así) */
	let dniHits = {};
	/** @type {Set<string>} */
	let dniPending = new Set();
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let dniTimer;
	$: dniWords = [...new Set(words.map(dniQueryDigits).filter(Boolean))];
	$: scheduleDniSearch(dniWords);
	/** @param {string[]} list */
	function scheduleDniSearch(list) {
		clearTimeout(dniTimer);
		const missing = list.filter((d) => !(d in dniHits) && !dniPending.has(d));
		if (missing.length) dniTimer = setTimeout(() => missing.forEach(searchDni), 250);
	}
	/** @param {string} digits */
	async function searchDni(digits) {
		dniPending = new Set(dniPending).add(digits);
		try {
			const body = new FormData();
			body.set('q', digits);
			const res = await fetch('?/dniSearch', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = /** @type {any} */ (deserialize(await res.text()));
			const ids = result.type === 'success' ? result.data?.dniSearch?.ids : null;
			if (Array.isArray(ids)) dniHits = { ...dniHits, [digits]: ids.map(String) };
		} catch {
			// Sin conexión: se busca solo por lo demás.
		} finally {
			dniPending.delete(digits);
			dniPending = new Set(dniPending);
		}
	}
	onDestroy(() => clearTimeout(dniTimer));
	// Reactiva (lee `dniHits`): así la lista se vuelve a filtrar cuando llega la respuesta.
	/** @type {(word: string, hay: string, id: string) => boolean} */
	$: matches = (word, hay, id) => {
		if (hay.includes(word)) return true;
		const digits = dniQueryDigits(word);
		return Boolean(digits && dniHits[digits]?.includes(id));
	};
	$: searchingDni = dniWords.some((d) => dniPending.has(d) || !(d in dniHits));
	$: visible = words.length
		? byStatus.filter((o) => {
				const hay = foldSearch(
					`${o.reference} ${o.name} ${o.email} ${o.holders.map((h) => h.name).join(' ')}`
				);
				return words.every((w) => matches(w, hay, o.id));
			})
		: byStatus;
	// «Ordenar» (tarjetas, no una tabla): llegan todas las órdenes del evento, así que se ordenan
	// acá. Queda en la URL (`?orden=total`) sin volver a cargar la página; se lee al montar.
	let orderBy = DEFAULT_ORDER_SORT;
	onMount(() => (orderBy = orderSortOf(new URL(location.href).searchParams.get('orden'))));
	$: shown = sortOrders(visible, orderBy);
	function writeSortUrl() {
		const url = new URL(location.href);
		if (orderBy === DEFAULT_ORDER_SORT) url.searchParams.delete('orden');
		else url.searchParams.set('orden', orderBy);
		replaceState(url, {});
	}
	// Link a una orden (`#orden-<id>`, por ejemplo «¿Te equivocaste? Ver la orden» de la Puerta):
	// si el filtro la esconde, pasa a «Todas»; baja hasta ella y la marca (`:target` no siempre se
	// aplica después de una navegación del lado del cliente).
	let linked = '';
	onMount(async () => {
		const id = orderIdFromHash(location.hash);
		const o = id ? data.orders.find((x) => x.id === id) : null;
		if (!o) return;
		filter = orderFilterFor(filter, o.status);
		linked = o.id;
		await tick();
		document.getElementById(`orden-${o.id}`)?.scrollIntoView({ block: 'start' });
	});
	// «Reembolsar todas» (evento cancelado): se abre, se escribe la palabra y recién ahí se manda.
	let confirmingAll = false;
	let typedAll = '';
	let sendingAll = false;
	$: ra = data.refundAll;
	// Las respuestas con error de `?/refundAll` no traen `results`: se lee sin el tipo de la unión.
	/** @type {any} */
	$: rr = /** @type {any} */ (form)?.refundAll;
	$: rrDone = rr?.results ? rr.results.filter((/** @type {any} */ r) => r.ok) : [];
	$: rrFailed = rr?.results ? rr.results.filter((/** @type {any} */ r) => !r.ok) : [];
	/**
	 * `use:enhance` que, al volver, lee en voz alta el mensaje de la acción (`form[key].message`):
	 * el `role="status"` de cada aviso nace junto con su texto y no siempre se lee.
	 *
	 * @param {string} key
	 * @returns {import('@sveltejs/kit').SubmitFunction}
	 */
	const announced =
		(key) =>
		() =>
		async ({ result, update }) => {
			await update();
			announceResult(result, key);
		};
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submitAll = () => {
		sendingAll = true;
		return async ({ result, update }) => {
			await update();
			announceResult(result, 'refundAll');
			// La tanda que salió bien no trae mensaje: se lee el resumen.
			const done = /** @type {any} */ (result).data?.refundAll?.results;
			if (result.type === 'success' && Array.isArray(done)) {
				const failed = done.filter((/** @type {any} */ r) => !r.ok).length;
				announce(
					`Reembolsadas: ${done.length - failed}${failed ? `. Sin reembolsar: ${failed}` : ''}.`,
					{ force: true }
				);
			}
			sendingAll = false;
			confirmingAll = false;
			typedAll = '';
		};
	};
	// «Reembolsar…» de una orden: mientras se pide, el botón queda apagado y dice «Reembolsando…»
	// (como «Reembolsar todas»), para que un segundo toque no mande otro pedido. Al volver, lee el
	// mensaje de la acción en voz alta, como `announced('refund')`.
	let refunding = '';
	/**
	 * @param {string} id
	 * @returns {import('@sveltejs/kit').SubmitFunction}
	 */
	const submitRefund = (id) => () => {
		refunding = id;
		return async ({ result, update }) => {
			await update();
			refunding = '';
			announceResult(result, 'refund');
		};
	};
	$: counts = {
		approved: data.orders.filter((o) => o.status === 'approved').length,
		pending: data.orders.filter((o) => o.status === 'pending' || o.status === 'awaiting_transfer')
			.length,
		refunded: data.orders.filter((o) => o.status === 'refunded').length,
		all: data.orders.length
	};
</script>

<svelte:head><title>Órdenes · {e.title} · Panel</title></svelte:head>

{#if form?.review}
	<p class="flash" class:error={!form.review.ok} role="status">{form.review.message}</p>
{/if}
{#if data.review.length}
	<section class="review" aria-labelledby="revisar" id="revisar-ordenes">
		<h2 id="revisar"><TriangleAlert size={18} aria-hidden="true" /> Para revisar</h2>
		<ul>
			{#each data.review as o (o.id)}
				<li>
					<strong>{o.reference}</strong> · {o.name} · {o.type} × {o.quantity} ·
					{#if o.needsReview === 'late_payment'}
						Pago aprobado con la reserva ya vencida y sin cupo libre: puede haber más entradas
						vendidas que el cupo. Decidí si se acepta o se reembolsa.
					{:else if o.needsReview === 'duplicate_payment'}
						Llegó otro pago aprobado de {formatARS(o.total)} (Mercado Pago n.° {o.reviewDetail})
						para esta orden, que ya estaba pagada: posible cobro doble. Revisalo en Mercado Pago y
						reembolsá el que sobre.
					{:else if o.needsReview === 'door_offline'}
						Venta en la puerta hecha sin conexión: al sincronizarse pasó un límite o quedó
						registrada con otro total que el que se cobró ({o.reviewDetail}). Se guardó igual;
						decidí si queda así o se reembolsa.
					{/if}
					<form method="POST" action="?/reviewed" use:enhance={announced('review')}>
						<input type="hidden" name="order" value={o.id} />
						<button type="submit" class="kv-btn ghost small">Marcar como revisada</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if form?.resend}
	<p class="flash" class:error={!form.resend.ok} role="status">{form.resend.message}</p>
{/if}
{#if form?.emailFix}
	<p class="flash" class:error={!form.emailFix.ok} role="status">{form.emailFix.message}</p>
{/if}
{#if form?.refund}
	<p class="flash" class:error={!form.refund.ok} role="status">{form.refund.message}</p>
{/if}

{#if ra && (ra.mp.count || ra.manual.length || ra.free || rr)}
	<section class="refund-all" aria-labelledby="reembolsar-todas">
		<h2 id="reembolsar-todas">El evento está cancelado: devolver lo vendido</h2>
		{#if rr?.message}
			<p class="flash" class:error={!rr.ok} role="status">{rr.message}</p>
		{/if}
		{#if rr?.results}
			<div class="refund-summary" role="status">
				<p>
					<strong>Reembolsadas: {rrDone.length}</strong>{#if rrFailed.length}
						· <strong class="bad">Sin reembolsar: {rrFailed.length}</strong> (quedaron como estaban; antes
						de devolverlas a mano, revisá cada pago en Mercado Pago: si figura reembolsado, no lo devuelvas
						de nuevo){/if}{#if rr.remaining}
						· faltan {rr.remaining}{/if}.
				</p>
				{#if rr.results.length}
					<ul>
						{#each rr.results as r (r.id)}
							<li class:bad={!r.ok}>
								<span class="ref">{r.reference}</span> · {r.name} · {formatARS(r.total)} · {r.reason}
							</li>
						{/each}
					</ul>
				{/if}
				{#if rr.remaining !== 0 && rr.after}
					<form method="POST" action="?/refundAll" use:enhance={submitAll}>
						<input type="hidden" name="after" value={rr.after} />
						<input type="hidden" name="confirm" value={ra.word} />
						<button type="submit" class="refund-confirm" disabled={sendingAll}>
							{sendingAll
								? 'Reembolsando…'
								: rr.remaining
									? `Seguir con las ${rr.remaining} que faltan`
									: 'Seguir con las que falten'}
						</button>
					</form>
				{/if}
			</div>
		{/if}
		{#if ra.mp.count}
			<p>
				<strong>{ra.mp.count} {ra.mp.count === 1 ? 'orden' : 'órdenes'} de Mercado Pago</strong>
				sin reembolsar, por <strong>{formatARS(ra.mp.total)}</strong> en total.
			</p>
			{#if !confirmingAll}
				<button type="button" class="kv-btn small" on:click={() => (confirmingAll = true)}
					>Reembolsar todas…</button
				>
			{:else}
				<form method="POST" action="?/refundAll" class="refund-panel" use:enhance={submitAll}>
					<input type="hidden" name="count" value={ra.mp.count} />
					<input type="hidden" name="total" value={ra.mp.total} />
					<p>
						Se le pide a Mercado Pago el reembolso TOTAL de cada una, de a {ra.batch} por vez (si son
						más, después aparece «Seguir»). Cada orden reembolsada queda anulada, sale de los totales
						y le avisamos a quien compró por mail, como con «Reembolsar…». Las que Mercado Pago no acepte
						quedan como están, para hacerlas a mano. Lo ya reembolsado no se vuelve a pedir.
					</p>
					<label class="confirm-word">
						<span>Para confirmar, escribí <strong>{ra.word}</strong></span>
						<input name="confirm" bind:value={typedAll} autocomplete="off" spellcheck="false" />
					</label>
					<div class="refund-actions">
						<button
							type="submit"
							class="refund-confirm"
							disabled={sendingAll || typedAll.trim().toUpperCase() !== ra.word}
						>
							{sendingAll
								? 'Reembolsando…'
								: `Reembolsar ${ra.mp.count} ${ra.mp.count === 1 ? 'orden' : 'órdenes'} por ${formatARS(ra.mp.total)}`}
						</button>
						<button
							type="button"
							class="kv-btn ghost small"
							on:click={() => ((confirmingAll = false), (typedAll = ''))}>Cancelar</button
						>
					</div>
				</form>
			{/if}
		{:else}
			<p>No queda ninguna orden de Mercado Pago para reembolsar.</p>
		{/if}
		{#if ra.manual.length}
			<h3>Para devolver a mano</h3>
			<p class="note">
				No pasan por Mercado Pago (puerta, carga a mano o transferencia): devolvé la plata por fuera
				y después marcá cada una con «Reembolsar…» en su orden.
			</p>
			<ul>
				{#each ra.manual as o (o.id)}
					<li>
						<a href="#orden-{o.id}" class="ref">{o.reference}</a> · {o.name} · {PAYMENT_METHOD[
							o.method
						] ?? o.method}{o.channel === 'puerta'
							? ' (puerta)'
							: o.channel === 'manual'
								? ' (carga a mano)'
								: ''} · {formatARS(o.total)}
					</li>
				{/each}
			</ul>
		{/if}
		{#if ra.free}
			<p class="note">
				{ra.free === 1 ? '1 orden sin cargo' : `${ra.free} órdenes sin cargo`}: no hay plata que
				devolver; si hace falta, anulalas desde su orden.
			</p>
		{/if}
	</section>
{/if}

<Card title="Órdenes">
	<svelte:fragment slot="actions">
		<!-- Invitaciones, cortesías o pagos por otro lado (la página es del modo puerta, #103). -->
		<a class="kv-btn small" href="{eventHref(e.slug)}/ordenes/cargar"
			><TicketPlus size={16} aria-hidden="true" /> Cargar entradas a mano</a
		>
		<CsvButton href="{eventHref(e.slug)}/ordenes.csv" label="CSV (una fila por entrada)" />
	</svelte:fragment>
	<div class="tools">
		<label class="filter">
			<span>Mostrar</span>
			<select bind:value={filter}>
				<option value="approved">Aprobadas ({counts.approved})</option>
				<option value="pending">Pendientes ({counts.pending})</option>
				<option value="refunded">Reembolsadas ({counts.refunded})</option>
				<option value="all">Todas ({counts.all})</option>
			</select>
		</label>
		<label class="filter">
			<span>Ordenar</span>
			<select bind:value={orderBy} on:change={writeSortUrl}>
				{#each ORDER_SORTS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
			</select>
		</label>
		<label class="search">
			<Search size={16} aria-hidden="true" />
			<span class="sr-only">Buscar una orden</span>
			<input
				type="search"
				bind:value={query}
				placeholder="Nombre, email, DNI o KV-…"
				autocomplete="off"
			/>
		</label>
	</div>

	{#if searchingDni}
		<p class="searching" role="status">Buscando por DNI…</p>
	{:else if visible.length === 0}
		<EmptyState icon={ReceiptText} title="No hay órdenes para mostrar" />
	{/if}
	<ul class="orders">
		{#each shown as o (o.id)}
			<li class="order status-{o.status}" class:linked={o.id === linked} id="orden-{o.id}">
				<div class="who">
					<strong>{o.name}</strong>{#if o.pronouns}<span class="muted">({o.pronouns})</span>{/if}
					<DniReveal orderId={o.id} tail={o.dniTail} {form} />
					<a href="mailto:{o.email}">{o.email}</a>
					<Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}
						><span class="status">{ORDER_STATUS[o.status]}</span></Badge
					>
				</div>
				<div class="what">
					{o.quantity} × {o.type} · <strong>{formatARS(o.total)}</strong>
					{#if o.gorra !== null}<small>(a la gorra, {formatARS(o.gorra)} c/u)</small>{/if}
					{#if o.fondo}<small>(fondo −{formatARS(o.fondo)})</small>{/if}
					{#if o.contribution}<small
							>({fondoOptionLabel(o.fondoOption)}: aporte al fondo +{formatARS(
								o.contribution
							)})</small
						>{/if}
					{#if o.discountAmount}<small
							>(código {o.discountCode}, −{formatARS(o.discountAmount)})</small
						>{/if}
					{#if o.surcharge}<small>(recargo MP +{formatARS(o.surcharge)})</small>{/if}
					{#if o.mpFee !== null}<small>(comisión de MP {formatARS(o.mpFee)})</small>{/if}
					· {PAYMENT_METHOD[o.method]}
					{#if o.status === 'approved'}
						· ingresaron {o.checkedIn}/{o.quantity}
					{/if}
				</div>
				{#if o.refundedAmount}<p class="admin-note">
						Reembolso parcial en Mercado Pago: {formatARS(o.refundedAmount)} (quedan {formatARS(
							Math.max(0, o.total - o.refundedAmount)
						)})
					</p>{/if}
				{#if o.priceChange}<p class="admin-note">{o.priceChange}</p>{/if}
				{#if o.note}
					<!-- Nota de la carga a mano o de la venta en la puerta (solo en el panel). -->
					<p class="admin-note"><strong>Nota:</strong> <span class="pre">{o.note}</span></p>
				{/if}
				{#if o.holders.length}
					<div class="kv-table-wrap">
						<table class="kv-table holders">
							<thead>
								<tr><th>#</th><th>Entrada a nombre de</th><th>Pronombres</th></tr>
							</thead>
							<tbody>
								{#each o.holders as h, i (i)}
									<tr class:inside={h.checkedIn}>
										<td>{i + 1}</td>
										<td
											>{h.name}{#if h.checkedIn}&nbsp;<CircleCheck
													size={15}
													class="in"
													aria-label="ingresó"
												/>{/if}</td
										>
										<td>{h.pronouns || '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				<OrderAnswers answers={o.answers} />
				<div class="meta">
					<span class="ref">{o.reference}</span> · {shortTime(o.createdAt)}{#if o.paymentId}
						· pago MP {o.paymentId}{/if}{#if o.confirmedBy}
						· {o.status === 'cancelled' ? 'canceló' : 'confirmó'} {o.confirmedBy}{/if}
					{#if o.status === 'approved'}
						· {#if o.emailProblem}<strong class="mail-problem"
								>{EMAIL_PROBLEM[o.emailProblem] ?? 'mail enviado'}</strong
							>{:else}{o.emailSent ? 'mail enviado' : 'mail NO enviado'}{/if}
						<form method="POST" action="?/resend" use:enhance={announced('resend')}>
							<input type="hidden" name="order" value={o.id} />
							<button type="submit" class="kv-btn ghost small">Reenviar mail</button>
						</form>
					{/if}
					{#if o.status === 'refunded'}
						· reembolsada {o.refundedAt ? shortTime(o.refundedAt) : ''}{o.refundedBy
							? ` por ${o.refundedBy}`
							: ' (desde Mercado Pago)'}
					{/if}
				</div>
				{#if o.status === 'approved'}
					<!-- Quien compró escribió mal su mail: se corrige y las entradas salen a la nueva. -->
					<details class="email-fix" open={form?.emailFix?.order === o.id && !form.emailFix.ok}>
						<summary>Corregir el mail…</summary>
						<form
							method="POST"
							action="?/email"
							use:enhance={announced('emailFix')}
							class="email-fix-form"
						>
							<input type="hidden" name="order" value={o.id} />
							<label>
								<span>Mail nuevo</span>
								<input
									type="email"
									name="email"
									required
									maxlength="254"
									autocomplete="off"
									spellcheck="false"
								/>
							</label>
							<button type="submit" class="kv-btn small">Corregir el mail y reenviar</button>
						</form>
						<p class="note">
							Las entradas salen a la dirección nueva; a la anterior no le mandamos nada más.
						</p>
					</details>
				{/if}
				{#if o.status === 'approved'}
					<!-- Paso de confirmación: se abre, se revisa y recién ahí se reembolsa. -->
					<details class="refund">
						<summary>Reembolsar…</summary>
						<div class="refund-panel">
							<p>
								<strong>{formatARS(Math.max(0, o.total - o.refundedAmount))}</strong> a
								<strong>{o.name}</strong> ({o.email}) ·
								{o.quantity}
								{o.quantity === 1 ? 'entrada' : 'entradas'}{#if o.holders.length}:
									{o.holders.map((h) => h.name).join(', ')}{/if}.
							</p>
							<p class="note">
								{#if o.method === 'mercadopago'}
									Se pide a Mercado Pago el reembolso TOTAL del pago {o.paymentId} (tiene que haber saldo
									en la cuenta; hasta 180 días desde el pago).
								{:else if o.method === 'transferencia'}
									No hay devolución automática: primero devolvé la transferencia a mano, después
									marcala acá.
								{:else}
									Compra sin cargo: solo se anulan las entradas.
								{/if}
								Las entradas quedan anuladas (el control de ingreso las rechaza), se libera el cupo y
								el uso del código, sale de los totales y le avisamos por mail.
							</p>
							<form method="POST" action="?/refund" use:enhance={submitRefund(o.id)}>
								<input type="hidden" name="order" value={o.id} />
								<button
									type="submit"
									class="refund-confirm"
									disabled={refunding === o.id}
									aria-busy={refunding === o.id}
								>
									{refunding === o.id
										? 'Reembolsando…'
										: o.method === 'mercadopago'
											? `Confirmar reembolso de ${formatARS(Math.max(0, o.total - o.refundedAmount))}`
											: o.method === 'transferencia'
												? 'Marcar como reembolsada (transferencia devuelta a mano)'
												: 'Anular las entradas'}
								</button>
							</form>
						</div>
					</details>
				{/if}
			</li>
		{/each}
	</ul>
</Card>

<style>
	.flash {
		background: var(--ok-bg);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		margin: 0 0 1rem;
	}
	.flash.error {
		background: var(--error-bg);
		color: var(--error);
	}
	.refund-all {
		border: 2px solid var(--bad);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-s);
		margin: 0 0 1rem;
		font-size: var(--text-sm);
	}
	.refund-all h2 {
		font-size: var(--text-sm);
		margin: 0.3rem 0;
	}
	.refund-all h3 {
		font-size: var(--text-sm);
		margin: 0.8rem 0 0.2rem;
	}
	.refund-all ul {
		padding-left: 1.2em;
		overflow-wrap: anywhere;
	}
	.refund-all .bad {
		color: var(--bad);
	}
	.refund-summary {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--space-3xs) var(--space-xs);
		margin-bottom: 0.6rem;
	}
	.confirm-word {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		max-width: 20rem;
		margin-bottom: 0.6rem;
	}
	.confirm-word input {
		min-height: 2.5rem;
		padding: 0 var(--space-2xs);
		border: 1px solid var(--field);
		border-radius: var(--radius-m);
		background: var(--surface);
		color: var(--text);
	}
	.refund-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
	}
	.refund-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.review {
		background: var(--warn-bg);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-s);
		margin: 0 0 1rem;
	}
	.review h2 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-sm);
		margin: 0.3rem 0;
	}
	.review ul {
		padding-left: 1.2em;
	}
	.review li {
		margin-bottom: 0.6em;
	}
	.review form {
		display: inline;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
	}
	.filter {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.filter select {
		padding: 0.45rem var(--space-2xs);
		min-height: 2.5rem;
		border-radius: 3em;
		border: 1px solid var(--field);
		background: var(--surface);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--field);
		border-radius: 3em;
		padding: 0 var(--space-xs);
		flex: 1 1 14rem;
		max-width: 22rem;
		color: var(--muted);
		background: var(--surface);
	}
	.search input {
		border: 0;
		background: transparent;
		min-height: 2.5rem;
		width: 100%;
		min-width: 0;
		color: var(--text);
	}
	.search input:focus {
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--link);
		outline-offset: 2px;
	}
	.order {
		/* 5rem en total: en el celu, parte la pone el scroll-padding del panel. */
		scroll-margin-top: calc(5rem - var(--panel-scroll-top, 0px));
	}
	.order:target,
	.order.linked {
		box-shadow: 0 0 0 3px var(--link);
	}
	.orders {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.order {
		border: 1px solid var(--line);
		border-left: 4px solid var(--line);
		border-radius: var(--card-round);
		padding: var(--space-2xs) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.status-approved {
		border-left-color: var(--3);
	}
	.status-pending,
	.status-awaiting_transfer {
		border-left-color: var(--4);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem var(--space-xs);
		align-items: center;
		overflow-wrap: anywhere;
	}
	.searching {
		margin: var(--space-2xs) 0;
		color: var(--muted);
	}
	.ref {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.what,
	.meta {
		font-size: var(--text-sm);
	}
	.meta {
		color: var(--muted);
	}
	.meta form {
		display: inline;
	}
	.mail-problem {
		color: var(--bad);
	}
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
	}
	.holders {
		font-size: var(--text-xs);
	}
	.holders :global(.in) {
		color: var(--ok);
		vertical-align: -0.15em;
	}
	.holders .inside {
		background: var(--ok-bg);
	}
	.email-fix,
	.refund {
		font-size: var(--text-sm);
	}
	.email-fix summary {
		cursor: pointer;
		font-weight: 700;
	}
	.email-fix-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: end;
		margin-top: 0.4rem;
	}
	.email-fix-form label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1 1 14rem;
		max-width: 22rem;
	}
	.email-fix-form input {
		min-height: 2.5rem;
		padding: 0 var(--space-2xs);
		border: 1px solid var(--field);
		border-radius: var(--radius-m);
		background: var(--surface);
		color: var(--text);
	}
	.email-fix .note {
		margin: 0.3em 0 0;
	}
	.refund summary {
		cursor: pointer;
		color: var(--bad);
		font-weight: 700;
	}
	.refund-panel {
		margin-top: 0.4rem;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--bad-bg);
	}
	.refund-panel p {
		margin: 0.2em 0 0.5em;
	}
	.admin-note {
		margin: 0;
		font-size: var(--text-sm);
	}
	.admin-note .pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.note {
		color: var(--muted);
	}
	.refund-confirm {
		font-weight: 700;
		border: 0;
		border-radius: 2em;
		padding: var(--space-2xs) var(--space-s);
		min-height: 2.75rem;
		cursor: pointer;
		background: var(--bad);
		color: var(--surface);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
