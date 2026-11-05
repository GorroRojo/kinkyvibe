/**
 * Interruptores de funciones nuevas (decisión 0001: todo lo nuevo sale apagado y se prende desde
 * el panel, en /admin/ajustes/interruptores). Se guardan en D1 (`feature_flags`,
 * migrations/0013_cuentas.sql); sin fila = apagado.
 *
 * Cada interruptor tiene además una variable de entorno que manda sobre la base: `1` lo fuerza
 * prendido (tests E2E, `vite dev`), `0` lo fuerza apagado (para cortarlo de golpe desde el panel
 * de Cloudflare si algo sale mal). Vacía o ausente = lo que diga la base.
 *
 * Para no consultar la base en cada página, el valor se recuerda unos segundos por isolate. Entre
 * pedidos se comparten solo valores ya leídos; la lectura en camino, solo dentro del pedido
 * (`readAndKeep`, src/lib/server/db/perRequest.js: una lectura de otro pedido puede colgar).
 */
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { readAndKeep } from '$lib/server/db/perRequest.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Los interruptores que existen. `key` es la clave en `feature_flags`. */
export const FLAGS = Object.freeze({
	lo_que_sigo: {
		label: 'Lo que sigo',
		description:
			'Con cuenta, la gente puede seguir etiquetas (y series), perfiles y lugares: «Seguir» en sus ' +
			'páginas y Mi rincón → Lo que sigo, con «en mi calendario», «mail cuando se anuncia algo ' +
			'nuevo» y «recordatorio el día antes» por cada cosa. Apagado, no se ve nada de esto.',
		// Para técnicos (plegado en la página).
		tech: 'Apagado, /mi-rincon/sigo da 404.',
		envVar: 'LO_QUE_SIGO_ENABLED'
	},
	telegram_bot: {
		label: 'Bot de Telegram',
		description:
			'El bot de la comunidad contesta en Telegram con los próximos eventos públicos. Con ' +
			'«Lo que sigo» prendido, además le manda a cada persona sus avisos por Telegram (si conecta ' +
			'su cuenta en Mi rincón → Lo que sigo). Apagado, el bot no contesta nada. Antes de ' +
			'prenderlo, pedile a quien maneja el sitio que lo deje configurado.',
		tech:
			'Comandos /proximos y /evento (docs/telegram.md, decisión 0029). Antes de prenderlo: ' +
			'cargar TELEGRAM_WEBHOOK_SECRET y apuntar el webhook del bot a /api/telegram. Los avisos ' +
			'necesitan el secret TELEGRAM_BOT_TOKEN y la migración 0033.',
		envVar: 'TELEGRAM_BOT_ENABLED'
	},
	telegram_puerta: {
		label: 'Puerta por Telegram',
		description:
			'Les admins pueden marcar ingresos desde Telegram, con el escáner de QR del celular: cada ' +
			'admin vincula su Telegram en Ajustes → Admins y abre la puerta desde el bot. Solo anda ' +
			'para admins con el Telegram vinculado. Necesita el bot prendido. Apagado, no se pueden ' +
			'marcar ingresos desde Telegram (ni vincular, salvo con «Telegram para admins» prendido).',
		tech:
			'Mini App /telegram/puerta (docs/telegram.md, decisión 0037). Valida el initData con ' +
			'TELEGRAM_BOT_TOKEN en cada pedido. Necesita la migración 0050, TELEGRAM_BOT_TOKEN y ' +
			'TELEGRAM_BOT_USERNAME. Apagado, /telegram/puerta da 404.',
		envVar: 'TELEGRAM_PUERTA_ENABLED'
	},
	telegram_admin: {
		label: 'Telegram para admins: estado y avisos',
		description:
			'Les admins con el Telegram vinculado ven «📊 Estado» en el bot: cuántas entradas se ' +
			'vendieron de cada evento, reservas por vencer y lo que hay para revisar, solo con ' +
			'cantidades (nunca datos de compradores). Cada admin elige en «🔔 Mis avisos» qué avisos ' +
			'quiere recibir (vienen apagados). Necesita el bot prendido. Apagado, nada de esto se ve ' +
			'y el bot contesta como si no existiera.',
		tech:
			'docs/telegram.md («Estado y avisos para admins»), decisión 0041. Vincular el Telegram ' +
			'(Ajustes → Admins) anda con este o con «Puerta por Telegram». Necesita la migración ' +
			'0054 para «Mis avisos».',
		envVar: 'TELEGRAM_ADMIN_ENABLED'
	},
	telegram_enriquecido: {
		label: 'Telegram: mensajes enriquecidos y compartir',
		description:
			'Cuando el bot manda algo del sitio (una entrada de la Kinkipedia, un material, un evento), ' +
			'el contenido se lee adentro del chat, con «Ver en el sitio» abajo. En la Mini App del ' +
			'calendario, cada evento tiene «Mandar a un chat», y el evento mandado trae un botón que ' +
			'abre el calendario justo en ese evento. Solo lo público, lo mismo que el sitio sin cuenta. ' +
			'Necesita el bot prendido. Apagado, el bot manda las tarjetas de siempre.',
		tech:
			'docs/telegram.md («Mensajes enriquecidos y compartir»). Los mensajes enriquecidos (Bot API ' +
			'10.1–10.3) salen solo con TELEGRAM_BOT_TOKEN; si Telegram los rechaza, sale la tarjeta de ' +
			'siempre. Compartir usa savePreparedInlineMessage + shareMessage (Bot API 8.0). «Abrir en el ' +
			'calendario» necesita TELEGRAM_BOT_USERNAME y la Main Mini App registrada en @BotFather.',
		envVar: 'TELEGRAM_ENRIQUECIDO_ENABLED'
	},
	telegram_estadisticas: {
		label: 'Telegram: estadísticas de uso',
		description:
			'Cuenta cómo se usa el bot, para Estadísticas → Bot de Telegram: quién lo usa y cuánto (un ' +
			'número por persona y por día) y, aparte y sumado por semana, qué pantallas, búsquedas y ' +
			'cosas se usan. Nunca se guarda qué buscó o miró cada persona. Necesita el bot prendido. ' +
			'Apagado, no se cuenta nada.',
		tech:
			'docs/telegram.md («Estadísticas de uso»), decisión 0045. Necesita la migración 0057 ' +
			'(tablas telegram_uso_personas y telegram_uso_totales). Los resultados inline elegidos ' +
			'necesitan /setinlinefeedback en @BotFather y volver a registrar el webhook.',
		envVar: 'TELEGRAM_ESTADISTICAS_ENABLED'
	},
	propinas_fondo: {
		label: 'Donaciones únicas al Fondo',
		description:
			'El botón «Una vez» de fondo.kinkyvibe.ar trae a la gente a dejar una propina para el Fondo ' +
			'Kinky Vibe acá, sin cuenta ni datos, y al terminar les devuelve al Fondo. Apagado, esa ' +
			'página solo explica que las propinas se dejan desde cada publicación.',
		tech:
			'/propinas?de=fondo (y su POST, source = fondo). El total para el Fondo ' +
			'(GET /api/fondo/propinas-total) no depende de este interruptor. Antes de prenderlo: ' +
			'migración 0052. docs/propinas.md.',
		envVar: 'PROPINAS_FONDO_ENABLED'
	},
	lista_espera: {
		label: 'Lista de espera',
		description:
			'Cuando un evento (o un tipo de entrada) se agota, la gente se puede anotar en una lista de ' +
			'espera. Si se libera un lugar, le avisamos por mail a la próxima persona y se lo guardamos ' +
			'un rato. Se activa por evento, en su editor. Apagado, nada de esto se ve y la venta anda ' +
			'como siempre. Todavía está en construcción.',
		tech:
			'docs/tickets.md, «Lista de espera». Antes de prenderlo: migración 0053. Tablas ' +
			'waitlist_entries y waitlist_sends; clave `lista_espera` del evento.',
		envVar: 'LISTA_ESPERA_ENABLED'
	},
	combo_codigos: {
		label: 'Códigos combo entre eventos',
		description:
			'En la pestaña Códigos de un evento se puede armar un combo con otro evento: quien compra ' +
			'una entrada del primero (online, en la puerta o cargada a mano) recibe en el mail de sus entradas un código de descuento ' +
			'para el segundo, de un solo uso y solo para su mail. Si la compra se reembolsa, el código ' +
			'deja de valer. Apagado, no se arman combos ni se generan códigos nuevos (los que ya se ' +
			'mandaron siguen valiendo).',
		tech:
			'docs/tickets.md, «Códigos combo». Antes de prenderlo: migración 0056 (tabla ' +
			'ticket_combos y columnas buyer_email y source_order_id de discount_codes). ' +
			'src/lib/server/tickets/combos.js.',
		envVar: 'COMBO_CODIGOS_ENABLED'
	},
	lo_que_enlaza: {
		label: 'Lo que enlaza acá',
		description:
			'Al pie de cada evento, material, perfil y entrada de la Kinkipedia, la lista de las ' +
			'páginas cuyo texto la enlaza (con [[…]], @ o #). Cada persona ve solo lo que puede ver: ' +
			'nada oculto, «solo con cuenta» o sin aprobar a quien no le corresponde. Apagado, no se ' +
			've nada de esto.',
		tech:
			'docs/enlaces.md («Lo que enlaza acá»). Lee los edges `enlaza` que se guardan al guardar ' +
			'cada cuerpo: lo guardado antes de eso aparece recién cuando se vuelve a guardar (o con ' +
			'scripts/enlaces-backfill.js). Sin migración.',
		envVar: 'LO_QUE_ENLAZA_ENABLED'
	},
	paypal: {
		label: 'PayPal en las propinas',
		description:
			'En construcción. Por ahora prende la parte de PayPal de Ajustes → Propinas: la cotización ' +
			'del dólar con la que se estiman en pesos las propinas en dólares, el ajuste en % de esa ' +
			'cotización, los retiros y el reparto por mes del Fondo, y le pasa a fondo.kinkyvibe.ar ' +
			'lo de PayPal. Todavía no se puede pagar con PayPal. Apagado, nada de esto se ve (la ' +
			'cotización le llega igual a fondo.kinkyvibe.ar).',
		tech:
			'docs/propinas.md («PayPal: cotización, ajuste y retiros»), decisión 0054. Necesita la ' +
			'migración 0071. Apagado, GET /api/fondo/propinas-total no trae `paypal`. ' +
			'GET /api/fondo/cotizacion y el cron diario de la cotización andan igual (no se ven).',
		envVar: 'PAYPAL_ENABLED'
	},
	extras: {
		label: 'Extras en la compra (prototipo)',
		description:
			'Prototipo. En la sección Entradas del editor de eventos aparece «Extras»: cosas que se ' +
			'suman a la compra (tragos, una remera…) con su precio y, si querés, un tope. Quien compra ' +
			'los elige después de las entradas y los paga juntos; el Fondo y los códigos de descuento ' +
			'son solo para las entradas. En la puerta y con un «Link de barra» se entregan de a uno. ' +
			'Apagado, nada de esto se ve ni se cobra.',
		tech:
			'docs/tickets.md («Extras»), decisión 0056. Necesita la migración 0077 (orders.extras_amount, ' +
			'tabla order_extras y door_links.scope). Clave `extras` del evento. Rutas /barra y ' +
			'/barra/<evento>; apagado dan 404.',
		envVar: 'EXTRAS_ENABLED'
	},
	conector_claude: {
		label: 'Conector de Claude (solo lectura)',
		description:
			'Les admins pueden sumar el sitio como conector en claude.ai y pedirle a Claude que busque ' +
			'y lea eventos, material, perfiles y etiquetas, que muestre las ventas de un evento y los ' +
			'próximos eventos. Solo lee: no cambia nada. Cada admin entra con su cuenta y cada pedido ' +
			'queda en Actividad a su nombre. Apagado, el conector no contesta.',
		tech:
			'docs/conector-claude.md. Servidor MCP en /mcp con OAuth propio (/mcp/autorizar, /mcp/token, ' +
			'/mcp/registro y los /.well-known/oauth-*). Sin migraciones. Apagado, todo eso da 404.',
		envVar: 'CONECTOR_CLAUDE_ENABLED'
	},
	conector_claude_edicion: {
		label: 'Conector de Claude: cambios',
		description:
			'Con el conector de Claude prendido, Claude además puede cambiar lo que edita el panel, ' +
			'siempre en dos pasos: primero muestra exactamente qué va a cambiar y después, con el OK, lo ' +
			'guarda como el panel (con historial). Edita eventos, material, perfiles, lugares, etiquetas ' +
			'y la Kinkipedia, crea borradores sin publicar y códigos de descuento, y puede deshacer ' +
			'cualquier cambio (volver a una versión anterior). Nada de plata ni mails: cancelar un ' +
			'evento, las ventas y los reembolsos se hacen desde el panel. Cada cambio ' +
			'queda en Actividad, con quién lo confirmó; si hay muchos en una hora, les admins que lo ' +
			'prendieron en «Mis avisos» reciben un aviso por Telegram. Apagado, Claude solo lee.',
		tech:
			'docs/conector-claude.md («Cambios»). Herramientas vista_previa y aplicar en /mcp; necesita ' +
			'también conector_claude y la migración 0072 (llaves para rutinas y confirmado por). Sin ' +
			'tope: aviso «Cambios de Claude» por Telegram desde 20 cambios en una hora (mcp/avisoCambios.js).',
		envVar: 'CONECTOR_CLAUDE_EDICION_ENABLED'
	},
	gastos_reparto: {
		label: 'Gastos y reparto',
		description:
			'En la ficha de cada evento que vende entradas, Ventas → «Gastos y reparto»: lo que entró ' +
			'(con el Fondo calculado orden por orden), el lugar, las contrataciones, los otros gastos y ' +
			'otros ingresos, y el reparto de la ganancia entre las partes que elijas (la Caja KV, les ' +
			'facilitadores, quien co-produce…), con «quién le pasa a quién». Se guarda en la base y «Cerrar la cuenta» congela los números ' +
			'para Ventas → Cuentas del año. Solo admins. Apagado, no se ve.',
		tech:
			'docs/tickets.md, «Gastos y reparto». Migración 0078 (event_accounts, ' +
			'event_account_closings, venue_cost_rules); cuenta en src/lib/admin/reparto.js. Apagado, ' +
			'/admin/eventos/<slug>/gastos y /admin/ventas/cuentas dan 404.',
		envVar: 'GASTOS_REPARTO_ENABLED'
	},
	fediverso: {
		label: 'Agenda en el fediverso (prototipo)',
		description:
			'Prototipo para mirar: la cuenta agenda@kinkyvibe.ar se puede buscar desde Mastodon y ' +
			'otros servidores del fediverso, y muestra los próximos eventos públicos (lo mismo que el ' +
			'calendario .ics). Solo lectura: nadie la puede seguir todavía y no manda nada. Apagado, ' +
			'esas direcciones dan 404 y la búsqueda del dominio sigue yendo a Bridgy Fed como siempre.',
		tech:
			'docs/investigaciones/indieweb-activitypub.md. /.well-known/webfinger (solo para ' +
			'acct:agenda@kinkyvibe.ar; el resto, a fed.brid.gy), /ap/agenda, /ap/agenda/outbox, ' +
			'/ap/eventos/<evento>; el inbox responde 202 sin procesar nada. Sin claves ni migración. ' +
			'src/lib/utils/activitypub.js.',
		envVar: 'FEDIVERSO_ENABLED'
	},
	carrusel_portada: {
		label: 'Carrusel en la portada',
		description:
			'Arriba de la portada, un carrusel con los próximos eventos de Kinky Vibe y lo nuevo de ' +
			'Material, Amigues y la Kinkipedia (hasta 8, primero los eventos por ' +
			'fecha), con los colores de la marca elegidos para que cada flyer resalte: pasa solo cada unos segundos, se puede pausar ' +
			'y se mueve con las flechas o deslizando en el celu. El estilo se elige en Ajustes › ' +
			'Carrusel de la portada. Sin nada que entre, no aparece. Apagado, la portada se ve como siempre.',
		tech:
			'src/lib/components/Carrousel.svelte, la regla en src/lib/utils/carrusel.js, los estilos en ' +
			'src/lib/utils/carruselEstilos.js y los colores en src/lib/utils/carruselPaletas.js ' +
			'(docs/estilo.md, «Carrusel de la portada»). `?carrousel` lo muestra apagado solo en ' +
			'`npm run dev`. Sin migración.',
		envVar: 'CARRUSEL_PORTADA_ENABLED'
	},
	formularios: {
		label: 'Formularios',
		description:
			'Comunidad › Formularios en el panel: formularios propios en kinkyvibe.ar/formularios/<nombre> ' +
			'y la encuesta de después de cada evento: un día después, les llega a quienes tenían entrada ' +
			'un link personal (anónima por defecto; cada evento la prende o la apaga en su ficha › Mails › ' +
			'Encuesta). Cada formulario elige quién responde, si es con nombre, anónimo o que cada ' +
			'persona elija, y quién ve las respuestas. Prendido, lo encontrás en Comunidad › Formularios, ' +
			'en el buscador (Ctrl K: «formulario», «encuesta», cada plantilla), en «+ Crear» y en la ' +
			'ficha de cada evento (Resumen › Formularios de este evento). Lo que sale por defecto (si la ' +
			'encuesta sale sola, cuántos días después, privacidad, quién ve las respuestas y los mails) ' +
			'se cambia en Comunidad › Formularios › Cómo salen por defecto. Apagado, nada de esto se ve ' +
			'y las páginas públicas dan 404.',
		tech:
			'docs/formularios.md, decisión 0057. Antes de prenderlo: migraciones 0079 (forms, ' +
			'form_responses, form_sends) y 0080 (pronombres, mail editable, borrado suave). La encuesta sale con el cron de cada 15 minutos ' +
			'(src/lib/server/formularios/send.js).',
		envVar: 'FORMULARIOS_ENABLED'
	}
});

