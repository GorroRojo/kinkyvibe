<script>
	import MailLinkCard from '$lib/components/series/MailLinkCard.svelte';

	export let data;
	export let form;
</script>

<MailLinkCard
	title="¿No fuiste vos?"
	text="Si alguien escribió tu mail por error en un formulario de Kinky Vibe, tocá el botón y no te mandamos más mails a esta dirección. Las entradas que hayas pagado vos te siguen llegando igual."
	button="No quiero más mails"
	valid={data.valid}
	done={form?.ok
		? 'Listo: no te vamos a mandar más mails a esta dirección. Perdón por la molestia.'
		: ''}
	error={form?.error ?? (data.valid ? '' : 'Este link no es válido. Revisá que esté completo.')}
/>
