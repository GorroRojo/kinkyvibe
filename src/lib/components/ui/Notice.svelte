<script>
	/**
	 * Aviso en la página (`.kv-flash` de $lib/admin/panel-forms.scss): verde para lo que salió bien
	 * («Guardado ✓»), amarillo para avisos y **rojo** (`--error`) para errores y malas noticias.
	 * «Guardado» y «Deshacer» nunca van en rojo. Un aviso con «Deshacer» es `UndoToast`.
	 *
	 * Props: `tone`: 'ok' (default) | 'warn' | 'error'. Los errores se anuncian con
	 * `role="alert"`; los demás con `role="status"`. Slot default: el texto.
	 */
	import '$lib/admin/panel-forms.scss';

	/** @type {'ok' | 'warn' | 'error'} */
	export let tone = 'ok';
</script>

<p
	class="kv-flash"
	class:warn={tone === 'warn'}
	class:bad={tone === 'error'}
	role={tone === 'error' ? 'alert' : 'status'}
>
	<slot />
</p>
