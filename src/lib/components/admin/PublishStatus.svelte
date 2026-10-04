<script>
	/**
	 * En qué quedó un guardado del panel. Los cambios no van directo a main: se guardan en un PR
	 * que se mergea solo cuando pasan las pruebas (ver docs/publicar-contenido.md). Mientras tanto consulta
	 * /admin/contenido/estado cada tanto y avisa si se publicó o si falló una prueba.
	 * Sin `pr` (dev:admin o un preview, que no usan GitHub) muestra el link del commit, si hay.
	 */
	import { onDestroy } from 'svelte';

	/** @type {null | undefined | {number: number, url: string, state: 'auto'|'merged'|'open', stacked?: boolean, problem?: string}} */
	export let pr = null;
	/** Link al "commit" en los modos sin GitHub. */
	/** @type {string | null | undefined} */
	export let commitUrl = null;

	const POLL_MS = 20 * 1000;
	const MAX_POLLS = 60; // ~20 minutos

	/** @type {'pendiente'|'publicado'|'fallo'|'conflicto'|'abierto'|'cerrado'|null} */
	let status = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let timer = null;
	let polls = 0;
	/** @type {number | null} */
	let watching = null;

	/** @param {number} number */
	async function check(number) {
		timer = null;
		if (watching !== number) return;
		try {
			const r = await fetch(`/admin/contenido/estado?pr=${number}`);
			if (r.ok) {
				const body = await r.json();
				if (watching !== number) return;
				status = body.status;
			}
		} catch {
			// Sin red: se vuelve a probar.
		}
		if (watching === number && (status === null || status === 'pendiente') && ++polls < MAX_POLLS)
			timer = setTimeout(() => check(number), POLL_MS);
	}

	function stop() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	$: if (pr?.state === 'auto' && typeof window !== 'undefined') {
		if (watching !== pr.number) {
			stop();
			watching = pr.number;
			status = null;
			polls = 0;
			timer = setTimeout(() => check(/** @type {number} */ (watching)), POLL_MS);
		}
	} else {
		stop();
		watching = null;
	}

	onDestroy(stop);
</script>

{#if pr}
	<span class="publish-status" role="status" data-state={status ?? pr.state}>
		{#if status === 'publicado' || pr.state === 'merged'}
			Publicado (<a href={pr.url} target="_blank" rel="noreferrer">PR #{pr.number}</a>). El sitio se
			actualiza en un par de minutos.
		{:else if status === 'fallo'}
			<b>No se publicó: falló una prueba del contenido</b>
			(<a href={pr.url} target="_blank" rel="noreferrer">PR #{pr.number}</a>). Revisá el error,
			corregilo y volvé a guardar.
		{:else if status === 'conflicto'}
			<b>No se publicó: choca con otro cambio</b>
			(<a href={pr.url} target="_blank" rel="noreferrer">PR #{pr.number}</a>). Alguien tiene que
			resolverlo en GitHub.
		{:else if status === 'cerrado'}
			<b>No se publicó:</b> el <a href={pr.url} target="_blank" rel="noreferrer">PR #{pr.number}</a> se
			cerró sin mergear.
		{:else if pr.state === 'open' || status === 'abierto'}
			<b>Guardado, pero no se publica solo</b>{pr.problem ? `: ${pr.problem}` : ''}. Quedó en el
			<a href={pr.url} target="_blank" rel="noreferrer">PR #{pr.number}</a>: alguien con acceso al
			repo tiene que mergearlo en GitHub.
		{:else}
			Guardado. Se publica en unos minutos, cuando pasen las pruebas (<a
				href={pr.url}
				target="_blank"
				rel="noreferrer">PR #{pr.number}</a
			>){pr.stacked ? '; se sumó al cambio de esta publicación que ya estaba esperando' : ''}.
		{/if}
	</span>
{:else if commitUrl?.startsWith('/')}
	<!-- Eventos y material: se guardó en la base y ya se ve (sin PR ni deploy). -->
	<span class="publish-status" role="status">
		Guardado en la base: ya se ve en el sitio (<a href={commitUrl} target="_blank" rel="noreferrer"
			>ver</a
		>).
	</span>
{:else if commitUrl}
	<span class="publish-status" role="status">
		Cambio guardado: <a href={commitUrl} target="_blank" rel="noreferrer">ver el commit</a>.
	</span>
{/if}

<style>
	.publish-status {
		overflow-wrap: anywhere;
	}
	.publish-status[data-state='fallo'],
	.publish-status[data-state='conflicto'],
	.publish-status[data-state='cerrado'],
	.publish-status[data-state='open'],
	.publish-status[data-state='abierto'] {
		color: var(--bad, #b00020);
	}
</style>
