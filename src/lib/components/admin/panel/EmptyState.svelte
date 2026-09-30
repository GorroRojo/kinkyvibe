<script>
	/**
	 * Lista vacía: un ícono, un título y un texto. Slot default: acciones (botones).
	 * Props: `icon` (componente de Lucide, default Inbox), `title`, `text`,
	 * `emoji` (opcional: si se pasa, se muestra en vez del ícono).
	 */
	import { Inbox } from '@lucide/svelte';
	/** @type {any} */
	export let icon = Inbox;
	/** @type {string} */
	export let emoji = '';
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let text = '';
</script>

<div class="empty">
	<span class="ico" aria-hidden="true"
		>{#if emoji}{emoji}{:else}<svelte:component
				this={icon}
				size={36}
				strokeWidth={1.75}
			/>{/if}</span
	>
	<b>{title}</b>
	{#if text}<p>{text}</p>{/if}
	{#if $$slots.default}<div class="actions"><slot /></div>{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.3rem;
		padding: 1.5rem 1rem;
		color: var(--text);
	}
	.ico {
		font-size: 2rem;
		color: var(--accent);
		display: grid;
		place-items: center;
	}
	p {
		margin: 0;
		color: var(--muted);
		max-width: 30rem;
	}
	.actions {
		margin-top: 0.5rem;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
