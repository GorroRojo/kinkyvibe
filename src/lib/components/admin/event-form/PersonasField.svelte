<script>
	/**
	 * «Personas»: quiénes organizan (o escriben) y quiénes participan con otro rol, en una sola
	 * lista (pedido de gorrite: antes eran «Organizan» y «Personas»). Un buscador como el de
	 * «Organizan» (fichas de amigues, perfiles de la base o un nombre libre → «Agregar») y cada
	 * persona en una fila con su rol, para subir, bajar o sacar.
	 *
	 * Lo que se guarda lo arma quien lo usa con `formPersonasChanges` ($lib/utils/personasPicker.js):
	 * en los .md, `authors:` y `personas:` como siempre; en la base, una sola lista
	 * ($lib/utils/personasList.js).
	 *
	 * Props:
	 * - `items` (bind): `{ profile?, name?, role }[]`.
	 * - `roles` (bind): los roles que se pueden elegir. Con uno solo (sin base: solo quienes
	 *   organizan o escriben) no hay selector de rol.
	 * - `defaultRole`: el de quien se suma (Organiza en eventos, Autore en material); también es el
	 *   rol que va a `authors:`.
	 * - `category`: la de la publicación.
	 * - `profiles`, `authorUsage`: fichas de amigues y nombres usados (los de «Organizan»).
	 * - `dbProfiles`: perfiles públicos y aprobados de la base (con el interruptor).
	 * - `addRoleAction`: la acción que crea un rol (la de Eventos › Roles y preguntas, la misma
	 *   validación y el mismo registro); con ella, el selector termina en «+ Nuevo rol…». Vacía, no.
	 * - `id`, `describedby`: los del buscador; `idPrefix`: el de cada fila.
	 * - `errors`: los problemas para mostrar.
	 */
	import { tick } from 'svelte';
	import { deserialize } from '$app/forms';
	import ChipCombobox from '$lib/components/admin/ChipCombobox.svelte';
	import { normalizeText } from '$lib/utils/adminTags.js';
	import { organizerValue, searchOrganizers } from '$lib/utils/organizers.js';
	import { MAX_PERSONAS } from '$lib/utils/personas.js';
	import { personaOptions, personaView } from '$lib/utils/personasPicker.js';

	/** @type {import('$lib/utils/personasList.js').PersonaItem[]} */
	export let items = [];
	/** @type {string[]} */
	export let roles = [];
	export let defaultRole = 'Organiza';
	export let category = 'calendario';
	/** @type {import('$lib/utils/organizers.js').Profile[]} */
	export let profiles = [];
	/** @type {import('$lib/utils/personasPicker.js').DbProfile[]} */
	export let dbProfiles = [];
	/** @type {Record<string, number>} */
	export let authorUsage = {};
	export let addRoleAction = '';
	export let id = 'authors-input';
	/** @type {string | undefined} */
	export let describedby = undefined;
	export let idPrefix = 'personas';
	/** @type {string[]} */
	export let errors = [];

	/** El valor de «+ Nuevo rol…» en el selector (no es un rol: no puede tener «:»). */
	const NEW_ROLE = ':nuevo';
	const FREE = 'nombre:';

	const options = personaOptions(profiles, dbProfiles, authorUsage);
	$: dbBySlug = new Map(dbProfiles.map((p) => [p.slug, p]));
	$: withRoles = roles.length > 1;
	$: views = items.map((it) => personaView(it, category, profiles, dbBySlug));
	$: full = items.length >= MAX_PERSONAS;

	let announcement = '';

	/** @param {string} q */
	function search(q) {
		return searchOrganizers(options, q).map((o) => ({
			value: String(options.indexOf(o)),
			label: o.label,
			thumb: o.thumb,
			detail: [o.detail, o.count ? `${o.count} publicaciones` : ''].filter(Boolean).join(' · ')
		}));
	}

	/**
	 * «Agregar «nombre»» cuando lo escrito no es una de las sugerencias.
	 * @param {string} q
	 * @param {string[]} _values
	 * @param {Array<{ value: string }>} found
	 */
	function extra(q, _values, found) {
		const value = organizerValue(profiles, q);
		if (!value) return null;
		const k = normalizeText(value);
		const taken = found.some((f) => {
			const o = options[Number(f.value)];
			return o && normalizeText(o.name ?? o.label) === k;
		});
		if (taken) return null;
		return {
			value: FREE + value,
			label: `Agregar «${value}»`,
			detail: 'Sin perfil: se muestra solo el nombre (le podés vincular un perfil después).',
			create: true
		};
	}

	/**
	 * Suma a la lista lo elegido en el buscador, con el rol por defecto.
	 * @param {string[]} values
	 * @param {string} value
	 */
	function add(values, value) {
		if (full) return values;
		/** @type {import('$lib/utils/personasList.js').PersonaItem | null} */
		let item = null;
		if (value.startsWith(FREE)) {
			const name = value.slice(FREE.length);
			const withProfile = options.find((o) => o.name === name && o.profile);
			item = { name, role: defaultRole, ...(withProfile ? { profile: withProfile.profile } : {}) };
		} else {
			const o = options[Number(value)];
			if (o) {
				item = { role: defaultRole };
				if (o.name !== undefined) item.name = o.name;
				if (o.profile) item.profile = o.profile;
			}
		}
		if (item) {
			items = [...items, item];
			announcement = `Agregade: ${personaView(item, category, profiles, dbBySlug).label}, ${defaultRole}`;
		}
		// La lista de chips del buscador queda vacía: las personas se muestran abajo, con su rol.
		return values;
	}

	/** @param {number} i */
	function remove(i) {
		const gone = views[i]?.label ?? '';
		items = items.filter((_, j) => j !== i);
		if (newRoleRow === i) newRoleRow = -1;
		announcement = `Sacade: ${gone}`;
	}

	/** @param {number} i @param {-1 | 1} d */
	function move(i, d) {
		const j = i + d;
		if (j < 0 || j >= items.length) return;
		const next = [...items];
		[next[i], next[j]] = [next[j], next[i]];
		items = next;
		newRoleRow = -1;
	}

	/* ---------- rol (y «+ Nuevo rol…») ---------- */
	let newRoleRow = -1;
	let newRoleName = '';
	let newRoleError = '';
	let creating = false;

	/**
	 * @param {number} i
	 * @param {Event & { currentTarget: HTMLSelectElement }} e
	 */
	async function onRole(i, e) {
		const value = e.currentTarget.value;
		if (value === NEW_ROLE) {
			e.currentTarget.value = items[i].role;
			newRoleRow = i;
			newRoleName = '';
			newRoleError = '';
			await tick();
			document.getElementById(`${idPrefix}-nuevo-rol`)?.focus();
			return;
		}
		items[i] = { ...items[i], role: value };
		items = items;
	}

	function cancelNewRole() {
		const i = newRoleRow;
		newRoleRow = -1;
		newRoleError = '';
		tick().then(() => document.getElementById(`${idPrefix}-rol-${i}`)?.focus());
	}

	/** Crea el rol con la acción de Eventos › Roles y preguntas y se lo pone a esa persona. */
	async function createRole() {
		const i = newRoleRow;
		if (creating || i < 0) return;
		if (!newRoleName.trim()) {
			newRoleError = 'Escribí el nombre del rol.';
			return;
		}
		creating = true;
		newRoleError = '';
		try {
			const body = new FormData();
			body.set('name', newRoleName);
			const response = await fetch(addRoleAction, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await response.text());
			const role = result?.data?.role;
			if (result.type === 'success' && role?.ok && typeof role.name === 'string') {
				if (!roles.includes(role.name)) roles = [...roles, role.name];
				items[i] = { ...items[i], role: role.name };
				items = items;
				newRoleRow = -1;
				announcement = `Rol «${role.name}» creado y elegido para ${views[i]?.label ?? 'esa persona'}.`;
				await tick();
				document.getElementById(`${idPrefix}-rol-${i}`)?.focus();
			} else {
				newRoleError =
					role?.message ??
					(result.type === 'redirect'
						? 'Se cerró tu sesión: volvé a entrar y probá de nuevo.'
						: 'No se pudo crear el rol. Probá de nuevo.');
			}
		} catch {
			newRoleError = 'No se pudo crear el rol. Revisá la conexión y probá de nuevo.';
		} finally {
			creating = false;
		}
	}

	/** @param {KeyboardEvent} e */
	function onNewRoleKey(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			createRole();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelNewRole();
		}
	}