/** @typedef {keyof typeof FLAGS} FlagKey */

/** Cuánto se recuerda el valor leído de la base (ms). */
export const FLAG_CACHE_MS = 30_000;

/** @type {Map<string, { value: boolean, expires: number }>} */
const cache = new Map();

/** Sube con cada `clearFlagCache`: una lectura que empezó antes no se guarda. */
let generation = 0;

/** Olvida los valores recordados (al guardar desde el panel, y en los tests). */
export function clearFlagCache() {
	cache.clear();
	generation++;
}

/**
 * Lo que fuerza la variable de entorno: `true`, `false` o `null` (no fuerza nada).
 *
 * @param {string | undefined} raw
 */
export function envOverride(raw) {
	const v = (raw ?? '').trim();
	if (v === '1') return true;
	if (v === '0') return false;
	return null;
}

/**
 * Lee un interruptor de la base (sin caché). Sin base o sin la tabla: apagado.
 *
 * @param {D1Database | null | undefined} db
 * @param {FlagKey} key
 */
export async function readFlag(db, key) {
	if (!db) return false;
	try {
		const row = await db
			.prepare('SELECT enabled FROM feature_flags WHERE key = ?1')
			.bind(key)
			.first();
		return Number(row?.enabled) === 1;
	} catch (error) {
		logDBError(`feature flag ${key}`, error);
		return false;
	}
}

