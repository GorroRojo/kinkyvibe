<script>
	/**
	 * Ventas › Órdenes del evento (+page.server.js). Dos vistas, con un interruptor arriba que queda
	 * en la URL (`?vista=respuestas`):
	 *
	 * - «Compras»: una tarjeta por compra con todo a la vista (OrderCard). Filtros: el estado
	 *   (`?estado=`; arranca en «Transferencias por confirmar» si hay, si no en «Aprobadas»), los
	 *   interruptores de «Filtros», una respuesta (desde «Respuestas» o «ver quiénes respondieron
	 *   igual») y el buscador (también por DNI, en el servidor, y por respuesta). «Ordenar» en
	 *   `?orden=`. Un evento chico (hasta 5 compras) las muestra todas, sin filtros ni «Ordenar».
	 * - «Respuestas»: una tarjeta por pregunta, con las compras aprobadas (AnswersView).
	 *
	 * En «Compras», una casilla por compra y «Elegir todas las que se ven» (con los filtros de ese
	 * momento): con alguna elegida aparece la barra de varias compras (OrderBulkBar). Mientras la
	 * página está abierta pregunta cada tanto por compras nuevas (`ordenes/nuevas`) y, si hay,
	 * avisa «2 compras nuevas · Mostrar» arriba en vez de meterlas en la lista (no salta).
	 *
	 * Lógica pura en $lib/admin/ordersView.js, orderBulk.js y newOrders.js.
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { ReceiptText, TicketPlus, TriangleAlert } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import OverrideDialog from '$lib/components/admin/panel/OverrideDialog.svelte';
	import Segmented from '$lib/components/ui/Segmented.svelte';
	import OrderCard from '$lib/components/admin/ordenes/OrderCard.svelte';
	import OrderFilters from '$lib/components/admin/ordenes/OrderFilters.svelte';
	import AnswersView from '$lib/components/admin/ordenes/AnswersView.svelte';
	import RefundAllPanel from '$lib/components/admin/ordenes/RefundAllPanel.svelte';
	import OrderBulkBar from '$lib/components/admin/ordenes/OrderBulkBar.svelte';
	import { keepVisible } from '$lib/admin/orderBulk.js';
	import { NEW_ORDERS_POLL_MS, countNewOrders, newOrdersText } from '$lib/admin/newOrders.js';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { announceResult } from '$lib/admin/announce.js';
	import { eventHref } from '$lib/admin/nav.js';
	import { foldSearch } from '$lib/admin/eventFormat.js';
	import { confirmPaymentSubmit, keepRows } from '$lib/admin/transferConfirm.js';
	import { dniQueryDigits, orderFilterFor, orderIdFromHash } from '$lib/admin/orderFormat.js';
	import {
		ORDER_TOGGLES,
		SMALL_EVENT_MAX,
		STATUS_FILTERS,
		defaultStatus,
		filterOrders,
		matchesAnswer,
		matchesStatus,
		matchesToggle,
		orderSearchText,
		questionCards,
		statusFilterOf,
		tally
	} from '$lib/admin/ordersView.js';
	import { formatARS } from '$lib/utils/money.js';
	import { transferRuleText } from '$lib/utils/transferDeadline.js';
	import { DEFAULT_ORDER_SORT, orderSortOf, sortOrders } from '$lib/admin/orderSort.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;
	/** @typedef {(typeof data.orders)[number]} Order */

	// Un evento chico (hasta 5 compras) no tiene filtros; sin preguntas no hay «Respuestas».
	$: small = data.orders.length <= SMALL_EVENT_MAX;
	$: hasQuestions = data.fields.length > 0 || data.orders.some((o) => o.answers.length > 0);

	/** La orden de la que habla la respuesta de una acción sin JavaScript (para no esconderla). */
	function formOrder() {
		const f = /** @type {any} */ (form);
		const dniKey = typeof f?.dni?.key === 'string' ? f.dni.key.replace(/^orden:/, '') : '';
		const id = f?.emailFix?.order || f?.transfer?.order || dniKey;
		return id ? data.orders.find((o) => o.id === id) : undefined;
	}

	/** @type {'compras' | 'respuestas'} */
	let view = 'compras';
	let status = 'todas';
	/** @type {string[]} */
	let toggles = [];
	/** @type {import('$lib/admin/ordersView.js').AnswerFilter | null} */
	let answerFilter = null;
	let query = '';
	/**
	 * Cómo arranca la página (y otra vez si se pasa a otro evento sin recargar): la vista y el
	 * estado de la URL, o los de siempre; sin otros filtros.
	 */
	function start() {
		const isSmall = data.orders.length <= SMALL_EVENT_MAX;
		const questions = data.fields.length > 0 || data.orders.some((o) => o.answers.length > 0);
		view = data.initial?.view === 'respuestas' && questions ? 'respuestas' : 'compras';
		status = isSmall ? 'todas' : statusFilterOf(data.initial?.status) || defaultStatus(data.orders);
		const o = formOrder();
		if (o) status = orderFilterFor(status, o);
		toggles = [];
		answerFilter = null;
		query = '';
	}
	start();
	let startedFor = data.event.slug;
	$: if (data.event.slug !== startedFor) {
		startedFor = data.event.slug;
		start();
	}
	$: words = foldSearch(query).split(/\s+/).filter(Boolean);
	$: fieldIds = new Set(data.fields.map((f) => f.id));

	// El DNI completo no está en la página: las palabras que parecen un DNI se buscan en el
	// servidor (`?/dniSearch`, devuelve los ids de las órdenes que coinciden). Nombre, email,
	// referencia, personas y respuestas se buscan acá.
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

	$: filtered = filterOrders(data.orders, {
		status,
		toggles: small ? [] : toggles,
		answer: answerFilter,
		fieldIds
	});
	$: visible = words.length
		? filtered.filter((o) => {
				const hay = orderSearchText(o);
				return words.every((w) => matches(w, hay, o.id));
			})
		: filtered;
	// Una búsqueda sin nada en este estado: cuántas hay en los demás (para ofrecer «Todas»).
	$: elsewhere =
		words.length && visible.length === 0 && status !== 'todas'
			? filterOrders(data.orders, {
					status: 'todas',
					toggles: small ? [] : toggles,
					answer: answerFilter,
					fieldIds
				}).filter((o) => {
					const hay = orderSearchText(o);
					return words.every((w) => matches(w, hay, o.id));
				}).length
			: 0;
	// «Ordenar» (tarjetas, no una tabla): llegan todas las órdenes del evento, así que se ordenan
	// acá. Queda en la URL (`?orden=total`) sin volver a cargar la página; se lee al montar.
	let orderBy = DEFAULT_ORDER_SORT;
	$: shown = sortOrders(visible, small ? DEFAULT_ORDER_SORT : orderBy);

	// Los filtros, con «🧾 compras · 👥 personas»: los estados sobre todas las órdenes, los
	// interruptores dentro del estado elegido. Sin las que no tienen nada (salvo la elegida).
	$: statuses = STATUS_FILTERS.map((s) => {
		const list = data.orders.filter((o) => matchesStatus(o, s.id));
		return { ...s, count: list.length, tally: tally(list) };
	}).filter((s) => s.count || s.id === status || s.id === 'todas');
	$: inStatus = data.orders.filter((o) => matchesStatus(o, status));
	$: toggleOptions = ORDER_TOGGLES.filter((t) => t.id !== 'primera-vez' || data.firstKnown)
		.map((t) => {
			const list = inStatus.filter((o) => matchesToggle(o, t.id));
			return {
				...t,
				label: t.id === 'primera-vez' && data.series ? `Primera vez en ${data.series}` : t.label,
				count: list.length,
				tally: tally(list, t.id)
			};
		})
		.filter((t) => t.count || toggles.includes(t.id));

	// «Respuestas»: con las compras aprobadas (las de la gente que viene).
	$: approved = data.orders.filter((o) => o.status === 'approved');
	$: cards = questionCards(data.fields, approved);
	$: answersScope = `Compras aprobadas · ${tally(approved)}`;

	// La URL dice la vista, el estado y el orden (sin recargar la página).
	let mounted = false;
	/**
	 * @param {string} v
	 * @param {string} s
	 * @param {string} sort
	 */
	function writeUrl(v, s, sort) {
		const url = new URL(location.href);
		const set = (/** @type {string} */ key, /** @type {string} */ value) =>
			value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
		set('vista', v === 'respuestas' ? 'respuestas' : '');
		// El estado: el de siempre no se escribe, salvo que el link ya lo trajera; un evento chico
		// no tiene filtro y deja la URL como vino.
		if (!small) set('estado', s === defaultStatus(data.orders) && !data.initial?.status ? '' : s);
		set('orden', sort === DEFAULT_ORDER_SORT ? '' : sort);
		if (url.href !== location.href) replaceState(url, {});
	}
	$: if (mounted) writeUrl(view, status, orderBy);

	// Link a una orden (`#orden-<id>`: «¿Te equivocaste? Ver la orden» de la Puerta, un nombre de
	// «Respuestas», la lista de «Reembolsar todas»): pasa a Compras, saca los filtros que la
	// esconden, baja hasta ella y la marca (`:target` no siempre se aplica después de una
	// navegación del lado del cliente).
	let linked = '';
	/** @param {string} id */
	async function revealOrder(id) {
		const o = data.orders.find((x) => x.id === id);
		if (!o) return;
		view = 'compras';
		if (!small) status = orderFilterFor(status, o);
		if (!toggles.every((t) => matchesToggle(o, t))) toggles = [];
		if (answerFilter && !matchesAnswer(o, answerFilter, fieldIds)) answerFilter = null;
		const hay = orderSearchText(o);
		if (!words.every((w) => matches(w, hay, o.id))) query = '';
		linked = o.id;
		if (mounted && location.hash !== `#orden-${encodeURIComponent(o.id)}`) {
			const url = new URL(location.href);
			url.hash = `orden-${encodeURIComponent(o.id)}`;
			replaceState(url, {});
		}
		await tick();
		document.getElementById(`orden-${o.id}`)?.scrollIntoView({ block: 'start' });
	}
	const onHash = () => {
		const id = orderIdFromHash(location.hash);
		if (id) revealOrder(id);
	};
	onMount(() => {
		orderBy = orderSortOf(new URL(location.href).searchParams.get('orden'));
		mounted = true;
		onHash();
		addEventListener('hashchange', onHash);
		return () => removeEventListener('hashchange', onHash);
	});

	/**
	 * Filtrar las compras por una respuesta (una barra de «Respuestas» o «ver quiénes respondieron
	 * igual»). Desde «Respuestas», con las aprobadas (las que cuenta) y sin los demás filtros.
	 * @param {import('$lib/admin/ordersView.js').AnswerFilter} filter
	 * @param {boolean} fromAnswers
	 */
	async function filterByAnswer(filter, fromAnswers) {
		answerFilter = filter;
		query = '';
		if (fromAnswers) {
			view = 'compras';
			toggles = [];
			if (!small) status = 'aprobadas';
		}
		await tick();
		document.getElementById('lista-ordenes')?.scrollIntoView({ block: 'start' });
	}

	// Transferencias: «Llegó la transferencia ✓» (pregunta corta, límites con OverrideDialog) y
	// «Cancelar»; el resultado queda en la tarjeta, que se sigue viendo aunque el filtro ya no la
	// muestre (ver transferConfirm.js). Cambiar los filtros lo limpia.
	/** @type {OverrideDialog} */
	let overrideDialog;
	/** @type {string | null} */
	let busy = null;
	/** @type {import('$lib/admin/transferConfirm.js').KeptRow<Order>[]} */
	let kept = [];
	/** @param {import('$lib/admin/transferConfirm.js').KeptRow<Order>} k */
	const keep = (k) => (kept = [...kept.filter((x) => x.row.id !== k.row.id), k]);
	$: (status, toggles, answerFilter, view, (kept = []));
	/**
	 * @param {Order} row
	 * @param {number} index
	 */
	const confirmPayment = (row, index) =>
		confirmPaymentSubmit({
			row,
			index,
			overrideDialog: () => overrideDialog,
			setBusy: (id) => (busy = id),
			onResult: keep,
			refresh: invalidateAll
		});
	/**
	 * @param {Order} row
	 * @param {number} index
	 * @returns {import('@sveltejs/kit').SubmitFunction}
	 */
	const cancelTransfer =
		(row, index) =>
		async ({ cancel }) => {
			const ok = await askConfirm({
				title: `¿Cancelar ${row.reference}?`,
				text: 'Se libera el cupo.',
				confirmLabel: 'Cancelar la orden',
				cancelLabel: 'Volver',
				tone: 'danger'
			});
			if (!ok) return cancel();
			busy = row.id;
			return async ({ result }) => {
				busy = null;
				announceResult(result, 'transfer');
				const body = /** @type {any} */ (
					result.type === 'success' || result.type === 'failure' ? result.data : null
				);
				keep({
					row,
					index,
					ok: result.type === 'success',
					message: body?.transfer?.message ?? 'No se pudo cancelar: probá de nuevo.'
				});
				await invalidateAll();
			};
		};
	// La tarjeta muestra la orden como quedó (confirmada, cancelada) con su aviso.
	$: byId = new Map(data.orders.map((o) => [o.id, o]));
	$: rows = keepRows(
		[...shown],
		kept.map((k) => ({ ...k, row: byId.get(k.row.id) ?? k.row }))
	);
	$: anyWaiting = rows.some(({ row }) => row.transferPending);

	// Varias compras a la vez: los ids elegidos, siempre entre las que se ven (cambiar los filtros o
	// que una compra deje de verse la saca). Volver a leer las órdenes no la pierde.
	/** @type {string[]} */
	let picked = [];
	let bulkMessage = '';
	$: visibleIds = new Set(view === 'compras' ? rows.map(({ row }) => row.id) : []);
	$: picked = keepVisible(picked, visibleIds);
	$: pickedSet = new Set(picked);
	$: pickedOrders = rows.map(({ row }) => row).filter((o) => pickedSet.has(o.id));
	$: allPicked = rows.length > 0 && picked.length === rows.length;
	$: somePicked = picked.length > 0 && !allPicked;
	/**
	 * @param {string} id
	 * @param {boolean} on
	 */
	function pick(id, on) {
		bulkMessage = '';
		picked = on ? [...picked.filter((x) => x !== id), id] : picked.filter((x) => x !== id);
	}
	/** @param {boolean} on */
	function pickAll(on) {
		bulkMessage = '';
		picked = on ? rows.map(({ row }) => row.id) : [];
	}

	// «2 compras nuevas · Mostrar»: cada tanto (con la pestaña a la vista) se pregunta qué cambió
	// desde que se leyeron las órdenes (`loadedAt`). No se meten solas: «Mostrar» las trae.
	let newCount = 0;
	let lastPoll = 0;
	let showing = false;
	$: (data.loadedAt, (newCount = 0));
	async function pollNew() {
		if (document.visibilityState !== 'visible' || !data.loadedAt) return;
		lastPoll = Date.now();
		const since = data.loadedAt;
		try {
			const res = await fetch(`${eventHref(e.slug)}/ordenes/nuevas?desde=${since}`);
			if (!res.ok) return;
			const body = await res.json();
			if (since === data.loadedAt && Array.isArray(body?.orders)) {
				newCount = countNewOrders(body.orders, data.orders);
			}
		} catch {
			// Sin conexión: se prueba en la próxima vuelta.
		}
	}
	async function showNew() {
		showing = true;
		await invalidateAll();
		showing = false;
	}
	onMount(() => {
		const timer = setInterval(pollNew, NEW_ORDERS_POLL_MS);
		const onVisible = () => {
			if (document.visibilityState === 'visible' && Date.now() - lastPoll > NEW_ORDERS_POLL_MS) {
				pollNew();
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	/**
	 * `use:enhance` que, al volver, lee en voz alta el mensaje de la acción (`form[key].message`).
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

{#each ['resend', 'emailFix', 'refund'] as key (key)}
	{@const f = /** @type {any} */ (form)?.[key]}
	{#if f?.message}<p class="flash" class:error={!f.ok} role="status">{f.message}</p>{/if}
{/each}
{#if form?.transfer}
	<p class="flash" class:error={!form.transfer.ok} role="status">{form.transfer.message}</p>
	{#if 'needsConfirmation' in form.transfer && form.transfer.needsConfirmation}
		<!-- Sin JavaScript: la confirmación en la página (por eso la página es same-origin). Con
		     JavaScript no aparece (la pregunta es el diálogo), pero si aparece también anda. -->
		<form
			class="flash error"
			method="POST"
			use:enhance
			action={'action' in form.transfer && form.transfer.action === 'reopen'
				? '?/reopen'
				: '?/confirm'}
		>
			{#each form.transfer.needsConfirmation.limits as l}<p>{l.message}</p>{/each}
			<input type="hidden" name="order" value={form.transfer.order} />
			<button
				class="kv-btn small"
				type="submit"
				name="override"
				value={form.transfer.needsConfirmation.key}>Sí, confirmar igual</button
			>
		</form>
	{/if}
{/if}

<RefundAllPanel ra={data.refundAll} {form} onReveal={revealOrder} />

<Card title="Órdenes">
	<svelte:fragment slot="actions">
		<!-- Invitaciones, cortesías o pagos por otro lado (la página es del modo puerta, #103). -->
		<a class="kv-btn small" href="{eventHref(e.slug)}/ordenes/cargar"
			><TicketPlus size={16} aria-hidden="true" /> Cargar entradas a mano</a
		>
		<CsvButton href="{eventHref(e.slug)}/ordenes.csv" label="CSV (una fila por entrada)" />
	</svelte:fragment>
	{#if newCount}
		<p class="new-orders" role="status">
			{newOrdersText(newCount)} ·
			<button type="button" class="kv-btn small" disabled={showing} on:click={showNew}
				>Mostrar</button
			>
		</p>
	{/if}
	{#if hasQuestions}
		<div class="view">
			<Segmented
				label="Ver"
				options={[
					{ value: 'compras', label: 'Compras' },
					{ value: 'respuestas', label: 'Respuestas' }
				]}
				bind:value={view}
			/>
		</div>
	{/if}

	{#if view === 'respuestas'}
		<AnswersView
			{cards}
			scope={answersScope}
			questionsHref={eventHref(e.slug, 'preguntas')}
			onFilter={(card, value) =>
				filterByAnswer(
					{ key: card.key, value, label: `${card.label}: ${value}`, multi: card.kind === 'multi' },
					true
				)}
			onReveal={revealOrder}
		/>
	{:else}
		<OrderFilters
			bind:status
			bind:toggles
			bind:orderBy
			bind:query
			{statuses}
			{toggleOptions}
			{small}
			answer={answerFilter}
			onClearAnswer={() => (answerFilter = null)}
		/>
		{#if anyWaiting}
			<p class="rule">
				Buscá la referencia en el concepto de la transferencia y el comprobante que mandó la
				persona. Confirmá solo cuando la plata esté en la cuenta. Cada reserva dura {transferRuleText()},
				o hasta que empiece el evento si es antes.
			</p>
		{/if}
		{#if searchingDni}
			<p class="searching" role="status">Buscando por DNI…</p>
		{:else if rows.length === 0}
			<EmptyState icon={ReceiptText} title="No hay órdenes para mostrar" />
			{#if elsewhere}
				<p class="elsewhere">
					<button type="button" class="kv-btn ghost small" on:click={() => (status = 'todas')}
						>{elsewhere === 1
							? 'Hay 1 en otro estado: ver en «Todas»'
							: `Hay ${elsewhere} en otros estados: ver en «Todas»`}</button
					>
				</p>
			{/if}
		{/if}
		{#if rows.length > 1}
			<label class="pick-all">
				<input
					type="checkbox"
					checked={allPicked}
					indeterminate={somePicked}
					on:change={(ev) => pickAll(ev.currentTarget.checked)}
				/>
				Elegir todas las que se ven
			</label>
		{/if}
		<ul class="orders" id="lista-ordenes">
			{#each rows as { row: o, result }, i (o.id)}
				<OrderCard
					selected={pickedSet.has(o.id)}
					onSelect={(on) => pick(o.id, on)}
					{o}
					{form}
					{result}
					fields={data.fields}
					busy={busy === o.id}
					linked={o.id === linked}
					{overrideDialog}
					confirmSubmit={confirmPayment(o, i)}
					cancelSubmit={cancelTransfer(o, i)}
					onFilter={(a) =>
						filterByAnswer({ key: a.key, value: a.value, label: `${a.label}: ${a.value}` }, false)}
				/>
			{/each}
		</ul>
		<OrderBulkBar
			selected={pickedOrders}
			csvHref="{eventHref(e.slug)}/ordenes.csv"
			bind:message={bulkMessage}
			onDone={invalidateAll}
			onClear={() => pickAll(false)}
		/>
	{/if}
</Card>

<OverrideDialog bind:this={overrideDialog} confirmLabel="Sí, confirmar igual" />

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
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
	}
	.view {
		margin-bottom: var(--space-2xs);
	}
	.rule {
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.elsewhere {
		margin: 0;
		text-align: center;
	}
	.searching {
		margin: var(--space-2xs) 0;
		color: var(--muted);
	}
	.new-orders {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3xs) var(--space-2xs);
		margin: 0 0 var(--space-2xs);
		padding: var(--space-3xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--ok-bg);
		font-weight: 600;
	}
	.pick-all {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: 0 0 var(--space-3xs);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.pick-all input {
		width: 1.15rem;
		height: 1.15rem;
		margin: 0;
		accent-color: var(--link);
	}
	.orders {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		scroll-margin-top: calc(5rem - var(--panel-scroll-top, 0px));
	}
</style>
