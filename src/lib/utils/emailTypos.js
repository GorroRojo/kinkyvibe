/**
 * «¿Quisiste decir …@gmail.com?»: sugerencia para dominios de mail mal escritos (gmai.com,
 * hotmial.com, gmail.con) en los formularios de compra y de la lista de espera. Solo sugiere, en el
 * navegador: no bloquea ni cambia nada si la persona no toca «Sí, corregilo» (docs/tickets.md).
 *
 * Orden: un dominio conocido y válido no se toca nunca; después, un mapa exacto de errores
 * comunes; después, un TLD imposible (.con, .cmo…) pasa a .com; por último, a una sola letra de
 * distancia (o dos letras cambiadas de lugar) de un dominio grande.
 */

/** Los dominios a los que se sugiere ir. */
const POPULAR = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'];

/**
 * Dominios reales que se parecen a los grandes: nunca se sugiere nada para estos (además de
 * {@link POPULAR}).
 */
const VALID = new Set([
	...POPULAR,
	'hotmail.es',
	'hotmail.com.ar',
	'outlook.es',
	'outlook.com.ar',
	'live.com',
	'live.com.ar',
	'live.cl',
	'yahoo.es',
	'yahoo.com.ar',
	'ymail.com',
	'gmx.com',
	'gmx.net',
	'me.com',
	'mac.com',
	'mail.com',
	'email.com',
	'aol.com',
	'msn.com',
	'fibertel.com.ar',
	'proton.me',
	'protonmail.com',
	'googlemail.com'
]);

/** Errores comunes, exactos. */
const TYPOS = /** @type {Record<string, string>} */ ({
	'gmai.com': 'gmail.com',
	'gmal.com': 'gmail.com',
	'gmial.com': 'gmail.com',
	'gmil.com': 'gmail.com',
	'gamil.com': 'gmail.com',
	'gnail.com': 'gmail.com',
	'gmaill.com': 'gmail.com',
	'gmeil.com': 'gmail.com',
	'gemail.com': 'gmail.com',
	'gmail.co': 'gmail.com',
	'gmail.cm': 'gmail.com',
	'gmail.om': 'gmail.com',
	'gmail.comm': 'gmail.com',
	'gmail.com.ar': 'gmail.com',
	'hotmial.com': 'hotmail.com',
	'hotmal.com': 'hotmail.com',
	'hotmai.com': 'hotmail.com',
	'hotamil.com': 'hotmail.com',
	'homail.com': 'hotmail.com',
	'hotmil.com': 'hotmail.com',
	'hotmali.com': 'hotmail.com',
	'hotnail.com': 'hotmail.com',
	'hotmail.co': 'hotmail.com',
	'hotmail.cm': 'hotmail.com',
	'hotmial.com.ar': 'hotmail.com.ar',
	'hotmal.com.ar': 'hotmail.com.ar',
	'outlok.com': 'outlook.com',
	'outloo.com': 'outlook.com',
	'outllok.com': 'outlook.com',
	'otlook.com': 'outlook.com',
	'yaho.com': 'yahoo.com',
	'yahooo.com': 'yahoo.com',
	'yhoo.com': 'yahoo.com',
	'yaho.com.ar': 'yahoo.com.ar',
	'icloud.co': 'icloud.com',
	'iclod.com': 'icloud.com',
	'icoud.com': 'icloud.com'
});

/** TLD que no existen y casi siempre quisieron ser .com. */
const BAD_TLD = /\.(con|cmo|vom|xom|ocm|copm|cpm|comn)$/;

/**
 * Distancia de edición con trasposiciones (Damerau, versión «optimal string alignment»), cortada
 * en `max + 1`.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} max
 */
function distance(a, b, max) {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	/** @type {number[][]} */
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
}

/**
 * El dominio corregido, o `null` si no hay nada que sugerir.
 *
 * @param {string} domain en minúsculas
 * @returns {string | null}
 */
function fixDomain(domain) {
	if (VALID.has(domain)) return null;
	if (TYPOS[domain]) return TYPOS[domain];
	if (BAD_TLD.test(domain)) {
		const fixed = domain.replace(BAD_TLD, '.com');
		return TYPOS[fixed] ?? fixed;
	}
	const near = POPULAR.find((p) => distance(domain, p, 1) <= 1);
	return near ?? null;
}

/**
 * La dirección con el dominio corregido («persona@gmai.com» → «persona@gmail.com»), o `null` si
 * parece bien escrita o no parece un mail. La parte de antes de la arroba queda como está.
 *
 * @param {unknown} email
 * @returns {string | null}
 */
export function suggestEmail(email) {
	if (typeof email !== 'string') return null;
	const trimmed = email.trim();
	const at = trimmed.lastIndexOf('@');
	if (at < 1 || at === trimmed.length - 1) return null;
	const domain = trimmed.slice(at + 1).toLowerCase();
	if (!domain.includes('.') || /\s/.test(domain)) return null;
	const fixed = fixDomain(domain);
	return fixed && fixed !== domain ? `${trimmed.slice(0, at)}@${fixed}` : null;
}
