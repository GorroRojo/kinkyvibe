<script>
	import MailLinkCard from '$lib/components/series/MailLinkCard.svelte';

	export let data;
	export let form;

	$: name = form?.event?.name ?? data.event?.name ?? '';
</script>

<MailLinkCard
	title="Salir de la lista de espera"
	text={data.live
		? `Tocá el botón y salís de la lista de espera${name ? ` de ${name}` : ''}. Si tenías un lugar guardado, se lo pasamos a la próxima persona.`
		: 'Ya no estás en esta lista de espera. Si querés, tocá el botón igual para confirmarlo.'}
	button="Salir de la lista"
	valid={data.valid}
	done={form?.ok
		? form.left
			? `Listo: saliste de la lista de espera${name ? ` de ${name}` : ''}. No te vamos a escribir más por esto.`
			: 'Ya no estabas en esta lista de espera: no te vamos a escribir más por esto.'
		: ''}
	error={form?.error ?? (data.valid ? '' : 'Este link no es válido. Revisá que esté completo.')}
/>
