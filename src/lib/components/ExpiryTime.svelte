<script>
	/**
	 * Cuándo vence algo, con la hora exacta: en el servidor (y sin JavaScript) la hora de
	 * Argentina con la aclaración «hora de Argentina y Uruguay»; ya en el navegador, la hora local
	 * de quien mira (Intl sin zona). Ver src/lib/utils/expiry.js.
	 */
	import { onMount } from 'svelte';
	import { expiryLabel } from '$lib/utils/expiry.js';

	/** Cuándo vence (ms). */
	/** @type {number} */
	export let at;
	/** Desde cuándo (para saber si es hoy); por defecto, ahora. */
	/** @type {number | undefined} */
	export let now = undefined;
	/** «hasta las 14:35» en vez de «a las 14:35». */
	export let until = false;

	let local = false;
	onMount(() => {
		local = true;
	});

	$: text = expiryLabel(at, now ?? Date.now(), { local, until });
</script>

<time datetime={new Date(at).toISOString()}>{text}</time>
