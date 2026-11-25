<script>
	/**
	 * «Links por entrada» en el editor de un formulario «quienes tenían entrada» (docs/formularios.md,
	 * «El link personal»): cada entrada de cada orden que ya recibió el mail, con su titular, si ya
	 * respondió y «Copiar link» (para pasarle el suyo a mano a alguien). Cerrado por defecto. Si el
	 * navegador no deja copiar, el link queda en un campo, seleccionado, para copiarlo a mano.
	 */
	import { tick } from 'svelte';
	import { Copy } from '@lucide/svelte';
	import { Badge, Button, Field } from '$lib/components/ui';

	/**
	 * @type {{ key: string, order: string, ticket: number, holderName: string, used: boolean,
	 *   url: string }[]}
	 */
	export let links;

	/** La entrada que se copió recién (o la que quedó en el campo para copiar a mano). */
	let copied = '';
	let manual = '';
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;

	/** @param {{ key: string, url: string }} link */
	async function copy(link) {
		try {
			await navigator.clipboard.writeText(link.url);
			manual = '';
			copied = link.key;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = ''), 2500);
		} catch {
			copied = '';
			manual = link.key;
			await tick();
			const input = /** @type {HTMLInputElement | null} */ (
				document.getElementById(`link-entrada-${link.key}`)
			);
			input?.focus();
			input?.select();
		}
	}
</script>

<details class="ticket-links">
	<summary>Links por entrada ({links.length})</summary>
	<ul>
		{#each links as l (l.key)}
			<li>
				<div class="who">
					<strong>{l.holderName || `Entrada ${l.ticket}`}</strong>
					<small class="kv-note">{l.order} · Entrada {l.ticket}</small>
				</div>
				{#if l.used}<Badge tone="ok">Respondió</Badge>{/if}
				<Button variant="secondary" size="small" icon={Copy} on:click={() => copy(l)}
					>{copied === l.key ? 'Copiado' : 'Copiar link'}</Button
				>
				{#if manual === l.key}
					<div class="manual">
						<Field label="Link" id="link-entrada-{l.key}" value={l.url} />
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</details>

<style>
	.ticket-links summary {
		cursor: pointer;
		font-weight: 700;
	}
	ul {
		list-style: none;
		margin: var(--space-2xs) 0 0;
		padding: 0;
		display: grid;
		gap: var(--space-2xs);
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs) var(--space-s);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1 1 12rem;
		overflow-wrap: anywhere;
	}
	.who .kv-note {
		margin: 0;
	}
	.manual {
		flex-basis: 100%;
	}
</style>
