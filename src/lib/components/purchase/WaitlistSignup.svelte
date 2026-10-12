<script>
	/**
	 * «Anotate en la lista de espera» de la página de compra (interruptor `lista_espera`,
	 * docs/tickets.md). Solo el mail; manda a `?/waitlist`. Por tipo de entrada, se elige cuál de
	 * los agotados. Con cuenta, el mail ya viene puesto (y si es el de la cuenta, entra directo a la
	 * fila). Cada tarjeta agotada de la compra lleva «Anotate en la lista de espera», que baja acá
	 * con ese tipo elegido (`waitlistPick`).
	 * Props:
	 * - `waitlist`: `{ scope, types, email }` de la página, o `null` (ya no hay dónde anotarse).
	 * - `result`: lo que devolvió `?/waitlist` (`{ ok, status }` o `{ error, email, tipo }`).
	 */
	import { enhance } from '$app/forms';
	import { BellRing } from '@lucide/svelte';
	import { waitlistPick } from './waitlistPick.js';

	/** @type {{ scope: 'event' | 'type', types: { id: string, name: string }[], email: string } | null} */
	export let waitlist = null;
	/** @type {{ ok?: boolean, status?: string, error?: string, email?: string, tipo?: string } | null} */
	export let result = null;

	$: done = result?.ok
		? result.status === 'waiting'
			? 'Listo: ya estás en la lista de espera. Si se libera un lugar, te avisamos por mail.'
			: 'Te mandamos un mail para confirmar. Abrilo y tocá el botón: sin confirmar no quedás en la lista.'
		: '';
	$: email = result?.email ?? waitlist?.email ?? '';
	$: tipo =
		($waitlistPick && waitlist?.types.some((t) => t.id === $waitlistPick) ? $waitlistPick : '') ||
		result?.tipo ||
		waitlist?.types[0]?.id ||
		'';
</script>

<section class="waitlist surface-card" id="lista-espera" aria-labelledby="waitlist-title">
	<h2 id="waitlist-title"><BellRing size={20} aria-hidden="true" /> Lista de espera</h2>
	{#if done}
		<p class="ok" role="status">{done}</p>
	{:else}
		{#if result?.error}<p class="error" role="alert">{result.error}</p>{/if}
		{#if waitlist}
			<p>
				Están agotadas. Dejanos tu mail: si se libera un lugar, le avisamos a la primera persona de
				la fila y se lo guardamos un rato. Cada mail trae un link para salir de la lista.
			</p>
			<form method="POST" action="?/waitlist" use:enhance class="row">
				{#if waitlist.scope === 'type'}
					<label>
						<span>Tipo de entrada</span>
						<select
							name="tipo"
							value={tipo}
							on:change={(e) => waitlistPick.set(e.currentTarget.value)}
						>
							{#each waitlist.types as t (t.id)}
								<option value={t.id}>{t.name}</option>
							{/each}
						</select>
					</label>
				{/if}
				<label>
					<span>Tu mail</span>
					<input
						type="email"
						name="email"
						required
						autocomplete="email"
						placeholder="tu@mail.com"
						value={email}
					/>
				</label>
				<button class="pill-btn" type="submit">Anotarme</button>
			</form>
		{/if}
	{/if}
</section>

<style>
	.waitlist {
		display: grid;
		gap: 0.7em;
		width: min(40rem, 100%);
		margin: 1.5em auto 0;
		border-top: 0.3rem solid var(--2);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin: 0;
		font-size: var(--step-1);
	}
	p {
		margin: 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.6em;
	}
	.row label {
		flex: 1 1 14rem;
		display: grid;
		gap: 0.2em;
		font-size: var(--step--1);
	}
	input[type='email'],
	select {
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
		min-width: 0;
	}
	.ok {
		color: var(--3-ink);
		font-weight: 700;
	}
	.error {
		color: var(--1-ink);
		font-weight: 700;
	}
</style>
