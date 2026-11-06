/**
 * Cuentas de las propinas con PayPal que comparten el servidor y el panel (docs/propinas.md,
 * «PayPal: cotización, ajuste y retiros», decisión 0054). Sin imports: lo usa también el cron.
 *
 * Un pago de PayPal entra en dólares. Lo que cuenta es lo **neto** (lo que queda después de la
 * comisión de PayPal), pasado a pesos con la cotización **base** del día del pago (dólar MEP
 * «compra», que guarda el cron en `mep_rates`) y el **ajuste** en % que fija gorrite en el panel,
 * redondeado para abajo a pesos enteros:
 *
 *     pesos = floor(neto_usd × base × (1 + ajuste / 100))
 *
 * El ajuste se aplica al leer: cambiarlo cambia todas las estimaciones, también las de meses
 * pasados. La base de cada pago no cambia nunca. Son **estimaciones**: los pesos de verdad son los
 * de cada retiro.
 */

/** El ajuste más bajo y más alto que se acepta (en %). */
export const ADJUSTMENT_MIN = -50;
export const ADJUSTMENT_MAX = 50;

/**
 * El ajuste escrito en el panel (`-4`, `-3,5`, `+2.25`, `-4 %`) como número, con hasta 2
 * decimales y entre {@link ADJUSTMENT_MIN} y {@link ADJUSTMENT_MAX}. Vacío = 0. Otra cosa: `null`.
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseAdjustmentPct(raw) {
	if (raw === null || raw === undefined) return 0;
	const s = String(raw).trim().replace(/\s*%$/, '').replace('−', '-').replace(',', '.');
	if (s === '') return 0;
	if (!/^[+-]?\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
	const n = Number(s);
	if (!Number.isFinite(n) || n < ADJUSTMENT_MIN || n > ADJUSTMENT_MAX) return null;
	// `-0` se guarda y se muestra como 0.
	return n === 0 ? 0 : n;
}

/**
 * La cotización efectiva: base × (1 + ajuste / 100), con 2 decimales (para mostrar; las cuentas
 * de pesos usan {@link estimateArs}, que no redondea en el medio).
 *
 * @param {number} base
 * @param {number} adjustmentPct
 */
export function effectiveRate(base, adjustmentPct) {
	return Math.round(base * (100 + adjustmentPct)) / 100;
}

/**
 * Pesos estimados de un pago: floor(neto × base × (1 + ajuste / 100)), en enteros exactos (sin
 * errores de coma flotante: 10 USD × 1200 × 0,96 da 11.520, no 11.519). La base se toma con 2
 * decimales y el ajuste también. Con datos que no sirven (negativos, no finitos): 0.
 *
 * @param {number} usdNetCents lo neto del pago, en centavos de dólar
 * @param {number} base la cotización base del día del pago (pesos por dólar)
 * @param {number} adjustmentPct el ajuste en % (p. ej. -4)
 * @returns {number} pesos enteros
 */
export function estimateArs(usdNetCents, base, adjustmentPct) {
	if (
		!Number.isFinite(usdNetCents) ||
		!Number.isFinite(base) ||
		!Number.isFinite(adjustmentPct) ||
		usdNetCents <= 0 ||
		base <= 0
	) {
		return 0;
	}
	const cents = BigInt(Math.round(usdNetCents));
	const baseCents = BigInt(Math.round(base * 100));
	const factor = BigInt(10_000 + Math.round(adjustmentPct * 100)); // en diezmilésimos
	if (factor <= 0n) return 0;
	// centavos de dólar × centavos de peso × diezmilésimos → pesos: / (100 × 100 × 10.000).
	return Number((cents * baseCents * factor) / 100_000_000n);
}

/**
 * Pesos → centavos de dólar para cobrar (propinas y entradas con PayPal, docs/paypal.md): `ceil(pesos / (base × (1 + ajuste / 100)))`, en enteros
 * exactos. Redondea para arriba: con el ajuste de gorrite (que estima lo que se pierde al
 * convertir), lo que llega en pesos alcanza el precio. Con datos que no sirven: `null`.
 *
 * @param {number} ars pesos enteros
 * @param {number} base cotización base (pesos por dólar)
 * @param {number} adjustmentPct ajuste en %
 */
