<script>
	import MailLinkCard from '$lib/components/series/MailLinkCard.svelte';

	export let data;
	export let form;

	$: name = form?.event?.name ?? data.event?.name ?? '';
</script>

<MailLinkCard
	title="Volver a la lista de espera"
	text={`Tocá el botón y volvés a la lista de espera${name ? ` de ${name}` : ''}, al final de la fila. No hace falta confirmar el mail de nuevo.`}
	button="Volver a anotarme"
	valid={data.valid}
	done={form?.ok
		? form.status === 'already'
			? `Ya estabas en la lista de espera${name ? ` de ${name}` : ''}: no cambiamos nada.`
			: `Listo: volviste a la lista de espera${name ? ` de ${name}` : ''}. Si se libera un lugar, te avisamos por mail.`
		: ''}
	error={form?.error ?? (data.valid ? '' : 'Este link no es válido. Revisá que esté completo.')}
/>
