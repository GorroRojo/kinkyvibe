<script>
	/**
	 * Búsqueda y filtros de una lista de perfiles del panel (por GET, en la URL: `?q=`, `?filtro=`,
	 * `?tipo=`). Props: `q`, `filter` y `filters` (opcional), `kind` y `kinds`, `resetHref`.
	 */
	export let q = '';
	export let filter = '';
	/** @type {Record<string, string> | null} */
	export let filters = null;
	export let kind = '';
	/** @type {Record<string, string>} */
	export let kinds = {};
	export let resetHref = '';
</script>

<form class="filters" method="GET" role="search">
	<label class="kv-field grow">
		<span>Buscar perfil</span>
		<input type="search" name="q" value={q} placeholder="Nombre o dirección" autocomplete="off" />
	</label>
	{#if filters}
		<label class="kv-field">
			<span>Mostrar</span>
			<select name="filtro" value={filter}>
				<option value="">Todos</option>
				{#each Object.entries(filters) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>
	{/if}
	<label class="kv-field">
		<span>Tipo</span>
		<select name="tipo" value={kind}>
			<option value="">Todos</option>
			{#each Object.entries(kinds) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
	</label>
	<button class="kv-btn" type="submit">Buscar</button>
	{#if resetHref && (q || filter || kind)}<a class="kv-btn ghost" href={resetHref}>Ver todos</a>{/if}
</form>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		align-items: flex-end;
		margin-bottom: 0.6rem;
	}
	.grow {
		flex: 1 1 16rem;
	}
</style>
