<script>
	/**
	 * Búsqueda y filtros de la lista de perfiles del panel (por GET, en la URL: `?q=`, `?tipo=`,
	 * `?origen=`, `?estado=`; las claves están en src/lib/admin/perfiles.js). Cada `<select>` se
	 * muestra si se le pasan opciones.
	 * Props: `q`; `kind`/`kinds`, `origin`/`origins`, `state`/`states` (valor y opciones
	 * `{ clave: etiqueta }`); `resetHref` ("Ver todos", cuando hay algún filtro puesto).
	 */
	export let q = '';
	export let kind = '';
	/** @type {Readonly<Record<string, string>> | null} */
	export let kinds = null;
	export let origin = '';
	/** @type {Readonly<Record<string, string>> | null} */
	export let origins = null;
	export let state = '';
	/** @type {Readonly<Record<string, string>> | null} */
	export let states = null;
	export let resetHref = '';

	$: selects = [
		{ name: 'tipo', label: 'Tipo', value: kind, options: kinds },
		{ name: 'origen', label: 'Origen', value: origin, options: origins },
		{ name: 'estado', label: 'Estado', value: state, options: states }
	].filter((s) => s.options);
</script>

<form class="filters" method="GET" role="search">
	<label class="kv-field grow">
		<span>Buscar perfil</span>
		<input type="search" name="q" value={q} placeholder="Nombre o dirección" autocomplete="off" />
	</label>
	{#each selects as s (s.name)}
		<label class="kv-field">
			<span>{s.label}</span>
			<select name={s.name} value={s.value}>
				<option value="">Todos</option>
				{#each Object.entries(s.options ?? {}) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>
	{/each}
	<button class="kv-btn" type="submit">Buscar</button>
	{#if resetHref && (q || kind || origin || state)}<a class="kv-btn ghost" href={resetHref}
			>Ver todos</a
		>{/if}
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
