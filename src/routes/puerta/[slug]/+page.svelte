<script>
	/** Puerta con link: la misma pantalla que el modo puerta del panel, sin nada del panel. */
	import DoorScreen from '$lib/components/admin/door/DoorScreen.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<DoorScreen {data} {form} />
