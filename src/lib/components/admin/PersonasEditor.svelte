<script>
	/**
	 * "Personas" del editor de publicaciones (eventos, material, wiki): filas de perfil + rol que
	 * se guardan en `personas:` del frontmatter (src/lib/utils/personas.js). Solo ofrece perfiles
	 * públicos y aprobados; uno que ya estaba en el archivo y dejó de serlo se muestra como
	 * «(no público)»: en la página no aparece.
	 *
	 * Props: `personas` (bind; { perfil, rol }[]), `roles` (string[]), `profiles`
	 * ({ slug, title, kind }[]), `errors` (string[]), `idPrefix`.
	 */
	import { MAX_PERSONAS } from '$lib/utils/personas.js';

	/** @type {{ perfil: string, rol: string }[]} */
	export let personas = [];
	/** @type {string[]} */
	export let roles = [];
	/** @type {{ slug: string, title: string, kind: 'persona' | 'grupo' }[]} */
	export let profiles = [];
	/** @type {string[]} */
	export let errors = [];
	export let idPrefix = 'personas';

	$: known = new Set(profiles.map((p) => p.slug));
	$: groups = profiles.filter((p) => p.kind === 'grupo');
	$: people = profiles.filter((p) => p.kind !== 'grupo');

	function add() {
		personas = [...personas, { perfil: '', rol: roles[0] ?? '' }];
	}
	/** @param {number} i */
	function remove(i) {
		personas = personas.filter((_, j) => j !== i);
	}
	/** @param {number} i @param {-1 | 1} d */
	function move(i, d) {
		const j = i + d;
		if (j < 0 || j >= personas.length) return;
		const next = [...personas];
		[next[i], next[j]] = [next[j], next[i]];
		personas = next;
	}
</script>

<div class="personas-editor">
	{#if personas.length === 0}
		<p class="hint">Todavía no hay personas. Sumá quién organiza, facilita, enseña…</p>
	{/if}
	<ol>
		{#each personas as p, i (i)}
			<li>
				<label class="field">
					<span>Perfil</span>
					<select id="{idPrefix}-perfil-{i}" bind:value={p.perfil}>
						<option value="">Elegí un perfil</option>
						{#if p.perfil && !known.has(p.perfil)}
							<option value={p.perfil}>{p.perfil} (no público)</option>
						{/if}
						{#if groups.length}
							<optgroup label="Grupos">
								{#each groups as g (g.slug)}<option value={g.slug}>{g.title}</option>{/each}
							</optgroup>
						{/if}
						{#if people.length}
							<optgroup label="Personas">
								{#each people as g (g.slug)}<option value={g.slug}>{g.title}</option>{/each}
							</optgroup>
						{/if}
					</select>
				</label>
				<label class="field">
					<span>Rol</span>
					<select id="{idPrefix}-rol-{i}" bind:value={p.rol}>
						{#if p.rol && !roles.includes(p.rol)}
							<option value={p.rol}>{p.rol} (ya no está en la lista)</option>
						{/if}
						{#each roles as r (r)}<option value={r}>{r}</option>{/each}
					</select>
				</label>
				<div class="row-actions">
					<button
						type="button"
						class="button secondary mini"
						aria-label="Subir la fila {i + 1}"
						disabled={i === 0}
						on:click={() => move(i, -1)}>↑</button
					>
					<button
						type="button"
						class="button secondary mini"
						aria-label="Bajar la fila {i + 1}"
						disabled={i === personas.length - 1}
						on:click={() => move(i, 1)}>↓</button
					>
					<button
						type="button"
						class="button secondary mini"
						aria-label="Sacar la fila {i + 1}"
						on:click={() => remove(i)}>Sacar</button
					>
				</div>
			</li>
		{/each}
	</ol>
	<button
		type="button"
		class="button secondary"
		on:click={add}
		disabled={personas.length >= MAX_PERSONAS}>+ Sumar persona</button
	>
	{#if !profiles.length}
		<p class="hint">
			No hay perfiles públicos todavía (Cuentas → Perfiles: tienen que estar revisados y visibles
			para todes).
		</p>
	{/if}
	{#each errors as e (e)}<p class="error" role="alert">{e}</p>{/each}
</div>

<style>
	.personas-editor {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		align-items: flex-start;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
		gap: 0.5em;
		align-items: end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.2em;
		min-width: 0;
	}
	.field span {
		font-size: 0.85em;
		font-weight: bold;
	}
	select {
		min-width: 0;
		width: 100%;
	}
	.row-actions {
		display: flex;
		gap: 0.3em;
	}
	.mini {
		padding: 0.35em 0.7em;
		font-size: 0.9em;
	}
	.hint {
		margin: 0;
		font-size: 0.9em;
		opacity: 0.8;
	}
	.error {
		margin: 0;
		color: var(--bad, #b00020);
		font-weight: bold;
	}
	@media (max-width: 600px) {
		li {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			padding-bottom: 0.5em;
			border-bottom: 1px solid var(--line, #ddd);
		}
		.row-actions {
			grid-column: 1 / -1;
		}
	}
</style>
