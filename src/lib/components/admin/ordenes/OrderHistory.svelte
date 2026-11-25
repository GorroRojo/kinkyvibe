<script>
	/**
	 * Lo que se cambió con «Editar» en una compra (Ventas › Órdenes): «Editado por X el dd/mm» y,
	 * al abrirlo, cada cambio (quién, cuándo, cada dato: antes → después) con «Deshacer» en los que
	 * todavía no se deshicieron (`undoEdit`, $lib/server/admin/orderEdits.js).
	 *
	 * Props: `orderId` y `edits` (del más nuevo al más viejo).
	 */
	import { enhance } from '$app/forms';
	import { announceResult } from '$lib/admin/announce.js';
	import { shortTime } from '$lib/admin/orderFormat.js';
	import { argDayMonth } from '$lib/utils/dates.js';

	export let orderId = '';
	/** @type {import('$lib/server/admin/orderEdits.js').OrderEdit[]} */
	export let edits = [];

	$: last = edits[0];
	/** «Dato:» (como AnswerList: «¿Qué comida?» no lleva los dos puntos). @param {string} label */
	const withColon = (label) => (/[?:]$/.test(label) ? label : `${label}:`);

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const undo =
		() =>
		async ({ result, update }) => {
			await update();
			announceResult(result, 'orderEdit');
		};
</script>

{#if last}
	<details class="history">
		<summary>Editado por {last.by} el {argDayMonth(last.at)}</summary>
		<ol>
			{#each edits as e (e.id)}
				<li class:undone={e.undone}>
					<div class="when">
						{shortTime(e.at)} · {e.by}{#if e.undoes}{' '}· deshizo un cambio{/if}
						{#if e.undone}
							<span class="tag">deshecho</span>
						{:else}
							<form method="POST" action="?/undoEdit" use:enhance={undo}>
								<input type="hidden" name="order" value={orderId} />
								<input type="hidden" name="edit" value={e.id} />
								<button type="submit" class="link">Deshacer</button>
							</form>
						{/if}
					</div>
					<ul>
						{#each e.changes as c (c.key)}
							<li>
								<span class="label">{withColon(c.label)}</span>
								<del>{c.before || '—'}</del> → <ins>{c.after || '—'}</ins>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	</details>
{/if}

<style>
	.history {
		font-size: var(--text-sm);
	}
	summary {
		cursor: pointer;
		color: var(--muted);
	}
	ol {
		list-style: none;
		margin: var(--space-3xs) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	ol > li {
		padding: var(--space-3xs) var(--space-2xs);
		border-left: 3px solid var(--line);
	}
	.undone {
		opacity: 0.65;
	}
	.when {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2xs);
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.when form {
		display: inline;
	}
	.link {
		font: inherit;
		background: none;
		border: 0;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		cursor: pointer;
	}
	.tag {
		font-style: italic;
	}
	ul {
		margin: 0.2rem 0 0;
		padding-left: 1rem;
		overflow-wrap: anywhere;
	}
	.label {
		color: var(--muted);
	}
	del {
		color: var(--muted);
	}
	ins {
		text-decoration: none;
		font-weight: 700;
	}
</style>
