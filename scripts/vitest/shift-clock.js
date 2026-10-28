/**
 * Reloj adelantado para vitest (docs/pruebas-y-ci.md, «Corridas programadas»): con
 * `SHIFT_DAYS=N`, `Date.now()`, `new Date()` y `Date()` sin argumentos dan la hora real más N días.
 * Lo carga vite.config.js como setup solo si `SHIFT_DAYS` está definida; sin la variable no hace
 * nada. Lo usa la corrida semanal (.github/workflows/reloj-adelantado.yml) para encontrar pruebas
 * que dependen de la fecha real antes de que fallen solas en todos los PRs.
 *
 *   SHIFT_DAYS=30 npx vitest run <archivo>
 *
 * Las fechas con argumentos (`new Date('2026-10-01')`, `Date.parse`, `Date.UTC`) no cambian,
 * `vi.spyOn(Date, 'now')` sigue andando, y `vi.useFakeTimers()` sin `setSystemTime` arranca desde
 * la hora real (esas pruebas no se miran con el reloj adelantado). La hora de SQLite
 * (`datetime('now')` en la base de prueba) también sigue siendo la real.
 */
const days = Number(process.env.SHIFT_DAYS || 0);

if (days) {
	const offset = days * 24 * 60 * 60 * 1000;
	const RealDate = globalThis.Date;
	const realNow = RealDate.now.bind(RealDate);
	const now = () => realNow() + offset;
	// `Date.now` como propiedad común (no desde el Proxy): así `vi.spyOn(Date, 'now')` la sigue
	// pudiendo pisar y restaurar.
	RealDate.now = now;
	globalThis.Date = new Proxy(RealDate, {
		construct(target, args, newTarget) {
			return Reflect.construct(target, args.length ? args : [now()], newTarget);
		},
		apply() {
			return new RealDate(now()).toString();
		}
	});
}
