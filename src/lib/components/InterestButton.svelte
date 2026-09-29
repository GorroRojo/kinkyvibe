<script>
	import { enhance } from '$app/forms';

	/**
	 * Botón anónimo de "Me interesa". Funciona sin JavaScript (form action) y se oculta si
	 * no hay base de datos (`interest` es `null`).
	 * @type {{ interest: { count: number, interested: boolean } | null, error?: string | null }}
	 */
	let { interest, error = null } = $props();
	let pending = $state(false);

	let countText = $derived(
		!interest || interest.count === 0
			? 'Todavía nadie marcó interés'
			: interest.count === 1
				? 'A 1 persona le interesa'
				: `A ${interest.count} personas les interesa`
	);
</script>

{#if interest}
	<form
		class="interest"
		method="POST"
		action="?/interest"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update({ reset: false });
				pending = false;
			};
		}}
	>
		<input type="hidden" name="interested" value={interest.interested ? '0' : '1'} />
		<button type="submit" aria-pressed={interest.interested} disabled={pending}>
			{interest.interested ? '★' : '☆'} Me interesa
		</button>
		<span class="interest-count" aria-live="polite">{countText}</span>
		{#if error}
			<p class="interest-error" role="alert">{error}</p>
		{/if}
		<small class="interest-note">Es anónimo: no guardamos quién sos.</small>
	</form>
{/if}

<style>
	.interest {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.3em 0.8em;
		max-width: 40rem;
		margin: 1em auto 0;
		font-size: var(--step-0);
	}
	button {
		font: inherit;
		font-weight: bold;
		cursor: pointer;
		color: var(--1);
		background: white;
		border: 2px solid var(--1);
		border-radius: 999em;
		padding: 0.3em 1em;
	}
	button[aria-pressed='true'] {
		color: white;
		background: var(--1);
	}
	button:hover:not(:disabled) {
		box-shadow: 0 0 0.5em var(--1-light);
	}
	button:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	.interest-error {
		flex-basis: 100%;
		text-align: center;
		margin: 0;
		color: var(--1-dark, var(--1));
	}
	.interest-note {
		flex-basis: 100%;
		text-align: center;
		opacity: 0.7;
	}
</style>