export function usdCentsForArs(ars, base, adjustmentPct) {
	if (
		!Number.isSafeInteger(ars) ||
		ars <= 0 ||
		!Number.isFinite(base) ||
		base <= 0 ||
		!Number.isFinite(adjustmentPct)
	) {
		return null;
	}
	const baseCents = BigInt(Math.round(base * 100));
	const factor = BigInt(10_000 + Math.round(adjustmentPct * 100));
	if (factor <= 0n || baseCents <= 0n) return null;
	// pesos × 100 (centavos de peso) × 100 (centavos de dólar) × 10.000 (factor) / (base en
	// centavos × factor).
	const num = BigInt(ars) * 100n * 100n * 10_000n;
	const den = baseCents * factor;
	return Number((num + den - 1n) / den);
}

/**
 * La comisión de PayPal por defecto: 5,4 % + US$ 0,30 por pago, la de «recibir pagos de ventas
 * internacionales» de una cuenta de Argentina (paypal.com/ar/webapps/mpp/merchant-fees, revisar
 * antes de cobrar de verdad: A CONFIRMAR). Se cambia en Ajustes › PayPal.
 */
export const PAYPAL_FEE_DEFAULT = Object.freeze({ basisPoints: 540, fixedCents: 30 });

/**
 * @typedef {{ base: number, adjustmentPct: number, feeBasisPoints: number, fixedCents: number }} PaypalFee
 * La cotización con la que se cobra y la comisión de PayPal (en centésimos de % y centavos de
 * dólar): lo que necesita {@link paypalSurcharge}.
 */

/**
 * El recargo de PayPal en pesos (como el de Mercado Pago, `mpSurcharge`): lo que hay que sumarle a
 * `ars` para que, cobrado en dólares con {@link usdCentsForArs} y descontada la comisión de PayPal
 * (porcentaje + fijo), quede al menos `ars`:
 *
 *     total = ceil((ars + fijo_en_pesos) / (1 − porcentaje)),  recargo = total − ars
 *
 * con el fijo pasado a pesos con la misma cotización. En enteros exactos. Sin comisión o con datos
 * que no sirven: 0.
 *
 * @param {number} ars pesos enteros
 * @param {PaypalFee} fee
 */
export function paypalSurcharge(ars, fee) {
	const bp = Math.round(Number(fee?.feeBasisPoints));
	const fixed = Math.round(Number(fee?.fixedCents));
	if (!(ars > 0) || !Number.isSafeInteger(ars) || !(fee?.base > 0)) return 0;
	if (!(bp >= 0) || bp >= 5000 || !(fixed >= 0) || (bp === 0 && fixed === 0)) return 0;
	const baseCents = BigInt(Math.round(fee.base * 100));
	const factor = BigInt(10_000 + Math.round((fee.adjustmentPct || 0) * 100));
	if (factor <= 0n) return 0;
	// En pesos × 10^8: el fijo es centavos de dólar × centavos de peso × diezmilésimos.
	const D = 100_000_000n;
	const num = (BigInt(ars) * D + BigInt(fixed) * baseCents * factor) * 10_000n;
	const den = D * BigInt(10_000 - bp);
	const total = (num + den - 1n) / den;
	return Number(total) - ars;
}

/**
 * Lo que se cobra en PayPal por `ars` pesos, con el recargo de la comisión: los pesos más
 * {@link paypalSurcharge}, pasados a dólares con {@link usdCentsForArs}. Lo usan las propinas (en
 * el servidor y en el formulario); las entradas guardan el recargo aparte y hacen la misma cuenta.
 *
 * @param {number} ars pesos enteros (sin el recargo)
 * @param {PaypalFee} fee
 * @returns {{ surcharge: number, usdCents: number | null }}
 */