/**
 * Todos los interruptores de la base en una consulta (sin caché). Sin base, sin la tabla o si la
 * lectura falla: todos apagados, como `readFlag`.
 *
 * @param {D1Database} db
 * @returns {Promise<Map<string, boolean>>}
 */
async function readAllFlags(db) {
	/** @type {Map<string, boolean>} */
	const out = new Map();
	try {
		const { results } = await db.prepare('SELECT key, enabled FROM feature_flags').all();
		for (const r of results) out.set(String(r.key), Number(r.enabled) === 1);
	} catch (error) {
		logDBError('feature flags', error);
	}
	return out;
}

/**
 * ¿Está prendido? La variable de entorno manda; si no dice nada, la base (con caché).
 *
 * Cuando hay que ir a la base, se leen y se recuerdan todos los interruptores juntos (una consulta
 * en lugar de una por interruptor): una página consulta varios.
 *
 * @param {D1Database | null | undefined} db
 * @param {FlagKey} key
 * @param {{ now?: number, envValue?: string }} [opts] `envValue` para tests
 */
export async function isFlagOn(db, key, { now = Date.now(), envValue } = {}) {
	const forced = envOverride(envValue ?? env[FLAGS[key].envVar]);
	if (forced !== null) return forced;
	const hit = cache.get(key);
	if (hit && hit.expires > now) return hit.value;
	if (!db) {
		cache.set(key, { value: false, expires: now + FLAG_CACHE_MS });
		return false;
	}
	const all = await readFlagsAndKeep(db, now);
	return all.get(key) ?? false;
}

