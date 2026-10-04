<script>
	/**
	 * Avance contra la meta de venta de un evento ($lib/utils/salesGoal.js, `goalProgress`): una
	 * barra (violeta; verde al llegar) y el texto «$ 180.000 de $ 250.000 (72 %)» o «23 de 30
	 * entradas». Pasarse de la meta es bueno: la barra queda llena, sin la marca roja del cupo.
	 *
	 * Props: `progress` (GoalProgress), `compact` (texto chico, para listas), `showText` (false =
	 * solo la barra, con el texto como etiqueta accesible).
	 */
	/** @type {import('$lib/utils/salesGoal.js').GoalProgress} */
	export let progress;
	export let compact = false;
	export let showText = true;

	$: width = Math.min(100, Math.max(0, progress.pct));
	$: label = `Meta: ${progress.text}${progress.reached ? ', cumplida' : ''}`;
</script>

<div class="goal-progress" class:compact>
	<div
		class="bar"
		class:reached={progress.reached}
		role="meter"
		aria-valuemin={0}
		aria-valuemax={progress.target}
		aria-valuenow={progress.current}
		aria-label={label}
		title={label}
	>
		<i style="width:{width}%"></i>
	</div>
	{#if showText}
		<span class="text num"
			>{progress.text}{#if progress.reached}<span class="done"> · meta cumplida</span>{/if}</span
		>
	{/if}
</div>

<style>
	.goal-progress {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
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
		background: var(--2);
	}
	.reached i {
		background: var(--ok, var(--3-dark));
	}
	.text {
		font-size: var(--step--1);
	}
	.compact .text {
		font-size: var(--step--2, 0.8em);
	}
	.done {
		color: var(--ok, var(--3-dark));
		font-weight: 600;
	}
</style>
