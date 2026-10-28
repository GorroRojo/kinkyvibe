/**
 * «📊 Estado» y «🔔 Mis avisos» para admins en el bot (decisión 0041, docs/telegram.md «Estado y
 * avisos para admins»): las pantallas. Puras: lo de la base llega por `BotAdmin` (adminData.js) y
 * quién es admin lo decide el router **antes** de llegar acá, en cada mensaje y cada botón.
 *
 * Solo cantidades y links: ningún nombre, mail, DNI ni teléfono de quien compra (los datos no
 * llegan acá: adminData.js solo cuenta).
 */
import { escapeHtml } from './format.js';
import { truncate } from './keyboards.js';
import { encodeNav } from './nav.js';
import { isHttps, paginate, pagerRow, tgTime } from './screens.js';
import { botText } from './texts.js';
import { NOTICE_CODES, encodeAdminNav } from './adminNav.js';

/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').ScreenCtx} ScreenCtx */
/** @typedef {import('./screens.js').Button} Button */
/** @typedef {import('./adminNav.js').AdminNavState} AdminNavState */
/** @typedef {import('./adminNav.js').NoticeKind} NoticeKind */
/** @typedef {import('./adminData.js').AdminEventChoice} AdminEventChoice */
/** @typedef {import('./adminData.js').EventStatus} EventStatus */
/** @typedef {import('./adminData.js').BotAdmin} BotAdmin */
/** @typedef {import('./adminLink.js').AdminIdentity} AdminIdentity */

/** @returns {Button} */
const homeButton = () => ({
	text: botText('inicio.boton_inicio'),
	callback_data: encodeNav({ screen: 'home' })
});

/** @returns {Button} */
const noticesButton = () => ({
	text: botText('admin.boton_avisos'),
	callback_data: encodeAdminNav({ screen: 'admin_notices' })
});

/**
 * El nombre de un tipo de aviso (lo mismo en el botón y en el aviso al tocarlo).
 *
 * @param {NoticeKind} kind
 */
export function noticeLabel(kind) {
	switch (kind) {
		case 'resumen_diario':
			return botText('admin.aviso_diario');
		case 'cada_venta':
			return botText('admin.aviso_venta');
		case 'transferencia':
			return botText('admin.aviso_transferencia');
		case 'dia_evento':
			return botText('admin.aviso_dia');
		case 'fallas_compra':
			return botText('admin.aviso_fallas');
		default:
			return botText('admin.aviso_recordatorios');
	}
}

/** @param {AdminEventChoice} choice */
const cancelledMark = (choice) =>
	choice.cancelled ? ` · ${escapeHtml(botText('admin.cancelado'))}` : '';

/**
 * «📊 Estado»: los eventos con entradas de hoy y los que vienen, de a 5, con un botón por evento.
 *
 * @param {AdminEventChoice[]} choices
 * @param {number} page
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function adminEventsScreen(choices, page, ctx) {
	if (choices.length === 0) {
		return { text: botText('admin.sin_eventos'), keyboard: [[noticesButton(), homeButton()]] };
	}
	const { pages, page: current, from, to } = paginate(choices.length, page);
	const shown = choices.slice(from, to);
	const lines = shown.map((c) => {
		const when = tgTime(c.start, ctx.now);
		const title = `<b>${escapeHtml(c.title)}</b>${cancelledMark(c)}`;
		return when ? `${when}\n${title}` : title;
	});
	const pager = pagerRow(current, pages, (p) =>
		encodeAdminNav({ screen: 'admin_events', page: p })
	);
	return {
		text: `${botText('admin.elegir')}\n\n${lines.join('\n\n')}`,
		keyboard: [
			...shown.map((c) => [
				{
					text: botText('admin.boton_evento', { evento: truncate(c.title, 28) }),
					callback_data: encodeAdminNav({ screen: 'admin_event', hash: c.hash })
				}
			]),
			...(pager ? [pager] : []),
			[noticesButton(), homeButton()]
		]
	};
}

/**
 * Las líneas de los tipos de entrada: vendidas contra cupo y, si tiene, cada tramo.
 *
 * @param {EventStatus} status
 * @returns {string[]}
 */
function typeLines(status) {
	/** @type {string[]} */
	const lines = [];
	for (const type of status.types) {
		lines.push(
			type.capacity === null
				? botText('admin.tipo_sin_cupo', { tipo: type.name, vendidas: type.sold })
				: botText('admin.tipo', { tipo: type.name, vendidas: type.sold, cupo: type.capacity })
		);
		for (const tier of type.tiers) {
			const line =
				tier.quantity === null
					? botText('admin.tramo_sin_cantidad', { tramo: tier.name, vendidas: tier.sold })
					: botText('admin.tramo', {
							tramo: tier.name,
							vendidas: tier.sold,
							cantidad: tier.quantity
						});
			lines.push(tier.current ? `${line} ${escapeHtml(botText('admin.tramo_vigente'))}` : line);
		}
	}
	if (status.types.length > 1) {
		lines.push(
			status.capacity === null
				? botText('admin.total_sin_cupo', { vendidas: status.sold })
				: botText('admin.total', { vendidas: status.sold, cupo: status.capacity })
		);
	}
	return lines;
}

