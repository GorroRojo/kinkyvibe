<script>
	/**
	 * «Links de puerta» en la ficha del evento (docs/tickets.md, «Link de puerta»): crear un link que
	 * abre solo el modo puerta de este evento, sin cuenta, y revocar los vivos. El link con el token
	 * se ve una sola vez, al crearlo (`result.url`); después solo su etiqueta, quién y cuándo.
	 * Acciones `?/crearLinkPuerta` y `?/revocarLinkPuerta` del +page.server.js de la ficha.
	 */
	import { enhance } from '$app/forms';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { argDateLog } from '$lib/utils/dates.js';
	import Card from '$lib/components/admin/panel/Card.svelte';

	/**
	 * @type {{ links: { id: string, label: string, createdBy: string, createdAt: number,
	 *   expiresAt: number, lastUsedAt: number | null }[] | null, defaultExpires: string }}
	 */
	export let doorLinks;
	/** Lo que devolvió la última acción (`form.doorLink`). */
	/** @type {{ ok: boolean, message: string, url?: string, label?: string, expiresAt?: number } | null} */
	export let result = null;

	let copied = false;

	/** @param {string} text */
	async function copy(text) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			// sin portapapeles: el link queda a la vista para copiarlo a mano
		}
	}
</script>

<section class="door-links" aria-label="Links de puerta">
	<Card title="Links de puerta" tag="div">
		<p class="muted small">
			Para que alguien haga la puerta sin cuenta de admin: el link abre solo la puerta de este
			evento (escanear, buscar, vender en la puerta y la lista sin conexión). Muestra lo mismo que
			la puerta del panel menos el DNI completo, y no deja pasar límites ni entrar al resto del
			panel. Lo que se hace con el link queda en el registro de actividad.
		</p>

		{#if result}
			<p class="flash" class:error={!result.ok} role="status">{result.message}</p>
		{/if}
		{#if result?.ok && result.url}
			<div class="created">
				<label>
					<span>Link{result.label ? ` «${result.label}»` : ''}</span>
					<input
						type="text"
						readonly
						value={result.url}
						on:focus={(e) => e.currentTarget.select()}
					/>
				</label>
				<button type="button" class="kv-btn small" on:click={() => copy(result?.url ?? '')}>
					{copied ? 'Copiado' : 'Copiar'}
				</button>
				<p class="muted small">
					Anda hasta el {argDateLog(result.expiresAt ?? 0)}. Pasalo por un canal privado y solo a
					quien hace la puerta: quien lo tenga puede abrirla.
				</p>
			</div>
		{/if}

		{#if doorLinks.links === null}
			<p class="flash error">No se pudo leer la base de datos.</p>
		{:else}
			{#if doorLinks.links.length}
				<ul class="links">
					{#each doorLinks.links as l (l.id)}
						<li>
							<div>
								<strong>{l.label || 'Sin etiqueta'}</strong>
								<small class="muted block">
									Lo creó {l.createdBy} el {argDateLog(l.createdAt)} · vence el {argDateLog(
										l.expiresAt
									)}{l.lastUsedAt ? ` · se abrió el ${argDateLog(l.lastUsedAt)}` : ' · sin abrir'}
								</small>
							</div>
							<form
								method="POST"
								action="?/revocarLinkPuerta"
								use:enhance={async ({ cancel }) => {
									if (
										!(await askConfirm({
											title: `¿Revocar el link${l.label ? ` «${l.label}»` : ''}?`,
											text: 'Deja de abrir la puerta al toque, también en los celus donde ya está abierto.',
											confirmLabel: 'Revocar',
											tone: 'danger'
										}))
									)
										cancel();
								}}
							>
								<input type="hidden" name="id" value={l.id} />
								<button type="submit" class="kv-btn ghost small">Revocar</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small">No hay links de puerta vivos.</p>
			{/if}

			<form method="POST" action="?/crearLinkPuerta" use:enhance class="create">
				<label>
					<span>Etiqueta (para reconocerlo)</span>
					<input
						type="text"
						name="label"
						maxlength="40"
						placeholder="Por ejemplo: voluntarie de la puerta"
						autocomplete="off"
					/>
				</label>
				<label>
					<span>Anda hasta (hora de Argentina)</span>
					<input
						type="datetime-local"
						name="expires"
						value={doorLinks.defaultExpires}
						required={!doorLinks.defaultExpires}
					/>
				</label>
				<button type="submit" class="kv-btn">Crear link de puerta</button>
			</form>
		{/if}
	</Card>
</section>

<style>
	.small {
		font-size: var(--text-xs);
		margin: 0;
	}
	.block {
		display: block;
	}
	.created,
	.create {
		display: grid;
		gap: var(--space-2xs);
		margin-top: var(--space-xs);
	}
	.created input {
		width: 100%;
		font-family: monospace;
	}
	label {
		display: grid;
		gap: 0.2rem;
	}
	.links {
		list-style: none;
		margin: var(--space-xs) 0 0;
		padding: 0;
		display: grid;
		gap: var(--space-2xs);
	}
	.links li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2xs);
	}
	.links form {
		flex: none;
	}
</style>
