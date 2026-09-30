<script>
	/**
	 * Barra de cupo: vendidas (violeta), reservadas (amarillo) y libres.
	 * Props: `sold`, `held` (reservadas esperando el pago, default 0), `capacity` (0 o null = sin
	 * cupo: la barra queda vacía), `label` (opcional: texto accesible; si no, lo arma solo).
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
	$: text =
		label ||
		`${sold} vendidas` +
			(held ? `, ${held} reservadas` : '') +
			(free === null ? ', sin cupo' : `, ${free} libres de ${cap}`);
</script>

<div
	class="bar"
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
		border-radius: 1em;
		overflow: hidden;
		background: var(--bar-track);
		min-width: 3rem;
	}
	i {
		display: block;
	}
	.s {
		background: var(--2);
	}
	.h {
		background: var(--4);
	}
</style>
