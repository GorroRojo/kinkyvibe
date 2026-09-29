<script>
	// Botón "Compartir" de un evento.
	// - Público: comparte el link del evento con la Web Share API (menú nativo del celu);
	//   si el navegador no la tiene, ofrece copiar el link.
	// - Admins: además ofrece "Imágenes para Instagram" (/calendario/<evento>/compartir).
	import { Share2, Link, Images, Check } from '@lucide/svelte';
	import { fly } from 'svelte/transition';

	/** @type {string} */
	export let url;
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let text = '';
	/** Ruta del generador de imágenes; solo se muestra si isAdmin. */
	/** @type {string} */
	export let imagesHref;
	export let isAdmin = false;

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

	function onClick() {
		// sin nada más que ofrecer y con menú nativo: directo al menú del sistema
		if (!isAdmin && canShare()) return shareLink();
		open = !open;
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
		on:click={onClick}
		aria-haspopup={isAdmin || !canShare() ? 'menu' : undefined}
		aria-expanded={isAdmin || !canShare() ? open : undefined}
	>
		<Share2 size="20" /> Compartir
	</button>
	{#if open}
		<div class="menu" role="menu" transition:fly={{ duration: 150, y: -8 }}>
			<button type="button" role="menuitem" on:click={shareLink}>
				{#if copied}<Check size="18" /> ¡Link copiado!{:else}<Link size="18" />
					{canShare() ? 'Compartir link' : 'Copiar link'}{/if}
			</button>
			{#if isAdmin}
				<a role="menuitem" href={imagesHref} data-sveltekit-preload-data="off">
					<Images size="18" /> Imágenes para Instagram
				</a>
			{/if}
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
		color: var(--2-dark);
		background: white;
		border: 2px solid var(--2);
		border-radius: 999em;
		padding: 0.45em 1.2em;
		cursor: pointer;
		&:hover,
		&:focus-visible {
			background: var(--2);
			color: white;
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
		border-radius: 0.8em;
		box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.2);
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
			border-radius: 0.5em;
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
