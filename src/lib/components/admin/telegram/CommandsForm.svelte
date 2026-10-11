<script>
	/**
	 * «Actualizar comandos del bot» (Ajustes → Automatizaciones, tarjeta del bot de Telegram): manda
	 * `?/comandos`, que le registra a Telegram la lista de $lib/server/telegram/commands.js para el
	 * autocompletado del menú «/». El cron ya los registra solo cuando cambian
	 * ($lib/server/telegram/commandsSync.js): el botón es para hacerlo ya. Muestra el último registro,
	 * qué quedó registrado o el error.
	 *
	 * Props:
	 * - `tokenOk`: si está cargado `TELEGRAM_BOT_TOKEN` (sin él, el botón no hace nada y se avisa).
	 * - `lastSync`: el último registro (`{ at, by: 'automático' | 'manual' }`) o `null`.
	 * - `form`: lo que devolvió la acción (`commandsOk`, `commandsError`, `commandsResults`).
	 */
	import { enhance } from '$app/forms';
	import { Button, Notice } from '$lib/components/ui';
	import { RefreshCw } from '@lucide/svelte';
	import { argDateLog } from '$lib/utils/dates.js';

	export let tokenOk = false;
	/** @type {{ at: number, by: string } | null} */
	export let lastSync = null;
	/** @type {any} */
	export let form = null;

	let busy = false;

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	/** @type {{ scope: string, label: string, commands: string[], ok: boolean, error?: string }[]} */
	$: results = form?.commandsResults ?? [];
</script>

<div class="commands">
	<form method="POST" action="?/comandos" use:enhance={submit}>
		<Button type="submit" variant="secondary" size="small" icon={RefreshCw} {busy} disabled={busy}
			>Actualizar comandos del bot</Button
		>
	</form>
	<p class="hint">
		Le dice a Telegram qué comandos sugerir cuando alguien escribe «/». Se registran solos: cada 15
		minutos se revisa si cambió la lista o el interruptor «Lo que sigo» y, si cambió, se mandan. El
		botón lo hace ahora.
	</p>
	<p class="hint">
		Último registro: {lastSync
			? `${argDateLog(lastSync.at)} (${lastSync.by === 'manual' ? 'manual' : 'automático'})`
			: 'todavía ninguno'}
	</p>
	{#if !tokenOk && !form?.commandsError}
		<Notice tone="warn" compact role={null}
			>Falta el token del bot (TELEGRAM_BOT_TOKEN): el botón no va a hacer nada hasta que esté
			cargado.</Notice
		>
	{/if}
	{#if form?.commandsOk}
		<Notice tone="ok" compact role="alert">Listo: Telegram ya tiene los comandos.</Notice>
	{:else if form?.commandsError}
		<Notice tone="error" compact role="alert">{form.commandsError}</Notice>
	{/if}
	{#if results.length}
		<ul class="results">
			{#each results as r (r.scope)}
				<li>
					<strong>{r.label}:</strong>
					{#if r.ok}
						{r.commands.map((c) => `/${c}`).join(', ')}
					{:else}
						no se registró ({r.error})
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.commands {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.3rem;
	}
	.hint {
		margin: 0;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.results {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.88rem;
	}
</style>
