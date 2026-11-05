<script>
	import PublicForm from '$lib/components/formularios/PublicForm.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<svelte:head>
	<title>Encuesta · {data.form.eventTitle} · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<PublicForm data={data.form} {form} />