/**
 * Lee todos los interruptores (una lectura, compartida solo dentro del pedido) y los recuerda para
 * los demás pedidos.
 *
 * @param {D1Database} db
 * @param {number} now
 */
function readFlagsAndKeep(db, now) {
	const gen = generation;
	return readAndKeep(
		db,
		'feature-flags',
		() => readAllFlags(db),
		(read) => {
			if (gen !== generation) return;
			for (const k of Object.keys(FLAGS)) {
				const fresh = cache.get(k);
				if (!fresh || fresh.expires <= now)
					cache.set(k, { value: read.get(k) ?? false, expires: now + FLAG_CACHE_MS });
			}
		}
	);
}

/**
 * Al empezar un pedido que va a esperar a la base de todos modos (src/lib/server/adelantarPedido.js):
 * si algún interruptor que manda la base ya no está recordado, pide la lectura de todos ahora, así
 * sale en esa misma ida y no después (la de `isFlagOn` recibe la misma lectura, compartida dentro
 * del pedido). No cambia qué se lee ni cuánto se recuerda.
 *
 * @param {D1Database | null | undefined} db
 * @param {{ now?: number }} [opts]
 */
export function askFlagsEarly(db, { now = Date.now() } = {}) {
	if (!db) return;
	const stale = /** @type {FlagKey[]} */ (Object.keys(FLAGS)).some((k) => {
		if (envOverride(env[FLAGS[k].envVar]) !== null) return false;
		const hit = cache.get(k);
		return !hit || hit.expires <= now;
	});
	if (stale) readFlagsAndKeep(db, now).catch(() => {});
}