/**
 * Lo pendiente: reservas sin pagar (y las que vencen en la próxima hora), transferencias por
 * confirmar, órdenes para revisar y la lista de espera. Solo lo que no es cero.
 *
 * @param {EventStatus} status
 * @returns {string[]}
 */
function pendingLines(status) {
	/** @type {string[]} */
	const lines = [];
	if (status.held > 0) {
		lines.push(botText('admin.reservas', { cantidad: status.held, por_vencer: status.expiring }));
	}
	if (status.transfers > 0) {
		lines.push(botText('admin.transferencias', { cantidad: status.transfers }));
	}
	if (status.review > 0) lines.push(botText('admin.revisar', { cantidad: status.review }));
	if (lines.length === 0) lines.push(botText('admin.nada_pendiente'));
	if (status.waitlist) lines.push(botText('admin.espera', { cantidad: status.waitlist }));
	return lines;
}

/**
 * El estado de la venta de un evento: solo cantidades, «🔄 Actualizar», «Ver en el panel ↗» (el
 * evento en el panel, con lo de cada compra) y «‹ Volver» a la lista.
 *
 * @param {AdminEventChoice} choice
 * @param {EventStatus} status
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function adminStatusScreen(choice, status, ctx) {
	const when = tgTime(choice.start, ctx.now);
	const head = [
		botText('admin.titulo', { evento: choice.title }),
		...(when ? [`📅 ${when}`] : []),
		...(choice.cancelled ? [escapeHtml(botText('admin.cancelado'))] : [])
	];
	const text = [
		head.join('\n'),
		typeLines(status).join('\n'),
		pendingLines(status).join('\n'),
		botText('admin.pie')
	]
		.filter(Boolean)
		.join('\n\n');
	/** @type {Button[]} */
	const top = [
		{
			text: botText('admin.boton_actualizar'),
			callback_data: encodeAdminNav({ screen: 'admin_event', hash: choice.hash })
		}
	];
	if (isHttps(ctx.origin)) {
		top.push({
			text: botText('admin.boton_panel'),
			url: `${ctx.origin}/admin/eventos/${encodeURIComponent(choice.slug)}`
		});
	}
	return {
		text,
		keyboard: [
			top,
			[
				{
					text: botText('inicio.boton_volver'),
					callback_data: encodeAdminNav({ screen: 'admin_events', page: 0 })
				},
				homeButton()
			]
		]
	};
}

/**
 * «🔔 Mis avisos»: un botón por tipo de aviso, con ✅ (prendido) o ⬜ (apagado).
 *
 * @param {Set<NoticeKind>} on
 * @returns {Screen}
 */
export function adminNoticesScreen(on) {
	const codes = /** @type {(keyof typeof NOTICE_CODES)[]} */ (Object.keys(NOTICE_CODES));
	return {
		text: botText('admin.avisos'),
		keyboard: [
			...codes.map((code) => {
				const kind = NOTICE_CODES[code];
				return [
					{
						text: `${on.has(kind) ? '✅' : '⬜'} ${noticeLabel(kind)}`,
						callback_data: encodeAdminNav({ screen: 'admin_notice', code })
					}
				];
			}),
			[
				{
					text: botText('admin.boton_estado'),
					callback_data: encodeAdminNav({ screen: 'admin_events', page: 0 })
				},
				homeButton()
			]
		]
	};
}

/**
 * La pantalla de un botón o comando de admins, para une admin **ya revisade** por el router.
 * Un evento que no está entre los próximos con entradas (botón viejo o armado a mano) no muestra
 * nada: contesta lo mismo que cualquier botón viejo.
 *
 * @param {AdminNavState} state
 * @param {AdminIdentity} who
 * @param {ScreenCtx} ctx
 * @param {BotAdmin} admin
 * @returns {Promise<{ screen: Screen, toast?: string } | { toast: string }>}
 */
export async function adminResult(state, who, ctx, admin) {
	const now = ctx.now ?? Date.now();
	switch (state.screen) {
		case 'admin_events':
			return { screen: adminEventsScreen(await admin.events(now), state.page, ctx) };
		case 'admin_event': {
			const choice = (await admin.events(now)).find((c) => c.hash === state.hash);
			const status = choice ? await admin.status(choice.slug, now) : null;
			if (!choice || !status) return { toast: botText('errores.no_disponible') };
			return { screen: adminStatusScreen(choice, status, ctx) };
		}
		case 'admin_notices':
			return { screen: adminNoticesScreen(await admin.notices(who.id)) };
		default: {
			const kind = NOTICE_CODES[state.code];
			const turnOn = !(await admin.notices(who.id)).has(kind);
			const after = await admin.setNotice(who.id, kind, turnOn);
			return {
				screen: adminNoticesScreen(after),
				toast: botText(turnOn ? 'admin.prendido' : 'admin.apagado', { aviso: noticeLabel(kind) })
			};
		}
	}
}
