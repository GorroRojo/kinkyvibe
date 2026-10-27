<script>
	/** Modo puerta del panel: la pantalla es la misma que la de la puerta con link (DoorScreen). */
	import DoorScreen from '$lib/components/admin/door/DoorScreen.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<DoorScreen {data} {form} />