/**
 * Atajo para las rutas: ¿está prendido «Lo que sigo»? (docs/lo-que-sigo.md). Las cuentas del
 * público ya no tienen interruptor: están siempre.
 *
 * @param {App.Platform | undefined} platform
 */
export function loQueSigoEnabled(platform) {
	return isFlagOn(getDB(platform), 'lo_que_sigo');
}

/**
 * Atajo para las rutas: ¿están prendidas las donaciones únicas al Fondo (`/propinas?de=fondo`)?
 * (docs/propinas.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function propinasFondoEnabled(platform) {
	return isFlagOn(getDB(platform), 'propinas_fondo');
}

/**
 * Atajo para las rutas: ¿está prendida la lista de espera de las entradas? (docs/tickets.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function listaEsperaEnabled(platform) {
	return isFlagOn(getDB(platform), 'lista_espera');
}

/**
 * Atajo para las rutas: ¿están prendidos los códigos combo entre eventos? (docs/tickets.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function comboCodigosEnabled(platform) {
	return isFlagOn(getDB(platform), 'combo_codigos');
}

/**
 * Atajo para las rutas: ¿está prendido PayPal en las propinas? (docs/propinas.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function paypalEnabled(platform) {
	return isFlagOn(getDB(platform), 'paypal');
}

/**
 * Atajo para las rutas: ¿están prendidos los extras de la compra? (docs/tickets.md, «Extras»).
 *
 * @param {App.Platform | undefined} platform
 */
