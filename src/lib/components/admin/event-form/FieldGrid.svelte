<script>
	/**
	 * La grilla de campos de «📝 Datos» del editor de publicaciones: un input por campo, según su
	 * tipo (ver `postFields` en `$lib/admin/postFields.js`). Movida tal cual desde PostEditor.
	 *
	 * Props:
	 * - `fields`: los campos, en orden.
	 * - `values` (bind): valor de cada input, por `key` (ids: `<key>-input`).
	 */
	/** @type {import('$lib/admin/postFields.js').Field[]} */
	export let fields = [];
	/** @type {Record<string, any>} */
	export let values = {};
</script>

<div class="grid">
	{#each fields as f}
		{#if f.type === 'checkbox'}
			<label class="check" class:wide={f.wide}>
				<input type="checkbox" id="{f.key}-input" bind:checked={values[f.key]} />
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
						id="{f.key}-input"
						bind:value={values[f.key]}
						rows="3"
						placeholder={f.placeholder}></textarea>
				{:else if f.type === 'select'}
					<select id="{f.key}-input" bind:value={values[f.key]}>
						{#each f.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
					</select>
				{:else if f.type === 'date'}
					<input type="date" id="{f.key}-input" bind:value={values[f.key]} />
				{:else if f.type === 'datetime'}
					<input
						type="datetime-local"
						id="{f.key}-input"
						bind:value={values[f.key]}
						min={f.key === 'end' ? values.start : undefined}
					/>
				{:else if f.type === 'url'}
					<input
						type="url"
						inputmode="url"
						id="{f.key}-input"
						bind:value={values[f.key]}
						placeholder={f.placeholder}
					/>
				{:else if f.type === 'email'}
					<input
						type="email"
						id="{f.key}-input"
						bind:value={values[f.key]}
						placeholder={f.placeholder}
					/>
				{:else if f.type === 'tel'}
					<input
						type="tel"
						id="{f.key}-input"
						bind:value={values[f.key]}
						placeholder={f.placeholder}
					/>
				{:else}
					<input id="{f.key}-input" bind:value={values[f.key]} placeholder={f.placeholder} />
				{/if}
				{#if f.help}<small>{f.help}</small>{/if}
			</label>
		{/if}
	{/each}
</div>

<style>
	.wide {
		grid-column: 1 / -1;
	}
</style>
