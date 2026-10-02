<script>
	/**
	 * La grilla de campos de «📝 Datos»: un input por campo, según su tipo (ver `postFields` en
	 * `$lib/admin/postFields.js` y `fieldsFor` en `$lib/utils/contentPosts.js`). La usan
	 * DatosSection (crear y editar eventos, editar publicaciones) y ContentEditor.
	 *
	 * Props:
	 * - `fields`: los campos, en orden.
	 * - `values` (bind): valor de cada input, por `key`.
	 * - `idFor(key)`: el id de cada input (sin pasarlo, `<key>-input`).
	 * - `warnings`: aviso opcional debajo de un campo, por `key`.
	 * - `errors`: error de un campo, por `key`: reemplaza la ayuda y marca el input.
	 * - Slot: más campos al final de la grilla.
	 */
	/** @type {import('$lib/admin/postFields.js').Field[]} */
	export let fields = [];
	/** @type {Record<string, any>} */
	export let values = {};
	/** @type {(key: string) => string} */
	export let idFor = (key) => `${key}-input`;
	/** @type {Record<string, string>} */
	export let warnings = {};
	/** @type {Record<string, string>} */
	export let errors = {};
</script>

<div class="grid">
	{#each fields as f}
		{#if f.type === 'checkbox'}
			<label class="check" class:wide={f.wide}>
				<input type="checkbox" id={idFor(f.key)} bind:checked={values[f.key]} />
				{f.label}
			</label>
		{:else}
			<label class="field" class:wide={f.wide}>
				<span
					>{f.label}
					{#if f.required}<span class="req">*</span>{/if}</span
				>
				{#if f.type === 'textarea'}
					<textarea
						id={idFor(f.key)}
						bind:value={values[f.key]}
						rows="3"
						placeholder={f.placeholder}></textarea>
				{:else if f.type === 'select'}
					<select id={idFor(f.key)} bind:value={values[f.key]}>
						{#each f.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
					</select>
				{:else if f.type === 'date'}
					<input type="date" id={idFor(f.key)} bind:value={values[f.key]} />
				{:else if f.type === 'datetime'}
					<input
						type="datetime-local"
						id={idFor(f.key)}
						bind:value={values[f.key]}
						min={f.key === 'end' ? values.start : undefined}
					/>
				{:else if f.type === 'url'}
					<input
						type="url"
						inputmode="url"
						id={idFor(f.key)}
						bind:value={values[f.key]}
						placeholder={f.placeholder}
						aria-invalid={errors[f.key] ? 'true' : undefined}
					/>
				{:else if f.type === 'email'}
					<input
						type="email"
						id={idFor(f.key)}
						bind:value={values[f.key]}
						placeholder={f.placeholder}
					/>
				{:else if f.type === 'tel'}
					<input
						type="tel"
						id={idFor(f.key)}
						bind:value={values[f.key]}
						placeholder={f.placeholder}
					/>
				{:else}
					<input id={idFor(f.key)} bind:value={values[f.key]} placeholder={f.placeholder} />
				{/if}
				{#if errors[f.key]}<small class="bad">{errors[f.key]}</small>
				{:else if f.help}<small>{f.help}</small>{/if}
				{#if warnings[f.key]}<small class="warning">⚠️ {warnings[f.key]}</small>{/if}
			</label>
		{/if}
	{/each}
	<slot />
</div>

<style>
	.wide,
	.grid > :global(.wide) {
		grid-column: 1 / -1;
	}
	.bad {
		color: var(--bad, #b00020);
	}
</style>
