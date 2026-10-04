<!--
	"¿Esta imagen es para todas las ediciones de este evento o solo para esta?" Shown when an
	event that uses a shared image (src/lib/assets) gets a new one. See $lib/utils/sharedImage.js.
-->
<script>
	/** @type {''|'todas'|'esta'} */
	export let scope = '';
	/** current shared file name (the event's `featured`) */
	export let assetName = '';
	/** name the shared file will have ('' until the image is chosen) */
	export let newName = '';
	/** where "solo esta" saves it, e.g. calendario/media/<slug>/ ('' if not known yet) */
	export let ownFolder = '';
	export let idPrefix = 'img';
	/** show the "pick one" error */
	export let invalid = false;
</script>

<fieldset
	class="scope"
	class:invalid={invalid && !scope}
	aria-describedby={invalid && !scope ? `${idPrefix}-scope-error` : undefined}
>
	<legend>¿Esta imagen es para todas las ediciones de este evento o solo para esta?</legend>
	<label class="kv-choice">
		<input
			type="radio"
			name="{idPrefix}-scope"
			value="todas"
			bind:group={scope}
			id="{idPrefix}-scope-todas"
		/>
		<span>
			<strong>Todas las ediciones</strong>
			<small>
				Reemplaza la imagen compartida <code>{assetName}</code>: cambia en todos los eventos que la
				usan, también los pasados.
				{#if newName && newName !== assetName}
					Como la nueva es <code>.{newName.split('.').pop()}</code>, el archivo pasa a llamarse
					<code>{newName}</code> y esos eventos se actualizan para usarlo.
				{/if}
			</small>
		</span>
	</label>
	<label class="kv-choice">
		<input
			type="radio"
			name="{idPrefix}-scope"
			value="esta"
			bind:group={scope}
			id="{idPrefix}-scope-esta"
		/>
		<span>
			<strong>Solo esta</strong>
			<small>
				Se guarda solo para este evento{#if ownFolder}
					{' '}(en <code>{ownFolder}</code>){/if}. Los otros eventos siguen con la imagen
				compartida.
			</small>
		</span>
	</label>
	{#if invalid && !scope}
		<p class="error" id="{idPrefix}-scope-error">Elegí una de las dos opciones.</p>
	{/if}
</fieldset>

<style lang="scss">
	.scope {
		border: 0;
		margin: 0.3em 0;
		padding: 0.6em 0.8em;
		border-radius: var(--radius-m);
		background: var(--surface-2, #f3eef6);
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		min-width: 0;
		&.invalid {
			outline: 2px solid var(--error);
		}
	}
	legend {
		float: left;
		width: 100%;
		padding: 0;
		font-weight: bold;
		margin-bottom: 0.2em;
	}
	code {
		overflow-wrap: anywhere;
	}
	.error {
		margin: 0;
		color: var(--error);
	}
</style>
