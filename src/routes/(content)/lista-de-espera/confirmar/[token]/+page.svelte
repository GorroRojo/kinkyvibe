<script>
	import MailLinkCard from '$lib/components/series/MailLinkCard.svelte';

	export let form;
</script>

<MailLinkCard
	title="Confirmá tu lugar en la fila"
	text="Tocá el botón y quedás en la lista de espera. Si se libera un lugar, te avisamos por mail."
	button="Confirmar"
	auto
	done={form?.ok
		? `Listo: estás en la lista de espera${form.event ? ` de ${form.event.name}` : ''}. Si se libera un lugar, te avisamos por mail. Cada mail trae un link para salir de la lista.`
		: ''}
	error={form?.error ?? ''}
/>
