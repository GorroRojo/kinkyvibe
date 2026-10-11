/**
 * Qué pantalla corresponde a cada estado de la navegación (nav.js). Lee lo que haga falta por
 * `deps` (los próximos eventos públicos, lo público de una tarjeta, el Fondo) y arma la pantalla
 * con screens.js. No sabe de la base ni de cómo se manda.
 *
 * Todo evento se busca **entre los próximos públicos** (`deps.listUpcoming`), también el de un
 * botón viejo: si ya no está, se avisa y no se cambia el mensaje.
 */
import { UNAVAILABLE_TEXT, UNKNOWN_TEXT } from './format.js';
import { findByToken } from './keyboards.js';
import { findByNavId } from './nav.js';
import {
	eventScreen,
	fondoScreen,
	helpScreen,
	homeScreen,
	listScreen,
	searchScreen
} from './screens.js';
import { eventsInWindow } from './windows.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */
/** @typedef {import('./nav.js').NavState} NavState */
/** @typedef {import('./nav.js').ListView} ListView */
/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').ScreenCtx} ScreenCtx */
/**
 * @typedef {{
 *   listUpcoming: () => Promise<BotEvent[]>,
 *   origin: string,
 *   now?: () => number,
 *   card?: (event: BotEvent) => Promise<import('./screens.js').CardInfo>,
 *   fondo?: () => Promise<import('./screens.js').FondoNumbers | null>,
 *   botUsername?: string | null
 * }} NavDeps
 */
/** @typedef {{ screen: Screen } | { toast: string }} NavResult */

/** @type {Record<ListView, 'hoy' | 'semana' | 'finde' | null>} */
const WINDOWS = { d: 'hoy', w: 'semana', f: 'finde', p: null };

/**
 * Los eventos de una lista, en orden.
 *
 * @param {ListView} view
 * @param {BotEvent[]} events
 * @param {number} now
 */
export function eventsForView(view, events, now) {
	const window = WINDOWS[view];
	return window ? eventsInWindow(events, window, now) : events;
}

/**
 * La tarjeta de un evento, con la lista de la que vino (para «‹ 2/7 ›» y «Volver»).
 *
 * @param {BotEvent} event
 * @param {import('./nav.js').BackView} back
 * @param {BotEvent[]} events todos los próximos
 * @param {ScreenCtx} ctx
 * @param {NavDeps} deps
 * @param {{ follow?: import('./screens.js').Button | null }} [extra]
 * @returns {Promise<Screen>}
 */
export async function cardFor(event, back, events, ctx, deps, extra) {
	const info = deps.card ? await deps.card(event) : {};
	const list = back === 'n' ? [] : eventsForView(back, events, ctx.now ?? Date.now());
	return eventScreen(event, info, { back, list }, ctx, extra);
}

/**
 * @param {NavState} state
 * @param {ScreenCtx} ctx
 * @param {NavDeps} deps
 * @param {{ accounts?: boolean, follow?: (event: BotEvent) => import('./screens.js').Button | null }} [opts]
 * @returns {Promise<NavResult>}
 */
export async function navigate(state, ctx, deps, opts = {}) {
	const now = ctx.now ?? Date.now();
	switch (state.screen) {
		case 'home':
			return { screen: homeScreen(ctx) };
		case 'help':
			return { screen: helpScreen(ctx, { accounts: Boolean(opts.accounts) }) };
		case 'search':
			return { screen: searchScreen(ctx) };
		case 'fondo':
			return { screen: fondoScreen(deps.fondo ? await deps.fondo() : null, ctx) };
		case 'list': {
			const events = eventsForView(state.view, await deps.listUpcoming(), now);
			return { screen: listScreen(state.view, events, state.page, ctx) };
		}
		case 'event':
		case 'legacy_event': {
			const events = await deps.listUpcoming();
			const event =
				state.screen === 'event' ? findByNavId(events, state.id) : findByToken(events, state.token);
			if (!event) return { toast: UNAVAILABLE_TEXT };
			const back = state.screen === 'event' ? state.back : 'p';
			const follow = opts.follow ? opts.follow(event) : null;
			return { screen: await cardFor(event, back, events, ctx, deps, { follow }) };
		}
		default:
			return { toast: UNKNOWN_TEXT };
	}
}
