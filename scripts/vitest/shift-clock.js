/**
 * Reloj adelantado para vitest (docs/pruebas-y-ci.md, «Corridas programadas»): con
 * `SHIFT_DAYS=N`, `Date.now()`, `new Date()` y `Date()` sin argumentos dan la hora real más N días.
 * Lo carga vite.config.js como setup solo si `SHIFT_DAYS` está definida; sin la variable no hace
 * nada. Lo usa la corrida semanal (.github/workflows/reloj-adelantado.yml) para encontrar pruebas
 * que dependen de la fecha real antes de que fallen solas en todos los PRs.
 *
 *   SHIFT_DAYS=30 npx vitest run <archivo>
 *
 * Las fechas con argumentos (`new Date('2026-10-01')`, `Date.parse`, `Date.UTC`) no cambian, y
 * `vi.useFakeTimers()` arranca desde la hora adelantada (`setSystemTime` la pisa). La hora de
 * SQLite (`datetime('now')` en la base de prueba) sigue siendo la real.
 */
const days = Number(process.env.SHIFT_DAYS || 0);

if (days) {
	const offset = days * 24 * 60 * 60 * 1000;
	const RealDate = globalThis.Date;
	const now = () => RealDate.now() + offset;
	globalThis.Date = new Proxy(RealDate, {
		construct(target, args, newTarget) {
			return Reflect.construct(target, args.length ? args : [now()], newTarget);
		},
		apply() {
			return new RealDate(now()).toString();
		},
		get(target, prop, receiver) {
			if (prop === 'now') return now;
			return Reflect.get(target, prop, receiver);
		}
	});
}
