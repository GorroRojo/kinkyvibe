<script>
	import MailLinkCard from '$lib/components/series/MailLinkCard.svelte';

	export let data;
	export let form;
</script>

<MailLinkCard
	title="Dejar de recibir avisos"
	text={data.seriesName
		? `Tocá el botón y no te escribimos más sobre ${data.seriesName}. Borramos tu mail de esta lista.`
		: 'Ya no estabas en la lista de avisos. Si querés, tocá el botón igual para confirmarlo.'}
	button="Darme de baja"
	valid={data.valid}
	done={form?.ok
		? `Listo: no te vamos a avisar más${form.seriesName ? ` de ${form.seriesName}` : ''}.`
		: ''}
	error={form?.error ?? (data.valid ? '' : 'Este link no es válido. Revisá que esté completo.')}
/>
