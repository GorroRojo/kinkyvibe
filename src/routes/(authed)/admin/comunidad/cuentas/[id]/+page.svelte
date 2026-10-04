<script>
	/**
	 * Ficha de una cuenta: es la ficha de la persona ($lib/components/admin/personas/Ficha.svelte),
	 * la misma que Comunidad › Personas › <persona>.
	 */
	import Ficha from '$lib/components/admin/personas/Ficha.svelte';

	export let data;
	export let form;
</script>

<Ficha {data} {form} back={{ href: '/admin/comunidad/cuentas', label: 'Cuentas' }} />
