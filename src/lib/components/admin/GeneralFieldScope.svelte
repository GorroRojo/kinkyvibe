<script>
	/**
	 * A qué tipos de entrada aplica una pregunta general en ESTE evento (pestaña Preguntas,
	 * formulario `?/setGeneral`): todas o algunas. Manda `scope_<id>` (`all` | `some`) y
	 * `ticket_types_<id>` (los tipos elegidos); el servidor lo valida (validateFieldScope).
	 *
	 * Props: `id` (de la pregunta), `types` (los del evento), `ticketTypes` (lo guardado; `[]` =
	 * todas).
	 */
	/** @type {number} */
	export let id;
	/** @type {{ id: string, name: string }[]} */
	export let types = [];
	/** @type {string[]} */
	export let ticketTypes = [];

	let scope = ticketTypes.length ? 'some' : 'all';
	$: chosen = new Set(ticketTypes.length ? ticketTypes : types.map((t) => t.id));
</script>

<div class="scope">
	<label class="kv-check">
		<input type="radio" name="scope_{id}" value="all" bind:group={scope} />
		<span>Todas las entradas</span>
	</label>
	<label class="kv-check">
		<input type="radio" name="scope_{id}" value="some" bind:group={scope} />
		<span>Solo algunas</span>
	</label>
	{#if scope === 'some'}
		{#each types as t (t.id)}
			<label class="kv-check">
				<input type="checkbox" name="ticket_types_{id}" value={t.id} checked={chosen.has(t.id)} />
				<span>{t.name}</span>
			</label>
		{/each}
	{/if}
</div>

<style>
	.scope {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem var(--space-xs);
		padding: 0.2rem 0 var(--space-2xs) var(--space-m);
		font-size: var(--text-sm);
	}
</style>
