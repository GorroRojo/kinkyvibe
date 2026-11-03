<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { areaBackLink } from '$lib/admin/nav.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import { Lock } from '@lucide/svelte';

	export let data;
	export let form;

	/** Interruptor que se está guardando y el último que se guardó (para «Guardando…» / «Guardado ✓»). */
	let saving = '';
	let savedKey = '';

	/** @param {string} key @returns {import('@sveltejs/kit').SubmitFunction} */
	const toggle =
		(key) =>
		({ formElement }) => {
			saving = key;
			savedKey = '';
			return async ({ result, update }) => {
				await update({ reset: false });
				saving = '';
				if (result.type === 'success') savedKey = key;
				else {
					// No se guardó: el interruptor vuelve a mostrar lo que hay guardado.
					const input = formElement.querySelector('input[role="switch"]');
					if (input instanceof HTMLInputElement) input.checked = !input.checked;
				}
			};
		};
</script>

<PageHeader
	back={areaBackLink('ajustes-interruptores')}
	title="Interruptores"
	subtitle="Funciones nuevas: salen apagadas y se prenden desde acá."
/>
<div class="kv-stack settings">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible: todo queda apagado.</p>
	{/if}
	{#if form?.message}
		<p class="kv-flash" role="status">{form.message}</p>
	{:else if form?.error}
		<p class="kv-flash bad" role="alert">{form.error}</p>
	{/if}

	<!-- Pausas de emergencia (docs/interruptores.md): no se tocan desde acá, a propósito (se
	     cortan aunque la base o el panel anden mal). -->
	<section id="pausas" class="kv-stack" aria-label="Pausas de emergencia">
		<Card title="Pausas de emergencia">
			<p class="kv-note">
				Para frenar de golpe la venta online o los mails en tanda si algo sale mal. Se prenden y se
				apagan desde el panel de Cloudflare (Workers → kinkyvibe → Settings → Variables and
				Secrets): las puede tocar quien tiene acceso a esa cuenta.
			</p>
			<ul class="pauses">
				<li>
					{#if data.pauses.tickets}
						<Badge tone="bad">en pausa</Badge>
						<strong>Venta online de entradas.</strong>
						<span>Les compradores ven: «{data.pauses.tickets}»</span>
					{:else}
						<Badge tone="ok">andando</Badge>
						<strong>Venta online de entradas.</strong>
					{/if}
					<span class="kv-note">
						Variable TICKETS_PAUSED. Frena las compras con Mercado Pago, las reservas por
						transferencia y las entradas gratis. La puerta, la carga a mano, los pagos ya empezados
						y los reembolsos siguen.
					</span>
				</li>
				<li>
					{#if data.pauses.mails}
						<Badge tone="bad">en pausa</Badge>
						<strong>Mails en tanda.</strong>
						{#if data.pauses.mails !== '1'}<span>Nota: «{data.pauses.mails}»</span>{/if}
					{:else}
						<Badge tone="ok">andando</Badge>
						<strong>Mails en tanda.</strong>
					{/if}
					<span class="kv-note">
						Variable MAILS_PAUSED. Frena recordatorios, «Enviar el link a todes», «Avisar a les
						compradores», «Mail a compradores», series, «Lo que sigo» y la lista de espera: quedan
						para cuando se saque. Los mails de cada compra (entradas, transferencia, reembolso,
						códigos para ingresar) salen siempre.
					</span>
				</li>
			</ul>
		</Card>
	</section>

	{#each data.flags as f (f.key)}
		<Card title={f.label}>
			<!-- Interruptor: se guarda apenas se toca (sin botón Guardar; decisión de gorrite). -->
			<form slot="actions" method="POST" action="?/toggle" use:enhance={toggle(f.key)}>
				<input type="hidden" name="key" value={f.key} />
				<label class="kv-check toggle">
					<input
						type="checkbox"
						role="switch"
						name="enabled"
						value="1"
						checked={f.enabled}
						disabled={!data.dbAvailable || saving === f.key}
						aria-label={f.label}
						on:change={(e) => e.currentTarget.form?.requestSubmit()}
					/>
					<span>{f.enabled ? 'Prendido' : 'Apagado'}</span>
					{#if saving === f.key}
						<span class="kv-note" role="status">Guardando…</span>
					{:else if savedKey === f.key}
						<span class="saved" role="status">Guardado ✓</span>
					{/if}
				</label>
				<noscript><button class="kv-btn small" type="submit">Guardar</button></noscript>
			</form>
			{#if f.forced !== null || f.updatedAt}
				<p class="state">
					{#if f.forced === true}
						<Badge tone="info" icon={Lock}>fijo: prendido</Badge>
					{:else if f.forced === false}
						<Badge tone="bad" icon={Lock}>fijo: apagado</Badge>
					{/if}
					{#if f.updatedAt}
						<span class="kv-note">
							Último cambio: {fmtDateTime(f.updatedAt)} ({f.updatedBy})
						</span>
					{/if}
				</p>
			{/if}
			<p class="kv-note">{f.description}</p>
			{#if f.forced !== null}
				<p class="kv-note">
					Este interruptor está fijo desde la configuración del sitio: cambiarlo acá no hace nada
					hasta que se saque esa configuración.
				</p>
			{/if}
			{#if f.tech || f.forced !== null}
				<details class="tech">
					<summary>Para técnicos</summary>
					{#if f.tech}<p class="kv-note">{f.tech}</p>{/if}
					<p class="kv-note">
						Variable {f.envVar} (panel de Cloudflare): si existe, manda sobre este interruptor.
					</p>
				</details>
			{/if}
		</Card>
	{/each}
</div>

<style>
	.tech summary {
		cursor: pointer;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.settings {
		max-width: 48rem;
	}
	.toggle {
		font-weight: 700;
	}
	.saved {
		color: var(--ok);
		font-size: var(--text-sm);
	}
	.pauses {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}
	.pauses li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2xs);
	}
	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		margin: 0 0 0.5rem;
	}
</style>
