<script>
	// Botón "Compartir" de un evento, para cualquier persona que quiera difundirlo:
	// - compartir el link con la Web Share API (menú nativo del celu) o copiarlo;
	// - "Compartir como imagen": generador de imágenes del evento (/calendario/<evento>/compartir).
	import { Share2, Link, Image as ImageIcon, Check } from '@lucide/svelte';
	import { fly } from 'svelte/transition';

	/** @type {string} */
	export let url;
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let text = '';
	/** Ruta del generador de imágenes. */
	/** @type {string} */
	export let imagesHref;

	let open = false;
	let copied = false;
	/** @type {HTMLDivElement} */
	let root;

	const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	async function shareLink() {
		if (canShare()) {
			try {
				await navigator.share({ title, text, url });
				open = false;
				return;
			} catch (e) {
				if (/** @type {Error} */ (e)?.name === 'AbortError') return;
				// otro error (p. ej. sin permiso): caemos a copiar el link
			}
		}
		await copyLink();
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url);
		} catch (e) {
			window.prompt('Copiá el link del evento:', url);
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	/** @param {MouseEvent} e */
	function onWindowClick(e) {
		if (open && root && !root.contains(/** @type {Node} */ (e.target))) open = false;
	}
	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (open && e.key === 'Escape') open = false;
	}
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

<div class="share" bind:this={root}>
	<button
		type="button"
		class="trigger"
		on:click={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
	>
		<Share2 size="20" /> Compartir
	</button>
	{#if open}
		<div class="menu" role="menu" transition:fly={{ duration: 150, y: -8 }}>
			<button type="button" role="menuitem" on:click={shareLink}>
				{#if copied}<Check size="18" /> ¡Link copiado!{:else}<Link size="18" />
					{canShare() ? 'Compartir link' : 'Copiar link'}{/if}
			</button>
			<a role="menuitem" href={imagesHref} data-sveltekit-preload-data="off">
				<ImageIcon size="18" /> Compartir como imagen
			</a>
		</div>
	{/if}
</div>

<style lang="scss">
	.share {
		position: relative;
		display: inline-block;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.45em;
		font: inherit;
		font-weight: bold;
		/* botón secundario: píldora con borde y texto rosa (como .pill-btn.ghost) */
		color: var(--1);
		background: var(--surface);
		border: 2px solid var(--1);
		border-radius: var(--radius-pill);
		padding: 0.45em 1.2em;
		cursor: pointer;
		&:hover,
		&:focus-visible {
			background: var(--1-tint);
			color: var(--1-ink);
		}
	}
	.menu {
		position: absolute;
		z-index: 10;
		top: calc(100% + 0.5em);
		left: 50%;
		translate: -50% 0;
		min-width: 15em;
		background: white;
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-2);
		outline: 2px solid var(--2-light);
		padding: 0.4em;
		display: flex;
		flex-direction: column;
		button,
		a {
			display: flex;
			align-items: center;
			gap: 0.5em;
			font: inherit;
			text-align: left;
			color: var(--2-dark);
			background: none;
			border: 0;
			border-radius: var(--radius-s);
			padding: 0.6em 0.8em;
			cursor: pointer;
			text-decoration: none;
			white-space: nowrap;
			&:hover,
			&:focus-visible {
				background: color-mix(in srgb, var(--2) 12%, transparent);
			}
		}
	}
</style>
