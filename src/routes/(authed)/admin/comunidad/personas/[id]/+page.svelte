<script>
	/** Ficha de una persona: ver $lib/components/admin/personas/Ficha.svelte. */
	import Ficha from '$lib/components/admin/personas/Ficha.svelte';

	export let data;
	export let form;
</script>

<Ficha {data} {form} back={{ href: '/admin/comunidad/personas', label: 'Personas' }} />
