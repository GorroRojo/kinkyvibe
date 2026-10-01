<script>
	import MailLinkCard from '$lib/components/series/MailLinkCard.svelte';

	export let form;
</script>

<MailLinkCard
	title="Confirmá el aviso"
	text="Tocá el botón y te escribimos cuando se anuncie una nueva edición."
	button="Confirmar"
	done={form?.ok
		? `Listo: te vamos a avisar cuando haya una nueva edición de ${form.seriesName}. Cada mail trae un link para darte de baja.`
		: ''}
	error={form?.error ?? ''}
/>
