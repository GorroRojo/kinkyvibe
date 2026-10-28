<script>
	import { argDateLog, argTime } from '$lib/utils/dates.js';
	/**
	 * Modo puerta: pantalla completa y oscura (sin menús del panel), con la pantalla siempre
	 * prendida (Wake Lock), escáner de QR, resultado grande, "Escribir código", "Buscar persona",
	 * "Vender en puerta", últimos escaneos y modo sin conexión (ver $lib/admin/doorOffline.js).
	 *
	 * La usan las dos entradas al modo puerta (la lógica del servidor es una sola,
	 * $lib/server/tickets/doorScreen.js): el panel (/admin/eventos/<slug>/ingreso) y la puerta con
	 * link (/puerta/<slug>, `data.doorLink`). Con un link no hay nada del panel: ni volver a la
	 * ficha, ni órdenes, ni cargar a mano, ni otro evento, ni el DNI completo, ni pasar límites.
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import { deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import {
		ArrowLeft,
		CircleCheck,
		CircleHelp,
		CircleX,
		CloudCheck,
		CloudUpload,
		Ellipsis,
		Keyboard,
		NotebookPen,
		RefreshCw,
		Search,
		Store,
		TriangleAlert,
		Undo2,
		Volume2,
		VolumeX,
		WifiOff,
		X
	} from '@lucide/svelte';
	import DoorScanner from '$lib/components/admin/door/DoorScanner.svelte';
	import DoorResult from '$lib/components/admin/door/DoorResult.svelte';
	import DoorGuide from '$lib/components/admin/door/DoorGuide.svelte';
	import Sheet from '$lib/components/admin/door/Sheet.svelte';
	import OverrideDialog from '$lib/components/admin/panel/OverrideDialog.svelte';
	import WaitlistDoorNote from '$lib/components/admin/WaitlistDoorNote.svelte';
	import { eventHref } from '$lib/admin/nav.js';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { orderHref } from '$lib/admin/orderFormat.js';
	import { CHECKIN_LIST_PARAM } from '$lib/utils/doorEvents.js';
	import { DOOR_NOTICE_TEXT } from '$lib/utils/doorNotices.js';
	import {
		FREE_DOOR_MESSAGE,
		ORDER_MAX_MESSAGE,
		computePrice,
		defaultFondoOption,
		exceedsOrderMax,
		parseAmount
	} from '$lib/utils/tickets.js';
	import {
		DOOR_SALE_DEFAULT_METHOD,
		doorChargedPrice,
		doorOptionLabel,
		doorPriceChangeText,
		doorSaleBreakdown,
		parseDoorAmount,
		resetDoorSaleForm
	} from '$lib/admin/doorSale.js';
	import { formatARS } from '$lib/utils/money.js';
	import { entradas } from '$lib/utils/plural.js';
	import {
		applySyncResults,
		findTicket,
		loadDoorState,
		localCheckIn,
		localCounts,
		localSearch,
		mergeServerList,
		parseScan,
		saveDoorState,
		undoLocal,
		invalidTitle,
		markRecentUndone,
		markRecentSynced,
		doorConnectionNote,
		applySaleSyncResults,
		discardQueuedSale,
		emptyDoorState,
		doorRecentKey,
		dropLinkDoor,
		forgetLinkDoor,
		isPendingSaleTicket,
		markRecentDiscarded,
		pendingSaleId,
		offlineSaleLimits,
		pendingNote,
		queueOfflineSale,
		salesPayload
	} from '$lib/admin/doorOffline.js';

	/** @type {Awaited<ReturnType<typeof import('$lib/server/tickets/doorScreen.js').doorLoad>>} */
	export let data;
	/** @type {any} */
	export let form = null;

	/** @typedef {import('$lib/admin/doorOffline.js').DoorScan} DoorScan */
	/** @typedef {import('$lib/admin/doorOffline.js').DoorCard} Card */
	/** @typedef {import('$lib/admin/doorOffline.js').DoorState} DoorState */

	const METHOD_TEXT = /** @type {Record<string, string>} */ ({
		mercadopago: 'Mercado Pago',
		transferencia: 'Transferencia',
		gratis: 'Sin cargo',
		efectivo: 'Efectivo',
		otro: 'Otro medio'
	});
	const STATUS_TEXT = /** @type {Record<string, string>} */ ({
		pending: 'Pendiente',
		awaiting_transfer: 'Esperando transferencia',
		approved: 'Aprobada',
		rejected: 'Rechazada',
		cancelled: 'Cancelada',
		refunded: 'Reembolsada',
		expired: 'Vencida'
	});

	// --- Links a la ficha del evento ---
	$: base = data.doorBase;
	/** Puerta con link (sin cuenta): sin nada del panel. */
	$: linkMode = Boolean(data.doorLink);
	/** «Cerrar la puerta en este celu» borra lo guardado: no con cosas por sincronizar o sin registrar. */
	$: canLeave = pending === 0 && door.failed.length === 0;
	$: backHref = eventHref(data.slug);
	$: ordersHref = eventHref(data.slug, 'ordenes');
	/** La lista de /admin/checkin, aunque haya un solo evento hoy (si no, volvería acá). */
	const listHref = `/admin/checkin?${CHECKIN_LIST_PARAM}`;

	// --- Estado ---
	let counts = data.counts;
	let online = true;
	/** @type {DoorState} */
	let door = emptyDoorState();
	/** @type {DoorScan | null} */
	let scan = form?.checkin ?? null;
	let busy = false;
	/** @type {Record<string, string>} ticketId → DNI completo ya pedido */
	let revealed = {};
	/** @type {import('$lib/admin/doorOffline.js').RecentScan[]} */
	let recent = [];
	let sound = false;
	let wakeOk = false;
	let syncing = false;
	/** Preguntando si se descarta una venta sin conexión: mientras tanto no se sincroniza. */
	let discarding = false;
	/** @type {{ holder: string, result: string, at: number | null, by: string | null }[]} */
	let conflicts = [];
	/**
	 * Ventas sin conexión que al sincronizarse pasaron un límite o quedaron registradas con otro
	 * total que el que se cobró (quedaron en «Para revisar»).
	 */
	/** @type {{ buyer: string, ref: string, review: string[] }[]} */
	let saleWarnings = [];
	/** @type {string} */
	let toast = '';
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let toastTimer;

	let codeOpen = false;
	let searchOpen = false;
	let saleOpen = false;
	let menuOpen = false;
	/** «Cómo hacer la puerta» (DoorGuide.svelte). */
	let guideOpen = false;
	let purchaseOpen = false;
	/** @type {any} */
	let purchase = null;
	let purchaseError = '';

	$: pct = counts.total ? Math.round((counts.inside / counts.total) * 100) : 0;
	$: pending = door.queue.length + door.sales.length;
	$: pendingText = pendingNote({ checkins: door.queue.length, sales: door.sales.length });
	$: connection = doorConnectionNote({
		online,
		saved: Boolean(door.savedAt),
		savedAt: door.savedAt ? hhmm(door.savedAt) : '',
		canSell: data.doorSales
	});

	/** @param {string} text */
	function say(text) {
		toast = text;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 3500);
	}

	/** @param {number | null | undefined} ms */
	function hhmm(ms) {
		return ms ? argTime(ms) : '';
	}
	/** @param {number | null | undefined} ms */
	function dateTime(ms) {
		return ms ? argDateLog(ms) : '—';
	}

	// --- Guardado local (try/catch adentro de doorOffline.js) ---
	const storage = () => {
		try {
			return window.localStorage;
		} catch {
			return null;
		}
	};
	/** La puerta con link se guarda aparte de la del panel (`kv-puerta-link:<slug>`). */
	const storageOpts = () => ({ link: Boolean(data.doorLink) });
	const recentKey = () => doorRecentKey(data.slug, storageOpts());
	function persist() {
		// Con un link que ya no anda solo quedan guardadas las ventas sin mandar (ver `endLink`).
		if (linkEnded) {
			if (door.sales.length || door.failed.length) {
				saveDoorState(
					storage(),
					data.slug,
					{ ...emptyDoorState(), sales: door.sales, failed: door.failed },
					storageOpts()
				);
			} else dropLinkDoor(storage(), data.slug);
			return;
		}
		saveDoorState(storage(), data.slug, door, storageOpts());
	}

	// --- Puerta con link: lo guardado en el celu no dura más que el link ---
	/** Por qué se cerró la puerta con link en este celu ('' mientras anda). */
	let linkEnded = '';
	/**
	 * El link venció o el servidor dice que ya no sirve (403: revocado, vencido, de otro evento):
	 * se borra la lista guardada en este celu (nombres, mails), los ingresos marcados sin conexión y
	 * los últimos escaneos (`forgetLinkDoor`). Las ventas sin mandar **quedan** (una venta que pasó
	 * no se pierde, decisión 0035): se muestran para que une admin las cargue. Un celu sin conexión
	 * no se entera de que lo revocaron: borra al vencer o la próxima vez que habla con el servidor.
	 * @param {string} message
	 */
	function endLink(message) {
		if (!linkMode || linkEnded) return;
		linkEnded = message;
		door = forgetLinkDoor(storage(), data.slug);
		recent = [];
		scan = null;
		suggestions = [];
		purchaseOpen = false;
		purchase = null;
	}
	function checkLinkExpiry() {
		if (linkMode && data.doorLink && Date.now() >= Number(data.doorLink.expiresAt)) {
			endLink('Este link de puerta venció.');
		}
	}
	/** @param {number} status */
	function linkRefused(status) {
		if (status === 403) endLink('Este link de puerta ya no sirve (venció o lo revocaron).');
	}
	function persistRecent() {
		try {
			storage()?.setItem(recentKey(), JSON.stringify(recent));
		} catch {
			// sin almacenamiento: la lista vive solo en esta pestaña
		}
	}

	// --- Acciones del servidor (fetch + deserialize: lo mismo que `use:enhance`) ---
	/**
	 * @param {string} name
	 * @param {Record<string, string> | FormData} fields
	 */
	async function postAction(name, fields) {
		const body = fields instanceof FormData ? fields : new FormData();
		if (!(fields instanceof FormData)) for (const [k, v] of Object.entries(fields)) body.set(k, v);
		const res = await fetch(`${base}?/${name}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
		// El DNI completo da 403 con un link aunque el link ande: ese no cierra la puerta.
		if (name !== 'reveal') linkRefused(res.status);
		// Resultado de una acción (success / failure / redirect / error) con datos sin tipar.
		return /** @type {any} */ (deserialize(await res.text()));
	}

	/**
	 * Puerta con link: borra la cookie del link y la lista guardada en este celu (nombres, mails;
	 * solo sin nada pendiente ni ventas sin registrar: el botón se apaga si hay) y vuelve a /puerta.
	 */
	async function leaveLink() {
		if (!canLeave) return;
		forgetLinkDoor(storage(), data.slug);
		try {
			await fetch('/puerta?/salir', {
				method: 'POST',
				body: new FormData(),
				headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
			});
		} catch {
			// sin conexión: la cookie vence sola con el link
		}
		window.location.href = '/puerta';
	}

	// --- Feedback: vibración y sonido (apagado por defecto) ---
	/** @type {AudioContext | null} */
	let audio = null;
	/** @param {'ok' | 'warn' | 'bad'} tone */
	function feedback(tone) {
		try {
			navigator.vibrate?.(tone === 'ok' ? 90 : tone === 'warn' ? [90, 70, 90] : [300]);
		} catch {
			// sin vibración
		}
		if (!sound) return;
		try {
			audio ??= new AudioContext();
			const notes = tone === 'ok' ? [880] : tone === 'warn' ? [660, 660] : [220];
			notes.forEach((f, i) => {
				const o = /** @type {AudioContext} */ (audio).createOscillator();
				const g = /** @type {AudioContext} */ (audio).createGain();
				o.frequency.value = f;
				o.type = tone === 'bad' ? 'square' : 'sine';
				g.gain.value = 0.15;
				o.connect(g).connect(/** @type {AudioContext} */ (audio).destination);
				const t0 = /** @type {AudioContext} */ (audio).currentTime + i * 0.18;
				o.start(t0);
				o.stop(t0 + (tone === 'bad' ? 0.35 : 0.12));
			});
		} catch {
			// sin audio
		}
	}

	/** @param {DoorScan} s */
	function show(s) {
		scan = s;
		const tone =
			s.result === 'ok' || s.result === 'sold' ? 'ok' : s.result === 'already' ? 'warn' : 'bad';
		feedback(tone);
		const c = s.card;
		const titles = /** @type {Record<string, string>} */ ({
			ok: c ? `${c.holder}${c.pronouns ? ` (${c.pronouns})` : ''} · ${c.type}` : 'Adelante',
			sold: c ? `${c.holder} · vendida en puerta` : 'Vendida',
			already: c ? `${c.holder} · ya ingresó` : 'Ya ingresó',
			void: c ? `${c.holder} · anulada` : 'Entrada anulada',
			'wrong-event': 'Entrada de otro evento',
			invalid: invalidTitle('invalid', s.typed),
			error: 'No se pudo validar'
		});
		const sub =
			s.result === 'already' && c
				? `a las ${hhmm(c.at)}${c.by ? `, marcó ${c.by}` : ''}`
				: s.result === 'wrong-event'
					? (s.otherEvent ?? '')
					: s.offline
						? s.result === 'sold'
							? 'pendiente de sincronizar'
							: 'sin conexión'
						: '';
		recent = [
			{ result: s.result, title: titles[s.result], sub, at: Date.now(), ticketId: c?.ticketId },
			...recent
		].slice(0, 5);
		persistRecent();
	}

	/** @param {any} c */
	function setCounts(c) {
		if (c && typeof c.total === 'number') counts = c;
	}

	/** Marca el ingreso también en la lista local (para que sin conexión diga "Ya ingresó"). */
	/** @param {Card | null} card */
	function markLocal(card) {
		if (!card) return;
		door = {
			...door,
			list: door.list.map((t) =>
				t.ticketId === card.ticketId ? { ...t, at: card.at, by: card.by } : t
			)
		};
		persist();
	}

	// --- Escanear / validar ---
	/**
	 * @param {string} raw
	 * @param {{ typed?: boolean }} [o] `typed`: escrito a mano («Escribir código»)
	 */
	async function submitScan(raw, { typed = false } = {}) {
		const value = String(raw ?? '').trim();
		if (!value || busy) return;
		busy = true;
		try {
			if (!online) {
				await offlineScan(value, typed);
				return;
			}
			let r;
			try {
				r = await postAction('checkin', { token: value });
			} catch {
				// Sin red (aunque el navegador crea que hay): seguimos con la lista guardada.
				online = false;
				await offlineScan(value, typed);
				return;
			}
			if (r.type === 'success' && r.data?.checkin) {
				const s = /** @type {DoorScan} */ ({ ...r.data.checkin, typed });
				show(s);
				setCounts(r.data.counts);
				if (s.result === 'ok') markLocal(s.card);
			} else if (r.type === 'redirect') {
				show({
					result: 'error',
					card: null,
					message: 'Se cerró la sesión: volvé a entrar.',
					stamp: Date.now()
				});
			} else {
				show({ result: 'error', card: null, message: 'Probá de nuevo.', stamp: Date.now() });
			}
		} finally {
			busy = false;
		}
	}

	/**
	 * @param {string} value
	 * @param {boolean} [typed]
	 */
	async function offlineScan(value, typed = false) {
		const parsed = parseScan(value);
		const ticket = await findTicket(door.list, parsed);
		const r = localCheckIn(door, parsed, ticket, {
			now: Date.now(),
			by: data.login,
			id: crypto.randomUUID()
		});
		door = r.state;
		persist();
		counts = localCounts(door.list);
		show({ result: r.result, card: r.ticket, offline: true, stamp: Date.now(), typed });
	}

	/** @param {CustomEvent<Card>} e */
	async function undo(e) {
		const card = e.detail;
		if (scan?.offline) {
			const next = undoLocal(door, card.ticketId);
			if (next) {
				door = next;
				persist();
				counts = localCounts(door.list);
				scan = null;
				recent = markRecentUndone(recent, card.ticketId, card.holder);
				persistRecent();
				say(`Se deshizo el ingreso de ${card.holder}.`);
				return;
			}
		}
		try {
			const r = await postAction('undo', { ticket: card.ticketId });
			if (r.type === 'success' && r.data?.undo?.ok) {
				setCounts(r.data.counts);
				markLocal({ ...card, at: null, by: null });
				scan = null;
				recent = markRecentUndone(recent, card.ticketId, card.holder);
				persistRecent();
				say(`Se deshizo el ingreso de ${card.holder}.`);
			} else say('No se pudo deshacer.');
		} catch {
			say('Sin conexión: no se puede deshacer un ingreso que ya está en el servidor.');
		}
	}

	/** @param {CustomEvent<Card>} e */
	async function reveal(e) {
		const card = e.detail;
		if (!online) return say('Sin conexión: el DNI completo solo se ve con conexión.');
		try {
			const r = await postAction('reveal', { ticket: card.ticketId });
			if (r.type === 'success' && r.data?.reveal?.dni) {
				revealed = { ...revealed, [card.ticketId]: r.data.reveal.dni };
			} else say('No se pudo ver el DNI.');
		} catch {
			say('Sin conexión: el DNI completo solo se ve con conexión.');
		}
	}

	// --- Compra completa ---
	/** @param {CustomEvent<Card>} e */
	async function openDetails(e) {
		const card = e.detail;
		purchase = null;
		purchaseError = '';
		purchaseOpen = true;
		const local = () => ({
			offline: true,
			ref: card.orderRef,
			buyer: card.buyer,
			email: card.email,
			dniTail: card.dniTail,
			type: card.type,
			ticketId: card.ticketId,
			tickets: door.list
				.filter((t) => t.orderId === card.orderId)
				.map((t) => ({
					id: t.ticketId,
					holder: t.holder,
					pronouns: t.pronouns,
					code: t.code,
					at: t.at,
					by: t.by
				}))
		});
		// Una venta sin conexión que todavía no se sincronizó solo está en este celu.
		if (!online || isPendingSaleTicket(card.ticketId)) {
			purchase = local();
			return;
		}
		try {
			const res = await fetch(`${base}/compra?ticket=${encodeURIComponent(card.ticketId)}`, {
				headers: { accept: 'application/json' }
			});
			linkRefused(res.status);
			if (linkEnded) return;
			if (!res.ok) throw new Error(String(res.status));
			purchase = { ...(await res.json()), ticketId: card.ticketId };
		} catch {
			purchase = local();
			purchaseError = 'No se pudo traer la compra del servidor: estos son los datos guardados.';
		}
	}

	// --- Descartar una venta sin conexión que todavía no se mandó (UX V12) ---
	/**
	 * Solo saca la venta de la cola de este celu: no toca el servidor ni la plata. Pregunta antes en
	 * la página (`askConfirm`, nunca `window.confirm`). Una venta que ya se sincronizó es una orden:
	 * se revisa (y si hace falta se reembolsa) desde el panel. Con un link de puerta no se descarta:
	 * las ventas sin mandar nunca se borran del celu (decisión 0035), las carga o las descarta une admin.
	 * @param {string} saleId
	 */
	async function discardSale(saleId) {
		if (linkMode) return;
		const sale = door.sales.find((s) => s.id === saleId);
		if (!sale)
			return say('Esa venta ya se mandó al servidor: si te equivocaste, buscala en Órdenes.');
		if (syncing) return say('Se está sincronizando: esperá un momento y probá de nuevo.');
		discarding = true;
		let ok = false;
		try {
			ok = await askConfirm({
				title: `¿Descartar la venta de ${sale.buyer}?`,
				text: `${sale.quantity} × ${sale.type}${sale.total === null ? '' : `, ${formatARS(sale.total)}`} (${METHOD_TEXT[sale.method] ?? sale.method}, a las ${hhmm(sale.at)}). Todavía no se mandó al servidor: se borra solo de este celu y sus entradas dejan de contar como adentro. Si cobraste, devolvé la plata a mano.`,
				confirmLabel: 'Descartar la venta',
				cancelLabel: 'No, dejarla',
				tone: 'permanent'
			});
		} finally {
			discarding = false;
		}
		if (!ok) return;
		const r = discardQueuedSale(door, saleId, { confirmed: true });
		if (!r.ok) {
			say('Esa venta ya se mandó al servidor: si te equivocaste, buscala en Órdenes.');
			return;
		}
		door = r.state;
		persist();
		if (!online) counts = localCounts(door.list);
		recent = markRecentDiscarded(recent, saleId, r.sale.buyer);
		persistRecent();
		if (scan?.card && pendingSaleId(scan.card.ticketId) === saleId) scan = null;
		if (purchase?.ticketId && pendingSaleId(purchase.ticketId) === saleId) purchaseOpen = false;
		say(`Se descartó la venta de ${r.sale.buyer}: no se va a mandar.`);
	}

	/** «←» sin conexión: salir de la Puerta deja de poder volver a abrirla hasta que haya señal. */
	/** @param {MouseEvent} e */
	async function leave(e) {
		if (online) return;
		e.preventDefault();
		const ok = await askConfirm({
			title: 'Estás sin conexión',
			text: 'Si salís, la Puerta no vuelve a cargar hasta que haya conexión. Lo que marcaste y vendiste queda guardado en este celu.',
			confirmLabel: 'Salir igual',
			cancelLabel: 'Quedarme'
		});
		if (ok) goto(backHref);
	}

	// --- Sin conexión: lista y sincronización ---
	async function refreshList() {
		if (!online || linkEnded) return;
		try {
			const res = await fetch(`${base}/lista`, { headers: { accept: 'application/json' } });
			linkRefused(res.status);
			if (!res.ok) return;
			const body = await res.json();
			door = {
				...door,
				list: mergeServerList(body.tickets, door.queue, door.sales),
				savedAt: body.at,
				// Hasta cuándo puede quedar la marca de los avisos de puerta en este celu (decisión
				// 0053; con un link el servidor no manda ni la marca ni esto).
				noticeUntil: Number(body.noticeUntil) || null
			};
			persist();
			if (!door.queue.length && !door.sales.length) setCounts(body.counts);
		} catch {
			// sin red: queda la lista que había
		}
	}

	/**
	 * Ventas hechas sin conexión: se mandan todas juntas, en el orden en que se vendieron; el
	 * servidor las registra una por una (idempotente: un reintento no duplica).
	 */
	async function syncSales() {
		const r = await postAction('syncSales', { sales: JSON.stringify(salesPayload(door.sales)) });
		if (r.type !== 'success' || !r.data?.syncSales?.ok) return;
		const applied = applySaleSyncResults(door, r.data.syncSales.results);
		door = applied.state;
		persist();
		const synced = /** @type {{ id: string, result: string }[]} */ (r.data.syncSales.results)
			.filter((x) => x.result !== 'rejected')
			.map((x) => x.id);
		recent = markRecentSynced(recent, synced);
		persistRecent();
		// El resultado grande de una venta que ya se registró deja de decir «pendiente» y pasa a
		// tener la orden del servidor (para «¿Te equivocaste? Ver la orden»).
		if (scan?.offline && scan.result === 'sold' && scan.card) {
			const id = pendingSaleId(scan.card.ticketId);
			const done = /** @type {{ id: string, result: string, orderId?: string, ref?: string }[]} */ (
				r.data.syncSales.results
			).find((x) => x.id === id && x.result !== 'rejected' && x.orderId);
			if (done)
				scan = {
					...scan,
					offline: false,
					card: {
						...scan.card,
						orderId: /** @type {string} */ (done.orderId),
						orderRef: done.ref || scan.card.orderRef
					}
				};
			else if (synced.includes(id)) scan = { ...scan, offline: false };
		}
		saleWarnings = [...applied.warnings, ...saleWarnings].slice(0, 20);
		setCounts(r.data.counts);
		if (applied.rejected.length) {
			const n = applied.rejected.length;
			say(
				`${n === 1 ? '1 venta hecha sin conexión no se pudo registrar' : `${n} ventas hechas sin conexión no se pudieron registrar`}: mirá el aviso.`
			);
		}
		if (applied.done) {
			const n = applied.done;
			say(
				`${n === 1 ? 'Se sincronizó 1 venta hecha' : `Se sincronizaron ${n} ventas hechas`} sin conexión${applied.warnings.length ? ` (${applied.warnings.length} para revisar)` : ''}.`
			);
		}
	}

	async function sync() {
		if (syncing || discarding || !online || linkEnded || (!door.queue.length && !door.sales.length))
			return;
		syncing = true;
		try {
			if (door.sales.length) await syncSales();
			if (!door.queue.length) {
				await refreshList();
				return;
			}
			const queue = door.queue.map(({ id, token, code, at }) => ({ id, token, code, at }));
			const r = await postAction('sync', { queue: JSON.stringify(queue) });
			if (r.type === 'success' && r.data?.sync?.ok) {
				const applied = applySyncResults(door, r.data.sync.results);
				door = applied.state;
				persist();
				conflicts = [...applied.conflicts, ...conflicts].slice(0, 20);
				setCounts(r.data.counts);
				if (applied.done) {
					const n = applied.done;
					const problems = applied.conflicts.length;
					say(
						`${n === 1 ? 'Se sincronizó 1 ingreso' : `Se sincronizaron ${n} ingresos`} marcado${n === 1 ? '' : 's'} sin conexión${problems ? ` (${problems} con problemas)` : ''}.`
					);
				}
				await refreshList();
			}
		} catch {
			online = false;
		} finally {
			syncing = false;
		}
	}

	// --- Pantalla siempre prendida ---
	/** @type {any} */
	let wakeLock = null;
	async function lockScreen() {
		try {
			// @ts-ignore Wake Lock todavía no está en todos los tipos.
			wakeLock = await navigator.wakeLock?.request('screen');
			wakeOk = Boolean(wakeLock);
			wakeLock?.addEventListener?.('release', () => (wakeOk = false));
		} catch {
			wakeOk = false;
		}
	}
	function onVisibility() {
		if (document.visibilityState === 'visible') {
			lockScreen();
			if (online) sync();
		}
	}
	function goOnline() {
		online = true;
		sync().then(refreshList);
	}
	function goOffline() {
		online = false;
	}

	/** @type {ReturnType<typeof setInterval> | undefined} */
	let timer;
	/** @type {ReturnType<typeof setInterval> | undefined} */
	let linkTimer;
	onMount(() => {
		online = navigator.onLine;
		door = loadDoorState(storage(), data.slug, storageOpts());
		// Puerta con link: si ya venció (el celu estuvo cerrado), se borra lo guardado al abrir.
		checkLinkExpiry();
		if (linkMode) linkTimer = setInterval(checkLinkExpiry, 30_000);
		try {
			recent = JSON.parse(storage()?.getItem(recentKey()) ?? '[]');
			sound = storage()?.getItem('kv-door-sound') === '1';
		} catch {
			recent = [];
		}
		if (!online && door.list.length) counts = localCounts(door.list);
		lockScreen();
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		sync().then(refreshList);
		// Cada 2 minutos: sincronizar lo pendiente y actualizar la lista (otros celus marcan también).
		timer = setInterval(() => {
			if (online) sync().then(refreshList);
		}, 120_000);
	});
	onDestroy(() => {
		if (typeof document === 'undefined') return;
		clearInterval(timer);
		clearInterval(linkTimer);
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('online', goOnline);
		window.removeEventListener('offline', goOffline);
		wakeLock?.release?.().catch(() => {});
	});

	function toggleSound() {
		sound = !sound;
		try {
			storage()?.setItem('kv-door-sound', sound ? '1' : '0');
		} catch {
			// sin almacenamiento
		}
		if (sound) feedback('ok');
	}

	// --- Escribir código ---
	let code = '';
	/** @type {HTMLInputElement | undefined} */
	let codeInput;
	async function openCode() {
		codeOpen = true;
		await tick();
		codeInput?.focus();
	}
	async function submitCode() {
		const value = code;
		codeOpen = false;
		code = '';
		await submitScan(value, { typed: true });
	}

	// --- Buscar persona (combobox con sugerencias; sin conexión, en la lista guardada) ---
	/**
	 * @typedef {{ id: string, token?: string, code: string, holder: string, pronouns: string,
	 *   buyer: string, email: string, type: string, checkedInAt: number | null, notice?: boolean,
	 *   match: { label: string, value: string, field: string } | null }} Suggestion
	 */
	let query = '';
	/** @type {Suggestion[]} */
	let suggestions = [];
	let active = -1;
	let searched = '';
	/** @type {AbortController | null} */
	let inflight = null;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let debounce;
	/** @type {HTMLInputElement | undefined} */
	let searchInput;

	async function openSearch() {
		searchOpen = true;
		await tick();
		searchInput?.focus();
	}

	function suggest() {
		clearTimeout(debounce);
		const q = query.trim();
		if (q.length < 2) {
			inflight?.abort();
			suggestions = [];
			active = -1;
			searched = '';
			return;
		}
		debounce = setTimeout(async () => {
			if (!online) {
				suggestions = localSearch(door.list, q).map((t) => ({
					id: t.ticketId,
					code: t.code,
					holder: t.holder,
					pronouns: t.pronouns,
					buyer: t.buyer,
					email: t.email,
					type: t.type,
					checkedInAt: t.at,
					notice: t.notice === true,
					match: null
				}));
				searched = q;
				active = -1;
				return;
			}
			inflight?.abort();
			const controller = new AbortController();
			inflight = controller;
			try {
				const res = await fetch(`${base}/buscar?q=${encodeURIComponent(q)}`, {
					signal: controller.signal,
					headers: { accept: 'application/json' }
				});
				linkRefused(res.status);
				if (!res.ok) return;
				const body = await res.json();
				if (controller.signal.aborted) return;
				suggestions = body.results;
				searched = q;
				active = -1;
			} catch {
				// abortada o sin conexión
			}
		}, 150);
	}

	/** @param {Suggestion} s */
	async function choose(s) {
		searchOpen = false;
		query = '';
		suggestions = [];
		searched = '';
		// Con un link, el buscador no trae el token: el código o, si no tiene, la entrada por su id.
		await submitScan(s.token || s.code || `ticket:${s.id}`);
	}

	/** @param {KeyboardEvent} e */
	function onSearchKey(e) {
		if (e.key === 'ArrowDown' && suggestions.length) {
			e.preventDefault();
			active = (active + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp' && suggestions.length) {
			e.preventDefault();
			active = active <= 0 ? suggestions.length - 1 : active - 1;
		} else if (e.key === 'Enter' && active >= 0) {
			e.preventDefault();
			choose(suggestions[active]);
		}
	}

	// --- Vender en puerta ---
	// `available` null: tipo sin cupo (sin límite). Un tipo agotado se puede elegir igual: une
	// admin puede pasar el cupo (el servidor pide confirmar con un diálogo).
	/** @type {OverrideDialog} */
	let overrideDialog;
	let saleType =
		data.types.find((t) => t.available === null || t.available > 0)?.id ?? data.types[0]?.id ?? '';
	let saleQty = 1;
	let saleMethod = DOOR_SALE_DEFAULT_METHOD;
	let saleOption = '';
	/** Monto a la gorra o, en un tipo con precio, el precio por entrada (arranca con el de la puerta). */
	let saleAmount = '';
	let saleBusy = false;
	let saleError = '';
	let saleEmail = '';
	let noteOpen = false;
	$: sType = data.types.find((t) => t.id === saleType);
	// Al cambiar de tipo, el precio por entrada vuelve al de la puerta (en la gorra, vacío). Un
	// precio en puerta de $ 0 (configuración vieja: el editor ya no lo deja guardar, #374) no se
	// prellena: una venta sin cargo la decide quien vende, escribiendo 0.
	let amountFor = '';
	$: if (sType && amountFor !== sType.id) {
		amountFor = sType.id;
		saleAmount = sType.gorra || sType.price === 0 ? '' : String(sType.price);
	}
	$: if (sType && !sType.gorra && !sType.options.some((o) => o.id === saleOption)) {
		saleOption = sType.fondo > 0 ? 'fondo' : 'completo';
	}
	// Lo que se cobra por entrada en un tipo con precio: el de la puerta o el que se escribió.
	$: charged =
		sType && !sType.gorra ? doorChargedPrice(sType, saleAmount, data.fondoPercent) : null;
	$: priceChange =
		sType && !sType.gorra && charged
			? doorPriceChangeText({ charged: charged.price, list: sType.price })
			: '';
	$: salePrice = saleCalc?.total ?? null;
	$: saleBreakdown = saleCalc ? doorSaleBreakdown(saleCalc, saleQty) : '';
	$: saleCalc = (() => {
		if (!sType) return null;
		try {
			const price = sType.gorra ? (parseAmount(saleAmount) ?? NaN) : (charged?.price ?? NaN);
			if (!Number.isFinite(price) || price < 0) return null;
			return computePrice({
				price,
				fondo: sType.gorra ? 0 : (charged?.fondo ?? 0),
				option: sType.gorra ? 'gorra' : /** @type {any} */ (saleOption),
				quantity: saleQty,
				discount: null,
				method: /** @type {any} */ (saleMethod)
			});
		} catch {
			return null;
		}
	})();

	/**
	 * Venta sin conexión (decisión 0035): queda en este celu con un id propio, sus entradas cuentan
	 * como adentro acá y se manda sola cuando vuelve la conexión. Si con lo que se sabe en el celu
	 * pasaría un límite, se avisa antes (como con conexión), pero se puede guardar igual.
	 * @param {HTMLFormElement} formEl
	 */
	async function queueSale(formEl) {
		const fd = new FormData(formEl);
		/** @type {Record<string, string>} */
		const fields = {};
		for (const [k, v] of fd.entries()) if (typeof v === 'string') fields[k] = v;
		delete fields.dni;
		delete fields.override;
		if (!sType) {
			saleError = 'Elegí un tipo de entrada.';
			return;
		}
		// Precio 0 en la puerta sin escribir un precio: el servidor no la registraría al sincronizar
		// (si quien vende escribe $ 0, es sin cargo a propósito y sí se registra).
		if (!sType.gorra && sType.price === 0 && String(saleAmount ?? '').trim() === '') {
			saleError = FREE_DOOR_MESSAGE;
			return;
		}
		const quantity = Number(fields.quantity);
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > data.maxOrder) {
			saleError = `La cantidad tiene que ser de 1 a ${data.maxOrder}.`;
			return;
		}
		if (fields.method !== 'efectivo' && fields.method !== 'transferencia') {
			saleError = 'Elegí cómo pagó: efectivo o transferencia.';
			return;
		}
		if (!sType.gorra && parseDoorAmount(fields.amount) === null) {
			saleError = 'El precio por entrada tiene que ser un número entero de pesos (0 = sin cargo).';
			return;
		}
		if (!sType.gorra && exceedsOrderMax(parseDoorAmount(fields.amount) ?? 0, quantity)) {
			saleError = ORDER_MAX_MESSAGE;
			return;
		}
		if (!String(fields.name ?? '').trim()) {
			saleError = 'Falta el nombre de quien compra.';
			return;
		}
		if (fields.method === 'transferencia' && fields.transfer_seen !== 'on') {
			saleError = 'Sin conexión: confirmá que viste llegar la transferencia.';
			return;
		}
		const limits = offlineSaleLimits({
			type: sType,
			quantity,
			doorSales: data.doorSales,
			maxPerSale: data.maxPerSale,
			sales: door.sales
		});
		if (limits.length) {
			const ok = await overrideDialog.ask(
				{ limits, key: 'sin-conexion' },
				{ title: 'Sin conexión: esto pasaría un límite de venta' }
			);
			if (!ok) {
				saleError = 'No se vendió.';
				return;
			}
		}
		const name = String(fields.name).trim();
		const holders = Array.from({ length: quantity }, (_, i) => ({
			name: String(fields[`holder_${i}`] ?? '').trim() || name,
			pronouns: i === 0 ? String(fields.pronouns ?? '').trim() : ''
		}));
		const queued = queueOfflineSale(door, {
			id: crypto.randomUUID(),
			now: Date.now(),
			by: data.login,
			fields,
			type: sType,
			quantity,
			total: salePrice,
			holders
		});
		door = queued.state;
		persist();
		counts = localCounts(door.list);
		saleOpen = false;
		const notes = saleNotes({
			note: fields.note,
			priceChange: sType.gorra
				? ''
				: doorPriceChangeText({
						charged: parseDoorAmount(fields.amount) ?? sType.price,
						list: sType.price
					})
		});
		// Igual que la venta con conexión: vacía el formulario y deja tildado efectivo.
		afterSale(formEl);
		const cards = queued.sale.tickets;
		show({
			result: 'sold',
			card: cards[0] ?? null,
			cards,
			offline: true,
			notes,
			stamp: Date.now()
		});
		say('Venta guardada en este celu: se manda sola cuando vuelva la conexión.');
	}

	/**
	 * Lo que el resultado de la venta muestra además de las entradas: el precio cambiado y la nota.
	 * @param {{ note?: string, priceChange?: string }} sale
	 */
	function saleNotes({ note, priceChange }) {
		const out = [];
		if (priceChange) out.push(priceChange);
		const text = String(note ?? '').trim();
		if (text) out.push(`Nota: ${text}`);
		return out;
	}

	/**
	 * Después de vender: vacía el formulario, deja tildado efectivo, cierra la nota y vuelve al
	 * precio de la puerta. Svelte vuelve los campos ligados (`bind:`) a su valor inicial un
	 * microtask después de `form.reset()` (los radios a ninguno, la cantidad a vacío), así que los
	 * valores de la venta siguiente se ponen después de eso.
	 * @param {HTMLFormElement} formEl
	 */
	async function afterSale(formEl) {
		resetDoorSaleForm(formEl);
		noteOpen = false;
		await new Promise((resolve) => setTimeout(resolve, 0));
		saleMethod = DOOR_SALE_DEFAULT_METHOD;
		saleQty = 1;
		saleEmail = '';
		amountFor = '';
	}

	/** @param {SubmitEvent} e */
	async function submitSale(e) {
		const formEl = /** @type {HTMLFormElement} */ (e.currentTarget);
		saleError = '';
		if (!online) {
			await queueSale(formEl);
			return;
		}
		saleBusy = true;
		saleError = '';
		try {
			const fd = new FormData(formEl);
			let r = await postAction('sell', fd);
			// Se pasa algún límite: se pregunta en la página y, si confirma, se reenvía con la clave.
			while (r.type === 'failure' && r.data?.sale?.needsConfirmation) {
				const key = await overrideDialog.ask(r.data.sale.needsConfirmation);
				if (!key) {
					saleError = 'No se vendió.';
					return;
				}
				fd.set('override', key);
				r = await postAction('sell', fd);
			}
			if (r.type === 'success' && r.data?.sale?.ok) {
				const sale = r.data.sale;
				saleOpen = false;
				afterSale(formEl);
				show({
					result: 'sold',
					card: sale.tickets[0] ?? null,
					cards: sale.tickets,
					notes: saleNotes(sale),
					stamp: Date.now()
				});
				setCounts(r.data.counts);
				say(sale.message);
				await invalidateAll();
				refreshList();
			} else if (r.type === 'failure') {
				saleError = r.data?.sale?.message ?? 'No se pudo vender.';
			} else saleError = 'No se pudo vender. Probá de nuevo.';
		} catch {
			saleError = 'Sin conexión: no se pudo vender.';
		} finally {
			saleBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Puerta · {data.title}{linkMode ? '' : ' · Panel'}</title>
	<meta name="theme-color" content="#16121a" />
</svelte:head>

<div class="door-root">
	<div class="door">
		<header class="bar">
			{#if !linkMode}
				<a class="round" href={backHref} aria-label="Salir de Puerta" on:click={leave}
					><ArrowLeft size={24} /></a
				>
			{/if}
			<div class="heading">
				<h1>{data.title}</h1>
				{#if data.part}
					<!-- Parte de un taller (docs/talleres-partes.md): entradas del taller, ingreso de esta parte. -->
					<p class="part-of"><strong>{data.part.label}</strong> · ingreso de esta parte</p>
				{/if}
				<p>Puerta · {wakeOk ? 'la pantalla no se apaga' : 'la pantalla puede apagarse'}</p>
				{#if data.doorLink}
					<!-- Puerta con link: de quién es y hasta cuándo anda. -->
					<p class="link-note">
						Link de puerta{data.doorLink.label ? ` «${data.doorLink.label}»` : ''} · anda hasta el
						{dateTime(data.doorLink.expiresAt)}
					</p>
				{/if}
				{#if data.autoOpened}
					<!-- Se abrió sola: era el único evento de hoy. -->
					<p class="auto">Es el único evento de hoy · <a href={listHref}>Otro evento</a></p>
				{/if}
			</div>
			<button
				type="button"
				class="round"
				on:click={() => (guideOpen = true)}
				aria-label="Cómo hacer la puerta"
			>
				<CircleHelp size={24} />
			</button>
			<button type="button" class="round" on:click={() => (menuOpen = true)} aria-label="Opciones">
				<Ellipsis size={24} />
			</button>
		</header>

		{#if !online && connection}
			<div class="banner offline" role="status">
				<WifiOff size={20} />
				<span>
					<strong>{connection.title}</strong>
					{#if connection.keep}<strong class="keep">{connection.keep}</strong>{/if}
					{connection.detail}
					{#if pendingText}<strong class="pending">{pendingText}</strong>{/if}
				</span>
			</div>
		{:else if pending && !linkEnded}
			<div class="banner" role="status">
				<CloudUpload size={20} />
				<span>{pendingText}</span>
				<button type="button" class="link" on:click={sync} disabled={syncing}>
					{syncing ? 'Sincronizando…' : 'Sincronizar'}
				</button>
			</div>
		{:else if connection}
			<div class="banner ready" role="status">
				<CloudCheck size={20} />
				<span><strong>{connection.title}</strong> {connection.detail}</span>
			</div>
		{/if}
		{#if linkEnded}
			<!-- Puerta con link que ya no anda: se borró lo guardado en este celu. -->
			<div class="banner warn" role="alert">
				<TriangleAlert size={20} />
				<span>
					<strong>{linkEnded}</strong> Se borró la lista guardada en este celu. Pedile un link nuevo
					a une organizadore. <a href="/puerta">Ir al inicio de la puerta</a>
				</span>
			</div>
			{#if door.sales.length}
				<!-- Las ventas sin mandar no se borran (decisión 0035): las carga une admin. -->
				<div class="banner warn" role="alert">
					<TriangleAlert size={20} />
					<span>
						<strong
							>{door.sales.length === 1
								? 'Quedó 1 venta sin mandar'
								: `Quedaron ${door.sales.length} ventas sin mandar`}:</strong
						>
						mostráselas a une admin para cargarlas.
						<details class="left-sales">
							<summary>Ver las ventas</summary>
							<ul>
								{#each door.sales as sale (sale.id)}
									<li>
										{hhmm(sale.at)} · <strong>{sale.buyer}</strong> · {sale.quantity} × {sale.type} ·
										{METHOD_TEXT[sale.method] ?? sale.method}{sale.total === null
											? ''
											: ` · ${formatARS(sale.total)}`}{sale.fields?.email
											? ` · ${sale.fields.email}`
											: ''}
									</li>
								{/each}
							</ul>
						</details>
					</span>
				</div>
			{/if}
		{/if}
		{#each door.failed as f (f.id)}
			<!-- Una venta sin conexión que el servidor no pudo registrar: queda a la vista hasta que
			     alguien la descarta (nunca se borra sola). -->
			<div class="banner warn" role="alert">
				<TriangleAlert size={20} />
				<span>
					No se pudo registrar la venta sin conexión de <strong>{f.buyer}</strong> ({f.quantity} × {f.type},
					{METHOD_TEXT[f.method] ?? f.method}{f.total === null ? '' : `, ${formatARS(f.total)}`}, a
					las {hhmm(f.at)}): {f.message} Cargala a mano.
				</span>
				<button
					type="button"
					class="x"
					aria-label="Descartar aviso"
					on:click={() => {
						door = { ...door, failed: door.failed.filter((x) => x.id !== f.id) };
						persist();
					}}><X size={18} /></button
				>
			</div>
		{/each}
		{#each saleWarnings as w, i (i)}
			<div class="banner warn" role="alert">
				<TriangleAlert size={20} />
				<span>
					Se registró la venta sin conexión de <strong>{w.buyer}</strong>{w.ref
						? ` (${w.ref})`
						: ''}, pero hay algo para revisar: {w.review.join(' ')} Quedó en «Para revisar».
				</span>
				<button
					type="button"
					class="x"
					aria-label="Descartar aviso"
					on:click={() => (saleWarnings = saleWarnings.filter((_, j) => j !== i))}
					><X size={18} /></button
				>
			</div>
		{/each}
		{#each conflicts as c, i (i)}
			<div class="banner warn" role="alert">
				<TriangleAlert size={20} />
				<span>
					{#if c.result === 'conflict'}
						<strong>{c.holder}</strong> ya había ingresado{c.at ? ` a las ${hhmm(c.at)}` : ''}{c.by
							? ` (marcó ${c.by})`
							: ''}: tu ingreso sin conexión no se contó.
					{:else if c.result === 'void'}
						<strong>{c.holder}</strong>: la entrada estaba anulada.
					{:else}
						Un ingreso sin conexión no era válido ({c.result === 'wrong-event'
							? 'de otro evento'
							: 'QR inválido'}).
					{/if}
				</span>
				<button
					type="button"
					class="x"
					aria-label="Descartar aviso"
					on:click={() => (conflicts = conflicts.filter((_, j) => j !== i))}><X size={18} /></button
				>
			</div>
		{/each}

		<section class="counter" aria-live="polite" aria-label="Adentro">
			<div class="big">
				<span class="num">{counts.inside}</span>
				<span class="of">de {counts.total} adentro</span>
			</div>
			<ul class="types">
				{#each data.types as t (t.id)}
					{@const c = counts.byType[t.id]}
					{#if c}<li>{t.name} <span class="num">{c.inside} / {c.total}</span></li>{/if}
				{/each}
			</ul>
			<div class="track" aria-hidden="true"><span style="width: {pct}%"></span></div>
		</section>

		<DoorScanner onscan={submitScan} cameraApp={!linkMode}>
			{#if scan}
				{#key scan.stamp}
					<DoorResult
						{scan}
						series={data.series}
						dni={scan.card ? (revealed[scan.card.ticketId] ?? null) : null}
						canUndo={scan.result === 'ok'}
						orderHref={!linkMode && scan.result === 'sold' && scan.card
							? orderHref(ordersHref, scan.card.orderId)
							: null}
						canDiscard={Boolean(
							!linkMode &&
							scan.card &&
							door.sales.some((x) => x.id === pendingSaleId(scan?.card?.ticketId ?? ''))
						)}
						on:undo={undo}
						on:discard={(e) => discardSale(pendingSaleId(e.detail.ticketId))}
						canReveal={!linkMode}
						on:reveal={reveal}
						on:details={openDetails}
					/>
				{/key}
			{/if}
		</DoorScanner>

		<div class="actions">
			<button type="button" class="tile" on:click={openCode}>
				<Keyboard size={30} /> Escribir código
			</button>
			<button type="button" class="tile" on:click={openSearch}>
				<Search size={30} /> Buscar persona
			</button>
			{#if data.doorSales}
				<button type="button" class="tile wide" on:click={() => (saleOpen = true)}>
					<Store size={26} /> Vender en puerta
				</button>
			{:else}
				<!-- Solo anticipadas: no se ofrece vender. Une admin puede pasar ese límite en un paso
				     aparte (y el servidor vuelve a pedir que lo confirme). -->
				<div class="no-door wide" role="note">
					<p>
						<strong>Solo anticipadas:</strong> este evento no tiene entradas en la puerta (se cambia en
						el editor del evento, en Entradas).
					</p>
					{#if linkMode}
						<p class="muted small">Si hace falta vender igual, que lo haga une admin.</p>
					{:else}
						<button type="button" class="link-btn" on:click={() => (saleOpen = true)}>
							Vender igual (pasa un límite)
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<section class="recent" aria-labelledby="recent-title">
			<h2 id="recent-title">Últimos escaneos</h2>
			{#if recent.length}
				<ul>
					{#each recent as r (r.at)}
						{@const tone =
							r.result === 'ok' || r.result === 'sold'
								? 'ok'
								: r.result === 'undone'
									? 'undone'
									: r.result === 'already'
										? 'warn'
										: 'bad'}
						<li>
							<span class="dot {tone}" aria-hidden="true">
								{#if tone === 'ok'}<CircleCheck size={20} />{:else if tone === 'undone'}<Undo2
										size={20}
									/>{:else if tone === 'warn'}<TriangleAlert size={20} />{:else}<CircleX
										size={20}
									/>{/if}
							</span>
							<span class="txt">
								<strong>{r.title}</strong>
								{#if r.sub}<small>{r.sub}</small>{/if}
							</span>
							<time class="num">{hhmm(r.at)}</time>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">Todavía no escaneaste nada en este celu.</p>
			{/if}
		</section>

		{#if toast}<p class="toast" role="status">{toast}</p>{/if}
	</div>

	<!-- Escribir código -->
	<Sheet bind:open={codeOpen} title="Escribir código">
		<form method="POST" action="?/checkin" class="stack" on:submit|preventDefault={submitCode}>
			<label class="field">
				<span>Código de la entrada (el de al lado del QR) o link del QR</span>
				<input
					bind:this={codeInput}
					bind:value={code}
					name="token"
					class="code-input"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					placeholder="Ej.: 7HQ 4XM"
					required
				/>
			</label>
			<button type="submit" class="primary" disabled={busy}>Validar</button>
		</form>
	</Sheet>

	<!-- Buscar persona -->
	<Sheet bind:open={searchOpen} title="Buscar persona">
		<div class="stack">
			<input
				bind:this={searchInput}
				type="search"
				bind:value={query}
				on:input={suggest}
				on:keydown={onSearchKey}
				placeholder="Nombre, pronombres, email, DNI o código"
				aria-label="Buscar entrada"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={searched !== ''}
				aria-controls="sugerencias"
				aria-activedescendant={active >= 0 ? `sugerencia-${active}` : undefined}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
			/>
			{#if !online}<p class="muted">Sin conexión: se busca en la lista guardada.</p>{/if}
			<ul id="sugerencias" role="listbox" aria-label="Sugerencias" class="suggestions">
				{#each suggestions as s, i (s.id)}
					<!-- svelte-ignore a11y-click-events-have-key-events (el teclado va por el input: flechas + Enter) -->
					<li
						id="sugerencia-{i}"
						role="option"
						aria-selected={i === active}
						class:active={i === active}
						class:inside={s.checkedInAt}
						on:mousedown={(e) => e.preventDefault()}
						on:click={() => choose(s)}
					>
						<span class="s-main">
							<strong>{s.holder}</strong>{#if s.pronouns}&nbsp;({s.pronouns}){/if} · {s.type}
							<span class="s-code">{s.code}</span>
						</span>
						<span class="s-match">
							{#if s.match}coincide con <em>{s.match.label}</em>: {s.match.field === 'dni'
									? `•••.${s.match.value.slice(-3)}`
									: s.match.value}{:else}Compró {s.buyer}{/if}{#if s.checkedInAt}&nbsp;· ya ingresó {hhmm(
									s.checkedInAt
								)}{/if}
						</span>
						{#if s.notice}<span class="s-notice">⚠️ {DOOR_NOTICE_TEXT}</span>{/if}
					</li>
				{:else}
					{#if searched}
						<li class="empty" role="option" aria-selected="false" aria-disabled="true">
							Sin coincidencias para “{searched}”.
						</li>
					{/if}
				{/each}
			</ul>
			<p class="muted small">Tocá una persona para marcar su ingreso.</p>
		</div>
	</Sheet>

	<!-- Vender en puerta -->
	<Sheet bind:open={saleOpen} title="Vender en puerta">
		<form method="POST" action="?/sell" class="stack" on:submit|preventDefault={submitSale}>
			{#if !online}
				<p class="warn-note" role="note">
					<WifiOff size={18} aria-hidden="true" /> Sin conexión: la venta queda en este celu como «pendiente
					de sincronizar» y se manda sola cuando vuelva la conexión.
				</p>
			{/if}
			{#if !data.doorSales}
				<p class="warn-note" role="note">
					<TriangleAlert size={18} aria-hidden="true" /> Este evento es solo anticipadas. Podés vender
					igual: te vamos a pedir que confirmes y queda en el registro de actividad.
				</p>
			{/if}
			<WaitlistDoorNote summary={data.waitlist} action="vender" />
			{#if data.doorPrice}<p class="muted small">
					Nota del evento sobre la puerta: {data.doorPrice}
				</p>{/if}
			<label class="field">
				<span>Tipo de entrada</span>
				<select name="type" bind:value={saleType} required>
					{#each data.types as t (t.id)}
						<option value={t.id}>
							{t.name} · {t.gorra
								? 'a la gorra'
								: t.fondo > 0
									? `${formatARS(t.price)} (${formatARS(Math.max(0, t.price - t.fondo))} con el fondo)`
									: formatARS(t.price)} · {t.available === null
								? 'sin cupo'
								: t.taken > (t.capacity ?? 0)
									? `pasada del cupo (${t.taken} / ${t.capacity})`
									: t.available === 0
										? 'agotadas'
										: `quedan ${t.available}`}
						</option>
					{/each}
				</select>
			</label>
			<div class="row">
				<label class="field">
					<span>Cantidad</span>
					<input
						name="quantity"
						type="number"
						min="1"
						max={data.maxOrder}
						bind:value={saleQty}
						required
					/>
				</label>
				{#if sType?.gorra}
					<label class="field">
						<span>Monto por entrada (mín. {formatARS(sType.gorra.min)})</span>
						<input name="amount" inputmode="numeric" bind:value={saleAmount} required />
					</label>
				{:else if sType}
					<!-- Arranca con el precio de la puerta; se puede cobrar otro (0 = sin cargo). -->
					<label class="field">
						<span>Precio por entrada</span>
						<input
							name="amount"
							inputmode="numeric"
							autocomplete="off"
							bind:value={saleAmount}
							defaultValue={sType.price === 0 ? '' : String(sType.price)}
							aria-describedby="sale-price-hint"
							required
						/>
					</label>
				{/if}
			</div>
			{#if sType && !sType.gorra}
				<p class="muted small" id="sale-price-hint" aria-live="polite">
					{#if priceChange}
						<span class="changed">{priceChange}.</span>
						<button
							type="button"
							class="link"
							on:click={() => (saleAmount = String(sType?.price ?? ''))}
							>Volver a {formatARS(sType.price)}</button
						>
					{:else if sType.price === 0 && !String(saleAmount ?? '').trim()}
						<span class="changed"
							>Esta entrada no tiene precio en la puerta: escribí lo que cobraste (0 = sin cargo).</span
						>
					{:else if charged === null}
						<span class="changed">Escribí el precio en pesos, sin centavos (0 = sin cargo).</span>
					{:else}
						Es el precio de la puerta. Si cobraste otro, cambialo (0 = sin cargo).
					{/if}
				</p>
			{/if}
			{#if sType && !sType.gorra && sType.options.length > 1}
				<label class="field">
					<span>Opción de precio</span>
					<select name="option" bind:value={saleOption}>
						{#each sType.options as o (o.id)}<option value={o.id}
								>{doorOptionLabel(o, defaultFondoOption(sType.fondo))}</option
							>{/each}
					</select>
				</label>
			{/if}
			{#if saleBreakdown}
				<p class="muted small" id="sale-breakdown">{saleBreakdown}</p>
			{/if}
			<fieldset class="methods">
				<legend>Cómo pagó</legend>
				<label
					><input type="radio" name="method" value="efectivo" bind:group={saleMethod} /> Efectivo</label
				>
				<label
					><input type="radio" name="method" value="transferencia" bind:group={saleMethod} /> Transferencia
					(ya llegó)</label
				>
			</fieldset>
			{#if !online && saleMethod === 'transferencia'}
				<!-- Sin conexión no hay cómo controlar nada: quien vende confirma que la vio llegar. -->
				<label class="check"
					><input type="checkbox" name="transfer_seen" required /> Vi que llegó la transferencia</label
				>
			{/if}
			<label class="field">
				<span>Nombre de quien compra</span>
				<input name="name" autocomplete="off" required />
			</label>
			<div class="row">
				<label class="field">
					<span>Pronombres (opcional)</span>
					<input name="pronouns" autocomplete="off" />
				</label>
				{#if online}
					<label class="field">
						<span>DNI (opcional)</span>
						<input name="dni" inputmode="numeric" autocomplete="off" />
					</label>
				{:else}
					<!-- Sin conexión el DNI no se guarda en el celu (como la lista, que solo tiene los
					     últimos 3). -->
					<p class="muted small dni-off">DNI: sin conexión no se guarda en el celu.</p>
				{/if}
			</div>
			<label class="field">
				<span>Email (opcional)</span>
				<input name="email" type="email" autocomplete="off" bind:value={saleEmail} />
			</label>
			{#if saleEmail}
				<label class="check"
					><input type="checkbox" name="send_email" /> Mandarle las entradas por mail</label
				>
			{/if}
			{#if saleQty > 1}
				<p class="muted small">
					Nombres de las otras personas (si no, van a nombre de quien compra):
				</p>
				{#each Array.from({ length: Math.min(data.maxOrder, saleQty) - 1 }) as _, i (i)}
					<input
						name="holder_{i + 1}"
						placeholder="Nombre de la persona {i + 2}"
						autocomplete="off"
						aria-label="Persona {i + 2}"
					/>
				{/each}
			{/if}
			{#if noteOpen}
				<label class="field">
					<span>Nota (opcional; solo se ve en el panel)</span>
					<!-- svelte-ignore a11y-autofocus (se abre al tocar «Agregar nota») -->
					<textarea name="note" maxlength={data.noteMax} rows="2" autofocus></textarea>
				</label>
			{:else}
				<button type="button" class="link add-note" on:click={() => (noteOpen = true)}>
					<NotebookPen size={16} aria-hidden="true" /> Agregar nota
				</button>
			{/if}
			{#if saleError}<p class="error" role="alert">{saleError}</p>{/if}
			<button type="submit" class="primary" disabled={saleBusy}>
				{saleBusy
					? 'Vendiendo…'
					: salePrice === 0
						? 'Registrar sin cargo y marcar adentro'
						: `Cobrar ${salePrice === null ? '' : formatARS(salePrice)} y marcar adentro`}
			</button>
			{#if online}
				<p class="muted small">
					Se crea una compra aprobada ({saleMethod === 'efectivo' ? 'efectivo' : 'transferencia'},
					en la puerta), descuenta del cupo y las entradas quedan adentro. Queda en el registro de
					actividad.
				</p>
			{:else}
				<p class="muted small">
					Las entradas quedan adentro en este celu. Cuando vuelva la conexión se crea la compra
					aprobada ({saleMethod === 'efectivo' ? 'efectivo' : 'transferencia'}, en la puerta); si
					mientras tanto se llenó el cupo, se guarda igual y queda en «Para revisar».
				</p>
			{/if}
		</form>
	</Sheet>

	<!-- Compra completa -->
	<Sheet bind:open={purchaseOpen} title={purchase?.ref ? `Compra ${purchase.ref}` : 'Compra'}>
		{#if !purchase}
			<p class="muted">Cargando…</p>
		{:else}
			{#if purchaseError}<p class="error">{purchaseError}</p>{/if}
			{#if purchase.offline}<p class="muted">
					Sin conexión: solo los datos guardados en este celu.
				</p>{/if}
			<dl class="facts">
				{#if purchase.status}<dt>Estado</dt>
					<dd>{STATUS_TEXT[purchase.status] ?? purchase.status}</dd>{/if}
				<dt>Compró</dt>
				<dd>
					{purchase.buyer}{#if purchase.buyerPronouns}&nbsp;({purchase.buyerPronouns}){/if}
					{#if purchase.email}<br /><span class="email">{purchase.email}</span>{/if}
				</dd>
				{#if purchase.dniTail}
					<dt>DNI</dt>
					<dd>
						{#if linkMode}
							<span class="mono">•••.{purchase.dniTail}</span>
						{:else if revealed[purchase.ticketId]}
							<span class="mono">{Number(revealed[purchase.ticketId]).toLocaleString('es-AR')}</span
							>
						{:else}
							<button
								type="button"
								class="link"
								on:click={() =>
									reveal(/** @type {any} */ ({ detail: { ticketId: purchase.ticketId } }))}
							>
								•••.{purchase.dniTail} · ver completo
							</button>
						{/if}
					</dd>
				{/if}
				{#if purchase.method}
					<dt>Pago</dt>
					<dd>
						{METHOD_TEXT[purchase.method] ?? purchase.method}{purchase.channel === 'puerta' ||
						purchase.priceChange
							? ' · en la puerta'
							: purchase.channel === 'manual'
								? ' · cargada a mano'
								: ''}{#if purchase.confirmedBy}&nbsp;· {purchase.confirmedBy}{/if}
					</dd>
					<dt>Entradas</dt>
					<dd>{purchase.quantity} × {purchase.type} · {formatARS(purchase.unitPrice)}</dd>
					{#if purchase.fondoAmount}<dt>Fondo</dt>
						<dd>− {formatARS(purchase.fondoAmount)}</dd>{/if}
					{#if purchase.fondoContribution}<dt>Aporte al fondo</dt>
						<dd>+ {formatARS(purchase.fondoContribution)}</dd>{/if}
					{#if purchase.discountAmount}
						<dt>Descuento</dt>
						<dd>
							− {formatARS(purchase.discountAmount)}{purchase.discountCode
								? ` (${purchase.discountCode})`
								: ''}
						</dd>
					{/if}
					{#if purchase.surcharge}<dt>Recargo MP</dt>
						<dd>+ {formatARS(purchase.surcharge)}</dd>{/if}
					{#if purchase.priceChange}<dt>Precio</dt>
						<dd>{purchase.priceChange}</dd>{/if}
					<dt>Total</dt>
					<dd><strong>{purchase.total === 0 ? 'Sin cargo' : formatARS(purchase.total)}</strong></dd>
					{#if purchase.note}<dt>Nota</dt>
						<dd class="pre">{purchase.note}</dd>{/if}
					<dt>Creada</dt>
					<dd>{dateTime(purchase.createdAt)}</dd>
					{#if purchase.paidAt}<dt>Pagada</dt>
						<dd>{dateTime(purchase.paidAt)}</dd>{/if}
					{#if purchase.refundedAt}<dt>Reembolsada</dt>
						<dd>{dateTime(purchase.refundedAt)}</dd>{/if}
				{:else if purchase.type}
					<dt>Tipo</dt>
					<dd>{purchase.type}</dd>
				{/if}
			</dl>
			<h3 class="sub">Entradas de esta compra</h3>
			<ul class="order-tickets">
				{#each purchase.tickets as t (t.id)}
					<li class:inside={t.at}>
						<span>
							<strong>{t.holder}</strong>{#if t.pronouns}&nbsp;({t.pronouns}){/if}
							{#if t.code}<span class="s-code">{t.code}</span>{/if}
						</span>
						<span class="state">
							{#if t.at}<CircleCheck size={16} /> adentro {hhmm(t.at)}{#if t.by}&nbsp;· {t.by}{/if}
							{:else}sin ingresar{/if}
						</span>
					</li>
				{/each}
			</ul>
			{#if !linkMode && !purchase.offline && orderHref(ordersHref, purchase.id)}
				<a class="link-btn" href={orderHref(ordersHref, purchase.id)}
					>Ver la orden en la ficha del evento</a
				>
			{:else if !linkMode && door.sales.some((x) => x.id === pendingSaleId(purchase.ticketId))}
				<!-- Venta sin conexión todavía en la cola del celu: se puede descartar (pregunta antes). -->
				<button
					type="button"
					class="danger-btn"
					on:click={() => discardSale(pendingSaleId(purchase.ticketId))}
					>Descartar esta venta (todavía no se mandó al servidor)</button
				>
			{/if}
		{/if}
	</Sheet>

	<!-- Cómo hacer la puerta (la misma guía que docs/tickets.md, «Puerta: cómo hacerla») -->
	<Sheet bind:open={guideOpen} title="Cómo hacer la puerta">
		<DoorGuide canSell={data.doorSales} {linkMode} />
	</Sheet>

	<!-- Opciones -->
	<Sheet bind:open={menuOpen} title="Opciones">
		<div class="stack">
			<button
				type="button"
				class="option"
				on:click={() => {
					menuOpen = false;
					guideOpen = true;
				}}
			>
				<CircleHelp size={22} /> Cómo hacer la puerta
			</button>
			<button type="button" class="option" on:click={toggleSound} aria-pressed={sound}>
				{#if sound}<Volume2 size={22} />{:else}<VolumeX size={22} />{/if}
				Sonido al escanear: {sound ? 'prendido' : 'apagado'}
			</button>
			<button
				type="button"
				class="option"
				on:click={() => sync().then(refreshList)}
				disabled={!online}
			>
				<RefreshCw size={22} /> Actualizar la lista {door.savedAt
					? `(guardada ${hhmm(door.savedAt)}, ${entradas(door.list.length)})`
					: ''}
			</button>
			<p class="muted small">
				La lista de entradas se guarda en este celu para seguir validando si se corta la conexión.
				Los ingresos marcados y las ventas hechas sin conexión se mandan solos cuando vuelve. Vibra
				al escanear; pantalla siempre prendida mientras esta página está abierta.
			</p>
			{#if linkMode}
				<button type="button" class="link-btn" on:click={leaveLink} disabled={!canLeave}>
					Cerrar la puerta en este celu
				</button>
				{#if !canLeave}
					<p class="muted small">
						Primero sincronizá lo pendiente (y cargá a mano las ventas que no se pudieron
						registrar).
					</p>
				{/if}
			{:else}
				{#if door.sales.length}
					<!-- Ventas sin conexión que todavía no se mandaron: se pueden descartar de este celu. -->
					<h3 class="sub">Ventas sin sincronizar</h3>
					<ul class="queued">
						{#each door.sales as q (q.id)}
							<li>
								<span>
									<strong>{q.buyer}</strong> · {q.quantity} × {q.type}{q.total === null
										? ''
										: ` · ${formatARS(q.total)}`} · {hhmm(q.at)}
								</span>
								<button
									type="button"
									class="danger-btn small"
									disabled={syncing}
									on:click={() => discardSale(q.id)}>Descartar</button
								>
							</li>
						{/each}
					</ul>
					<p class="muted small">
						Descartar solo la borra de este celu. Las que ya se mandaron son órdenes: se revisan en
						Órdenes.
					</p>
				{/if}
				<a class="link-btn" href={ordersHref}>Ver todas las órdenes del evento</a>
				<a class="link-btn" href="/admin/eventos/{encodeURIComponent(data.slug)}/ordenes/cargar"
					>Cargar entradas a mano (invitaciones, cortesías)</a
				>
				<a class="link-btn" href={listHref}>Elegir otro evento</a>
			{/if}
		</div>
	</Sheet>

	<OverrideDialog bind:this={overrideDialog} confirmLabel="Sí, vender igual" />
</div>

<style>
	/* Oscuro siempre (en la puerta hay poca luz), con los colores del sitio. Los tokens van en
	   .door-root para que también los tomen las hojas (<dialog>). */
	.door-root {
		--bg: #16121a;
		--surface: #221c28;
		--surface-2: #2c2533;
		--line: #3a3242;
		--text: #f1ecf4;
		--muted: #a9a0b0;
		--accent: hsl(319, 90%, 60%);
		--accent-dark: hsl(319, 100%, 35%);
		--link: hsl(262, 100%, 82%);
		--ok: hsl(165, 70%, 62%);
		--ok-bg: hsl(165, 40%, 14%);
		--warn: hsl(50, 100%, 70%);
		--bad: hsl(330, 100%, 78%);
		--bad-bg: hsl(325, 55%, 20%);
		--warn-bg: hsl(45, 45%, 22%);
		--accent-ink: white;
		color-scheme: dark;
		color: var(--text);
		background: var(--bg);
		min-height: 100dvh;
		font-family: 'Lato', sans-serif;
	}
	.door {
		position: fixed;
		inset: 0;
		overflow-y: auto;
		background: var(--bg);
		color: var(--text);
		font-family: 'Lato', sans-serif;
		padding: calc(env(safe-area-inset-top, 0px) + 0.8rem) 16px
			calc(env(safe-area-inset-bottom, 0px) + 1.5rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		max-width: 40rem;
		margin: 0 auto;
		box-sizing: border-box;
		/* Sin «tirar para recargar» (UX V12): sin conexión, recargar deja la Puerta en blanco. */
		overscroll-behavior-y: contain;
	}
	@media (min-width: 700px) {
		.door {
			position: static;
			min-height: 100dvh;
		}
	}
	:global(html:has(.door)),
	:global(body:has(.door)) {
		background: #16121a;
		overscroll-behavior-y: contain;
	}
	h1,
	h2,
	h3,
	p {
		margin: 0;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}
	.heading {
		flex: 1;
		min-width: 0;
	}
	h1 {
		font-size: var(--text-base);
		font-weight: 700;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		line-height: 1.2;
	}
	.heading p {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.heading .link-note {
		color: var(--warn);
	}
	.heading .auto a {
		color: var(--text);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 0.15em;
		white-space: nowrap;
		/* Área de toque cómoda sin mover la línea. */
		padding: 0.6rem 0.2rem;
		margin: -0.6rem -0.2rem;
	}
	.round {
		flex: none;
		width: 2.9rem;
		height: 2.9rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		color: var(--text);
		border: 0;
		cursor: pointer;
	}
	.banner {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--surface-2);
		font-size: var(--text-sm);
	}
	.left-sales ul {
		margin: 0.25rem 0 0;
		padding-left: 1.1rem;
	}
	.banner span {
		flex: 1;
	}
	.banner.offline {
		background: hsl(45, 60%, 17%);
		color: var(--warn);
	}
	.banner .keep,
	.banner .pending {
		display: block;
		margin-top: var(--space-3xs);
	}
	.dni-off {
		align-self: end;
		padding-bottom: 0.6rem;
	}
	.banner.ready {
		background: var(--ok-bg);
		font-size: var(--text-xs);
	}
	.banner.ready :global(svg) {
		color: var(--ok);
		flex: none;
	}
	.banner.warn {
		background: var(--bad-bg);
		color: var(--bad);
	}
	.banner .x {
		background: none;
		border: 0;
		color: inherit;
		cursor: pointer;
		padding: 0.2rem;
	}
	.link {
		background: none;
		border: 0;
		color: var(--link);
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		font-size: inherit;
	}
	.counter {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 0.4rem var(--space-xs);
	}
	.big {
		display: flex;
		align-items: baseline;
		gap: var(--space-2xs);
		flex-wrap: wrap;
	}
	.big .num {
		font-size: var(--step-5);
		font-weight: 700;
		line-height: 1;
	}
	.of {
		font-size: var(--text-base);
		color: var(--muted);
	}
	.types {
		list-style: none;
		margin: 0;
		padding: 0;
		text-align: right;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.track {
		grid-column: 1 / -1;
		height: 0.55rem;
		border-radius: var(--radius-m);
		background: #332b3a;
		overflow: hidden;
	}
	.track span {
		display: block;
		height: 100%;
		background: var(--3);
		border-radius: inherit;
		transition: width 0.3s;
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2xs);
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: var(--space-s) var(--space-2xs);
		border-radius: var(--radius-l);
		border: 0;
		background: var(--surface-2);
		color: var(--text);
		font-weight: 700;
		font-size: var(--text-base);
		cursor: pointer;
	}
	.no-door {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		margin: 0;
		padding: var(--space-xs) var(--space-xs);
		border-radius: var(--radius-l);
		border: 2px dashed var(--line);
		color: var(--muted);
		text-align: center;
	}
	.no-door p {
		margin: 0;
	}
	.no-door .link-btn {
		background: transparent;
		font: inherit;
		font-weight: 700;
		padding: var(--space-2xs) var(--space-xs);
		cursor: pointer;
	}
	.warn-note {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
		margin: 0;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--warn) 18%, var(--surface));
		color: var(--text);
	}
	.tile.wide {
		grid-column: 1 / -1;
		flex-direction: row;
		justify-content: center;
		padding: var(--space-xs);
		background: transparent;
		border: 2px solid var(--line);
	}
	.recent h2 {
		font-size: var(--text-xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 700;
		margin-bottom: 0.4rem;
	}
	.recent ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.recent li {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-2xs) 0;
		border-bottom: 1px solid var(--line);
	}
	.recent li:last-child {
		border-bottom: 0;
	}
	.dot {
		flex: none;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.dot.ok {
		background: hsl(165, 60%, 16%);
		color: var(--ok);
	}
	.dot.warn {
		background: hsl(45, 60%, 17%);
		color: var(--warn);
	}
	.dot.undone {
		background: color-mix(in srgb, var(--muted) 20%, transparent);
		color: var(--muted);
	}
	.dot.bad {
		background: var(--bad-bg);
		color: var(--bad);
	}
	.txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow-wrap: anywhere;
	}
	.txt small {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	time {
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: var(--text-sm);
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
		transform: translateX(-50%);
		background: var(--text);
		color: var(--bg);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: 2em;
		font-weight: 700;
		max-width: calc(100% - 32px);
		box-sizing: border-box;
		z-index: 5;
	}

	/* Hojas (dentro del <dialog>, fuera de .door: tokens propios) */
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2xs);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
		color: var(--muted);
		min-width: 0;
	}
	input:not([type='radio']):not([type='checkbox']),
	select {
		font: inherit;
		font-size: var(--text-field);
		padding: var(--space-2xs) var(--space-xs);
		min-height: 3rem;
		border-radius: var(--radius-m);
		border: 2px solid var(--line);
		background: var(--surface-2);
		color: var(--text);
		width: 100%;
		box-sizing: border-box;
	}
	.code-input {
		font-size: var(--text-lg) !important;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		text-align: center;
	}
	.primary {
		font: inherit;
		font-weight: 700;
		font-size: var(--text-base);
		min-height: 3.2rem;
		border: 0;
		border-radius: 2em;
		background: var(--accent);
		color: #fff;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.changed {
		color: var(--text);
		font-weight: 600;
	}
	.add-note {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		align-self: flex-start;
		min-height: 2.75rem;
	}
	.field textarea {
		font: inherit;
		font-size: var(--text-field);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		border: 2px solid var(--line);
		background: var(--surface-2);
		color: var(--text);
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
	}
	.pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.methods {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem var(--space-s);
	}
	.methods legend {
		font-size: var(--text-sm);
		color: var(--muted);
		margin-bottom: 0.3rem;
	}
	.methods label,
	.check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
	}
	input[type='radio'],
	input[type='checkbox'] {
		width: 1.3rem;
		height: 1.3rem;
		accent-color: var(--accent);
	}
	.error {
		background: var(--error-bg);
		color: var(--error);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
	}
	.suggestions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	[role='option'] {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: var(--space-2xs) var(--space-xs);
		min-height: 2.8rem;
		border-radius: var(--radius-m);
		background: var(--surface-2);
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	[role='option'].active,
	[role='option']:hover {
		outline: 2px solid var(--link);
	}
	[role='option'].inside {
		opacity: 0.7;
	}
	[role='option'].empty {
		cursor: default;
		color: var(--muted);
		background: none;
		outline: none;
	}
	.s-code {
		font-family: ui-monospace, monospace;
		font-size: var(--text-xs);
		color: var(--muted);
		margin-left: 0.4rem;
	}
	.s-match {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.s-notice {
		display: block;
		font-size: var(--text-sm);
		font-weight: 800;
	}
	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.4rem var(--space-xs);
		margin: 0;
	}
	.facts dt {
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-weight: 700;
	}
	.sub {
		font-size: var(--text-sm);
		margin-top: 0.3rem;
	}
	.order-tickets {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.order-tickets li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2xs);
		flex-wrap: wrap;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--surface-2);
	}
	.order-tickets .state {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.order-tickets li.inside .state {
		color: var(--ok);
	}
	.link-btn {
		display: block;
		text-align: center;
		padding: var(--space-xs);
		border-radius: 2em;
		border: 2px solid var(--line);
		color: var(--text);
		text-decoration: none;
		font-weight: 700;
	}
	.danger-btn {
		display: block;
		width: 100%;
		padding: var(--space-xs);
		min-height: 2.75rem;
		border-radius: 2em;
		border: 2px solid var(--bad);
		background: var(--bad-bg);
		color: var(--bad);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.danger-btn.small {
		width: auto;
		padding: var(--space-3xs) var(--space-xs);
		font-size: var(--text-sm);
	}
	.danger-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.queued {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.queued li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		flex-wrap: wrap;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--surface-2);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.option {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-xs) var(--space-xs);
		border-radius: var(--radius-m);
		border: 0;
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}
	.option:disabled {
		opacity: 0.5;
	}
	.email {
		overflow-wrap: anywhere;
	}
</style>
