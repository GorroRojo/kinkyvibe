<!--
	Qué pasa con el nombre viejo al renombrar una etiqueta. Lo usan Etiquetas (Renombrar) y
	Eventos → Series (Editar), así la elección y el valor por defecto son los mismos.
	- Con las etiquetas en la base (`dbMode`, hoy siempre): dos opciones. Por defecto (decisión de gorrite)
	  se renombra en todas las publicaciones y el nombre viejo NO queda como alias; la otra deja el
	  alias y no toca ninguna publicación.
	- Con el archivo: las publicaciones se renombran siempre; el alias es opcional.
	`keepAlias` es lo que va en la operación `rename` (src/lib/utils/tagConfig.js). Con `name`, el
	valor también va en el formulario (`1` deja el alias).
-->
<script>
	export let dbMode = false;
	export let keepAlias = false;
	/** Nombre del campo del formulario ('' = no va en el formulario). */
	export let name = '';
	export let idPrefix = 'renombrar';
	/** Cuántas publicaciones usan el nombre ahora (en este deploy), si se sabe. */
	export let uses = /** @type {number | null} */ (null);
	$: choice = keepAlias ? 'alias' : 'posts';
	/** @param {string} v */
	const pick = (v) => (keepAlias = v === 'alias');
	$: usesText =
		uses === null ? '' : uses === 1 ? ' (hoy la usa 1 publicación)' : ` (hoy la usan ${uses})`;
</script>

{#if dbMode}
	<fieldset class="choice">
		<legend>¿Y el nombre viejo?</legend>
		<label class="option" class:chosen={choice === 'posts'}>
			<input
				type="radio"
				name={name || `${idPrefix}-alias`}
				value="0"
				id="{idPrefix}-posts"
				checked={choice === 'posts'}
				on:change={() => pick('posts')}
			/>
			<span>
				<strong>Renombrar en todas las publicaciones</strong>
				<small
					>Se cambia en cada publicación que la usa{usesText}, con un commit, y el nombre viejo deja
					de existir. Antes de confirmar vas a ver cuántas cambian.</small
				>
			</span>
		</label>
		<label class="option" class:chosen={choice === 'alias'}>
			<input
				type="radio"
				name={name || `${idPrefix}-alias`}
				value="1"
				id="{idPrefix}-alias"
				checked={choice === 'alias'}
				on:change={() => pick('alias')}
			/>
			<span>
				<strong>Dejar el nombre viejo como alias</strong>
				<small
					>No se toca ninguna publicación: las que usan el nombre viejo lo siguen usando y los links
					viejos andan.</small
				>
			</span>
		</label>
	</fieldset>
{:else}
	<label class="check"
		><input type="checkbox" bind:checked={keepAlias} name={name || undefined} value="1" /> El nombre viejo
		queda como alias (los links viejos siguen andando)</label
	>
{/if}

<style lang="scss">
	.choice {
		border: 0;
		margin: 0.3em 0;
		padding: 0.6em 0.8em;
		border-radius: var(--radius-m);
		background: var(--surface-2, #f3eef6);
		display: flex;
		flex-direction: column;
		gap: 0.4em;
		min-width: 0;
	}
	legend {
		float: left;
		width: 100%;
		padding: 0;
		font-weight: bold;
		margin-bottom: 0.2em;
	}
	.option {
		display: flex;
		gap: 0.6em;
		align-items: flex-start;
		padding: 0.4em 0.6em;
		border-radius: var(--radius-s);
		background: var(--surface, white);
		cursor: pointer;
		outline: 2px solid transparent;
		&.chosen {
			outline-color: var(--1, #7b3fa0);
		}
		input {
			margin-top: 0.25em;
			flex: none;
		}
		span {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		small {
			font-size: var(--step--1);
			opacity: 0.85;
		}
	}
	.check {
		display: flex;
		gap: 0.5em;
		align-items: flex-start;
	}
</style>