export function extrasEnabled(platform) {
	return isFlagOn(getDB(platform), 'extras');
}

/**
 * Atajo para las rutas: ¿está prendido el conector de Claude? (docs/conector-claude.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function conectorClaudeEnabled(platform) {
	return isFlagOn(getDB(platform), 'conector_claude');
}

/**
 * Atajo para las rutas: ¿está prendido Gastos y reparto? (docs/tickets.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function gastosRepartoEnabled(platform) {
	return isFlagOn(getDB(platform), 'gastos_reparto');
}

/**
 * Atajo para las rutas: ¿está prendido el prototipo de la agenda en el fediverso?
 * (docs/investigaciones/indieweb-activitypub.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function fediversoEnabled(platform) {
	return isFlagOn(getDB(platform), 'fediverso');
}

/**
 * Atajo para las rutas: ¿está prendido el carrusel de la portada? (docs/estilo.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function carruselPortadaEnabled(platform) {
	return isFlagOn(getDB(platform), 'carrusel_portada');
}

/**
 * Atajo para las rutas: ¿están prendidos los formularios? (docs/formularios.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function formulariosEnabled(platform) {
	return isFlagOn(getDB(platform), 'formularios');
}

/**
 * Todos los interruptores con su estado, para el panel.
 *
 * @param {D1Database} db
 */