</script>

<div class="personas-field">
	{#if items.length}
		<ol class="people" class:no-roles={!withRoles} aria-label="Personas">
			{#each items as it, i (i)}
				{@const v = views[i]}
				<li class="person">
					<span class="who" class:unknown={!v.linked} title={v.title}>
						{#if v.thumb}<img src={v.thumb} alt="" class="avatar" />{/if}
						<span class="name">{v.label}</span>
					</span>
					{#if withRoles}
						<label class="role">
							<span class="sr-only">Rol de {v.label}</span>
							<select id="{idPrefix}-rol-{i}" value={it.role} on:change={(e) => onRole(i, e)}>
								{#if it.role && !roles.includes(it.role)}
									<option value={it.role}>{it.role} (ya no está en la lista)</option>
								{/if}
								{#each roles as r (r)}<option value={r}>{r}</option>{/each}
								{#if addRoleAction}<option value={NEW_ROLE}>+ Nuevo rol…</option>{/if}
							</select>
						</label>
					{/if}
					<span class="row-actions">
						<button
							type="button"
							class="button secondary mini"
							aria-label="Subir a {v.label}"
							disabled={i === 0}
							on:click={() => move(i, -1)}>↑</button
						>
						<button
							type="button"
							class="button secondary mini"
							aria-label="Bajar a {v.label}"
							disabled={i === items.length - 1}
							on:click={() => move(i, 1)}>↓</button
						>
						<button
							type="button"
							class="button secondary mini"
							aria-label="Sacar a {v.label}"
							on:click={() => remove(i)}>Sacar</button
						>
					</span>
					{#if newRoleRow === i}
						<div class="new-role">
							<label for="{idPrefix}-nuevo-rol">Nuevo rol para {v.label}</label>
							<div class="new-role-row">
								<input
									id="{idPrefix}-nuevo-rol"
									type="text"
									maxlength="40"
									autocomplete="off"
									placeholder="Ej.: Cuida la puerta"
									aria-describedby="{idPrefix}-nuevo-rol-help"
									aria-invalid={newRoleError ? 'true' : undefined}
									bind:value={newRoleName}
									on:keydown={onNewRoleKey}
								/>
								<button
									type="button"
									class="button mini"
									disabled={creating}
									aria-busy={creating ? 'true' : undefined}
									on:click={createRole}>{creating ? 'Creando…' : 'Crear rol'}</button
								>
								<button type="button" class="button secondary mini" on:click={cancelNewRole}
									>Cancelar</button
								>
							</div>
							<small id="{idPrefix}-nuevo-rol-help"
								>Queda en la lista de roles para todas las publicaciones (Eventos › Roles y
								preguntas).</small
							>
							{#if newRoleError}<p class="error" role="alert">{newRoleError}</p>{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{:else}
		<p class="hint">Todavía no hay nadie. Buscá en amigues o escribí un nombre.</p>
	{/if}

	{#if full}
		<p class="hint">Llegaste al máximo de {MAX_PERSONAS} personas.</p>
	{:else}
		<ChipCombobox
			values={[]}
			{id}
			{describedby}
			placeholder="Buscá en amigues o escribí un nombre"
			{search}
			{extra}
			{add}
		/>
	{/if}
	<p class="sr-only" aria-live="polite">{announcement}</p>
	{#each errors as e (e)}<p class="error" role="alert">{e}</p>{/each}
</div>

<style>
	.personas-field {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		min-width: 0;
	}
	.people {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45em;
	}
	.person {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(8rem, 12rem) auto;
		gap: 0.5em;
		align-items: center;
	}
	.no-roles .person {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	.who {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		min-width: 0;
		padding: 0.2em 0.8em 0.2em 0.3em;
		border-radius: 2em;
		background: var(--1, #7a2a5a);
		color: white;
		font-size: var(--step--1, 0.9em);
		justify-self: start;
		max-width: 100%;
	}
	.who.unknown {
		background: var(--surface, white);
		color: var(--1-dark, #4a1036);
		outline: 2px dashed var(--1-light, #c9a);
		outline-offset: -2px;
	}
	.who:not(:has(.avatar)) {
		padding-left: 0.8em;
	}
	.name {
		overflow-wrap: anywhere;
	}
	.avatar {
		width: 1.6em;
		height: 1.6em;
		border-radius: 50%;
		object-fit: cover;
		flex: none;
		background: var(--surface-2, #f3eef6);
	}
	.role select {
		width: 100%;
		min-width: 0;
	}
	.row-actions {
		display: flex;
		gap: 0.3em;
	}
	.mini {
		padding: 0.35em 0.7em;
		font-size: 0.9em;
	}
	.new-role {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		padding: 0.5em 0.6em;
		border-radius: var(--radius-s);
		background: var(--surface-2, #f3eef6);
	}
	.new-role label {
		font-size: 0.85em;
		font-weight: bold;
	}
	.new-role-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
	}
	.new-role-row input {
		flex: 1 1 12rem;
		min-width: 0;
	}
	.hint {
		margin: 0;
		font-size: 0.9em;
		opacity: 0.8;
	}
	.error {
		margin: 0;
		color: var(--error, #b00020);
		font-weight: bold;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		margin: -1px;
	}
	@media (max-width: 600px) {
		.person {
			grid-template-columns: minmax(0, 1fr) auto;
			padding-bottom: 0.45em;
			border-bottom: 1px solid var(--line, #ddd);
		}
		.role {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
