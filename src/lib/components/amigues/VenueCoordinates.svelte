<script>
	/**
	 * La ubicación en el mapa de un lugar (latitud y longitud), para el editor del panel y para Mi
	 * rincón (decisión de gorrite: las cuentas también la cargan). Los números se leen con
	 * `parseCoordinate` y los valida el tipo `perfil` (rangos, y que estén las dos): acá solo van
	 * los campos, los errores que vuelven y cómo conseguir los números.
	 *
	 * Props: `lat`, `lng` (texto, se pueden enlazar con bind:), `errors` (por campo), y las clases
	 * de cada página: `gridClass` (lo que envuelve los dos campos), `fieldClass` (cada campo),
	 * `errorClass` (el error de un campo) y `noteClass` (la explicación). `geocoder`: hay un botón
	 * «Buscar en el mapa» (`VenueGeocoder`) al lado; entonces la explicación habla del botón en vez
	 * de mandar a copiar los números de openstreetmap.org.
	 */

	export let lat = '';
	export let lng = '';
	/** @type {Record<string, string | undefined>} */
	export let errors = {};
	export let gridClass = '';
	export let fieldClass = '';
	export let errorClass = 'field-error';
	export let noteClass = 'hint';
	export let geocoder = false;
</script>

<div class={gridClass}>
	<label class={fieldClass}>
		<span>Latitud</span>
		<input
			name="lat"
			type="text"
			inputmode="decimal"
			autocomplete="off"
			maxlength="40"
			bind:value={lat}
			placeholder="Ej.: -34.6037"
			aria-invalid={errors.lat ? 'true' : undefined}
		/>
		{#if errors.lat}<small class={errorClass}>{errors.lat}</small>{/if}
	</label>
	<label class={fieldClass}>
		<span>Longitud</span>
		<input
			name="lng"
			type="text"
			inputmode="decimal"
			autocomplete="off"
			maxlength="40"
			bind:value={lng}
			placeholder="Ej.: -58.3816"
			aria-invalid={errors.lng ? 'true' : undefined}
		/>
		{#if errors.lng}<small class={errorClass}>{errors.lng}</small>{/if}
	</label>
</div>
<p class={noteClass}>
	{#if geocoder}
		Con «Buscar en el mapa» se completan solos; también los podés escribir o corregir a mano. El
		mapa se ve solo si la dirección es pública.
	{:else}
		La ubicación sale de openstreetmap.org: buscá el lugar, clic derecho → «Mostrar dirección» y
		copiá los dos números. El mapa se ve solo si la dirección es pública.
	{/if}
</p>
