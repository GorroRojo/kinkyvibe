<script>
	/**
	 * Lista vacía, con un emoji, un título y un texto. Slot default: acciones (botones).
	 * Props: `emoji` (default '🌱'), `title`, `text`.
	 */
	export let emoji = '🌱';
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let text = '';
</script>

<div class="empty">
	<span class="emoji" aria-hidden="true">{emoji}</span>
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
	.emoji {
		font-size: 2rem;
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