export function paypalCharge(ars, fee) {
	const surcharge = paypalSurcharge(ars, fee);
	return { surcharge, usdCents: usdCentsForArs(ars + surcharge, fee?.base, fee?.adjustmentPct) };
}

/**
 * La comisión de Ajustes › PayPal escrita como texto: porcentaje (`5,4`) y fijo en dólares
 * (`0,30`). Vacío = el de {@link PAYPAL_FEE_DEFAULT}. Otra cosa: `null`.
 *
 * @param {unknown} pctRaw
 * @param {unknown} fixedRaw
 * @returns {{ basisPoints: number, fixedCents: number } | null}
 */
export function parsePaypalFee(pctRaw, fixedRaw) {
	const pct = String(pctRaw ?? '')
		.trim()
		.replace(/\s*%$/, '')
		.replace(',', '.');
	const fixed = String(fixedRaw ?? '')
		.trim()
		.replace(/^(US\$|USD|\$)\s*/i, '')
		.replace(',', '.');
	const basisPoints = pct === '' ? PAYPAL_FEE_DEFAULT.basisPoints : Math.round(Number(pct) * 100);
	const fixedCents = fixed === '' ? PAYPAL_FEE_DEFAULT.fixedCents : Math.round(Number(fixed) * 100);
	if (pct !== '' && !/^\d{1,2}(\.\d{1,2})?$/.test(pct)) return null;
	if (fixed !== '' && !/^\d{1,2}(\.\d{1,2})?$/.test(fixed)) return null;
	if (basisPoints >= 5000 || fixedCents > 1000) return null;
	return { basisPoints, fixedCents };
}

/**
 * Dólares (desde centavos) para mostrar: `US$ 12,34`.
 *
 * @param {number} cents
 */
export function formatUSD(cents) {
	return new Intl.NumberFormat('es-AR', {
		style: 'currency',
		currency: 'USD',
		currencyDisplay: 'code',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})
		.format(cents / 100)
		.replace('USD', 'US$');
}

/**
 * Una cotización para mostrar: `$ 1.567,40`.
 *
 * @param {number} rate
 */
export function formatRate(rate) {
	return new Intl.NumberFormat('es-AR', {
		style: 'currency',
		currency: 'ARS',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(rate);
}

/**
 * Dólares escritos en el panel (`120`, `120,50`, `1.234,56`, `US$ 99.9`) en centavos, o `null`.
 * Hasta 1.000.000 de dólares.
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseUsdCents(raw) {
	let s = String(raw ?? '')
		.trim()
		.replace(/^(US\$|USD|\$)\s*/i, '');
	if (!s) return null;
	// Con coma decimal (es-AR), los puntos son de miles.
	if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
	if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
	const cents = Math.round(Number(s) * 100);
	return cents > 0 && cents <= 100_000_000 ? cents : null;
}

/**
 * Pesos enteros escritos en el panel (`150000`, `150.000`, `$ 150.000`), o `null`. Hasta mil
 * millones.
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseArsInt(raw) {
	const s = String(raw ?? '')
		.trim()
		.replace(/^\$\s*/, '')
		.replace(/\.(?=\d{3}(\D|$))/g, '');
	if (!/^\d{1,10}$/.test(s)) return null;
	const n = Number(s);
	return n > 0 && n <= 1_000_000_000 ? n : null;
}

/**
 * Un día `AAAA-MM-DD` para mostrar: `2/11/2026`. Otra forma: tal cual.
 *
 * @param {string} day
 */
export function dayLabel(day) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : day;
}

/**
 * Los días que abarca un mes Fondo (`AAAA-MM`, del 5 al 4 del mes siguiente): `5/10 al 4/11`.
 *
 * @param {string} month
 */
export function fondoMonthSpan(month) {
	const m = /^(\d{4})-(\d{2})$/.exec(month);
	if (!m) return month;
	const n = Number(m[2]);
	return `5/${n} al 4/${n === 12 ? 1 : n + 1}`;
}
