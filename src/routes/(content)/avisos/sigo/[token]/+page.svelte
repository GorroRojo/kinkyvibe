<script>
	import MailLinkCard from '$lib/components/series/MailLinkCard.svelte';

	export let data;
	export let form;
</script>

<MailLinkCard
	title="Dejar de recibir mails de lo que seguís"
	text="Tocá el botón y no te escribimos más sobre lo que seguís (ni anuncios ni recordatorios). Lo que seguís y tu calendario quedan como están; podés volver a prender los mails en Mi rincón → Lo que sigo."
	button="No quiero más mails"
	valid={data.valid}
	done={form?.ok ? 'Listo: no te vamos a mandar más mails de lo que seguís.' : ''}
	error={form?.error ?? (data.valid ? '' : 'Este link no es válido. Revisá que esté completo.')}
/>
