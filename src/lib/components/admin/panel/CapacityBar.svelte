<script>
	/**
	 * Barra de cupo: vendidas (violeta), reservadas (amarillo) y libres.
	 * Props: `sold`, `held` (reservadas esperando el pago, default 0), `capacity` (0 o null = sin
	 * cupo: la barra queda vacía), `label` (opcional: texto accesible; si no, lo arma solo).
	 *
	 * Si se vendió más que el cupo (une admin pasó el límite: ver tickets/overrides.js), la barra
	 * queda llena con una marca roja al final y el texto dice "52 / 50, 2 de más".
	 */
	/** @type {number} */
	export let sold = 0;
	/** @type {number} */
	export let held = 0;
	/** @type {number | null} */
	export let capacity = null;
	/** @type {string} */
	export let label = '';

	/** @param {number} n @param {number} cap */
	const pct = (n, cap) => (cap ? Math.min(100, Math.max(0, (n / cap) * 100)) : 0);
	$: cap = capacity && capacity > 0 ? capacity : 0;
	$: soldPct = pct(sold, cap);
	$: heldPct = Math.min(100 - soldPct, pct(held, cap));
	$: free = cap ? Math.max(0, cap - sold - held) : null;
	$: over = cap ? Math.max(0, sold + held - cap) : 0;
	$: text =
		label ||
		`${sold} vendidas` +
			(held ? `, ${held} reservadas` : '') +
			(free === null
				? ', sin cupo'
				: over
					? `, ${sold + held} / ${cap}, ${over} de más`
					: `, ${free} libres de ${cap}`);
</script>

<div
	class="bar"
	class:over={over > 0}
	role="meter"
	aria-valuemin={0}
	aria-valuemax={cap || undefined}
	aria-valuenow={sold}
	aria-label={text}
	title={text}
>
	<i class="s" style="width:{soldPct}%"></i><i class="h" style="width:{heldPct}%"></i>
</div>

<style>
	.bar {
		display: flex;
		height: 0.55rem;
		border-radius: var(--radius-m);
		overflow: hidden;
		background: var(--bar-track);
		min-width: 3rem;
	}
	i {
		display: block;
	}
	/* Pasado del cupo: marca al final (no solo color: también el texto y el borde). */
	.over {
		position: relative;
		outline: 1px solid var(--bad, #c0006a);
	}
	.over::after {
		content: '';
		position: absolute;
		inset: 0 0 0 auto;
		width: 0.45rem;
		background: var(--bad, #c0006a);
	}
	.s {
		background: var(--2);
	}
	.h {
		background: var(--4);
	}
</style>
