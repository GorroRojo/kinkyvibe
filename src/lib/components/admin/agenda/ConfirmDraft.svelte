<script>
	/**
	 * «Confirmar» un borrador (no listado): en dos pasos. Primero el botón; al tocarlo se ve qué le
	 * falta (ver eventMissing.js) y se confirma igual o se cancela. Confirmar lo pasa a publicado:
	 * aparece en el calendario y en las listas.
	 * Props: `missing` (MissingItem[]), `busy` (guardando), `submit` (el botón final es de tipo
	 * submit, para usarlo dentro de un <form>; si no, manda el evento `confirm`), `editHref` (link
	 * al editor, para completar lo que falta).
	 */
	import { createEventDispatcher } from 'svelte';
	import { BadgeCheck, Pencil } from '@lucide/svelte';

	/** @type {import('$lib/utils/eventMissing.js').MissingItem[]} */
	export let missing = [];
	export let busy = false;
	export let submit = false;
	export let editHref = '';

	const dispatch = createEventDispatcher();
	let asking = false;
</script>

<div class="confirm-draft">
	{#if !asking}
		<p class="lead">
			<b>Borrador a confirmar:</b> no aparece en el calendario ni en las listas{missing.length
				? `; le falta ${missing.length === 1 ? '1 cosa' : `${missing.length} cosas`}`
				: ''}.
		</p>
		<button class="kv-btn" type="button" disabled={busy} on:click={() => (asking = true)}
			><BadgeCheck size={16} aria-hidden="true" /> Confirmar</button
		>
	{:else}
		<p class="lead" role="status">
			Va a aparecer en el calendario y en las listas.
			{#if missing.length}Todavía le falta:{:else}Tiene todo lo principal.{/if}
		</p>
		{#if missing.length}
			<ul class="missing">
				{#each missing as m (m.id)}
					<li><b>{m.label}</b> <span class="muted">{m.detail}</span></li>
				{/each}
			</ul>
		{/if}
		<div class="btns">
			{#if submit}
				<button class="kv-btn" type="submit" disabled={busy}
					><BadgeCheck size={16} aria-hidden="true" />
					{missing.length ? 'Confirmar igual' : 'Confirmar'}</button
				>
			{:else}
				<button
					class="kv-btn"
					type="button"
					disabled={busy}
					on:click={() => {
						asking = false;
						dispatch('confirm');
					}}
					><BadgeCheck size={16} aria-hidden="true" />
					{missing.length ? 'Confirmar igual' : 'Confirmar'}</button
				>
			{/if}
			{#if editHref && missing.length}
				<a class="kv-btn ghost" href={editHref}
					><Pencil size={16} aria-hidden="true" /> Completarlo</a
				>
			{/if}
			<button class="kv-btn ghost" type="button" disabled={busy} on:click={() => (asking = false)}
				>Cancelar</button
			>
		</div>
	{/if}
</div>

<style>
	.confirm-draft {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		background: var(--warn-bg);
		border-radius: 0.8rem;
		padding: 0.6rem 0.8rem;
	}
	.lead {
		margin: 0;
	}
	.missing {
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.missing .muted {
		font-size: 0.85rem;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
