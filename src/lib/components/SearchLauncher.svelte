<script>
	// Carga el buscador global (componente + índice) recién cuando alguien lo abre,
	// para no sumarle peso a cada página.
	import { searchOpen } from '$lib/utils/stores';

	/** @type {typeof import('./SearchPalette.svelte').default | undefined} */
	let Palette;
	let loading = false;

	$: if ($searchOpen && !Palette && !loading) load();

	async function load() {
		loading = true;
		try {
			Palette = (await import('./SearchPalette.svelte')).default;
		} catch (e) {
			console.error(e);
			searchOpen.set(false);
		} finally {
			loading = false;
		}
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		// una vez cargado, SearchPalette maneja el atajo
		if (Palette) return;
		if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchOpen.set(true);
		}
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if Palette}
	<svelte:component this={Palette} />
{/if}