export async function listFlags(db) {
	/** @type {Map<string, { enabled: number, updated_at: number, updated_by: string }>} */
	const rows = new Map();
	try {
		const { results } = await db
			.prepare('SELECT key, enabled, updated_at, updated_by FROM feature_flags')
			.all();
		for (const r of results) rows.set(String(r.key), /** @type {any} */ (r));
	} catch (error) {
		logDBError('list feature flags', error);
	}
	return Object.entries(FLAGS).map(([key, flag]) => {
		const row = rows.get(key);
		const forced = envOverride(env[flag.envVar]);
		return {
			key,
			label: flag.label,
			description: flag.description,
			tech: flag.tech ?? '',
			envVar: flag.envVar,
			enabled: Number(row?.enabled) === 1,
			forced,
			updatedAt: row ? Number(row.updated_at) : null,
			updatedBy: row ? String(row.updated_by) : null
		};
	});
}

/**
 * Prende o apaga un interruptor.
 *
 * @param {D1Database} db
 * @param {FlagKey} key
 * @param {boolean} enabled
 * @param {{ by: string, now?: number }} opts
 */
export async function setFlag(db, key, enabled, { by, now = Date.now() }) {
	if (!Object.hasOwn(FLAGS, key)) throw new RangeError(`Interruptor desconocido: ${key}`);
	await db
		.prepare(
			`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled,
				updated_at = excluded.updated_at, updated_by = excluded.updated_by`
		)
		.bind(key, enabled ? 1 : 0, now, by)
		.run();
	clearFlagCache();
}
