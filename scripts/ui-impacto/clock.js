// Reloj corrido para el informe de impacto visual (docs/ui-impacto.md). Se carga con
// `node --import ./scripts/ui-impacto/clock.js` (vía NODE_OPTIONS) en el servidor de desarrollo y
// en el seed de cada lado: si UI_IMPACTO_NOW tiene un instante (ms), `Date` arranca en ese
// instante cuando arranca el proceso y sigue andando. Así la base y el cambio ven el mismo «hoy»
// aunque se saquen las capturas con minutos de diferencia (o a otra hora del día).
//
// Solo lo usa esta herramienta: el sitio, las pruebas y el build nunca lo cargan.
const fixed = Number(process.env.UI_IMPACTO_NOW);

if (Number.isFinite(fixed) && fixed > 0) {
	const RealDate = Date;
	const offset = fixed - RealDate.now();
	const now = () => RealDate.now() + offset;
	globalThis.Date = new Proxy(RealDate, {
		construct(target, args, newTarget) {
			return args.length
				? Reflect.construct(target, args, newTarget)
				: Reflect.construct(target, [now()], newTarget);
		},
		// `Date()` sin `new` devuelve un texto.
		apply() {
			return new RealDate(now()).toString();
		},
		get(target, prop, receiver) {
			if (prop === 'now') return now;
			return Reflect.get(target, prop, receiver);
		}
	});
}
