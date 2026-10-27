<script>
	/**
	 * "Es mi perfil": para cualquier cuenta, en la página de un perfil que no gestiona. Pedirlo no
	 * da nada: lo revisa el equipo. Muestra solo el estado de ESTA cuenta (nunca si alguien más lo
	 * pidió ni si alguien lo gestiona).
	 * Props: `state` ('none' | 'pending' | 'manager'), `result` (lo que devolvió la action, si hubo).
	 */
	import { enhance } from '$app/forms';

	/** @type {'none' | 'pending' | 'manager'} */
	export let state = 'none';
	/** @type {{ ok: boolean, message: string } | null | undefined} */
	export let result = null;

	let open = false;
	let busy = false;
</script>

<aside class="claim">
	{#if result}
		<p class="msg" class:bad={!result.ok} role="status">{result.message}</p>
	{:else if state === 'manager'}
		<p class="msg">
			Gestionás este perfil: lo editás en <a href="/mi-rincon/perfiles">Mi rincón</a>.
		</p>
	{:else if state === 'pending'}
		<p class="msg">
			Pediste este perfil: lo revisa el equipo. Si lo aprobamos, aparece en Mi rincón → Perfiles.
		</p>
	{:else if !open}
		<button type="button" class="link" on:click={() => (open = true)}>¿Es tu perfil?</button>
	{:else}
		<form
			method="POST"
			action="?/esMiPerfil"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<p>
				Si este perfil es tuyo (o de tu proyecto o lugar), pedilo. Lo revisa el equipo a mano: si lo
				aprobamos, te lo pasamos a tu cuenta y lo editás desde Mi rincón → Perfiles. Hasta entonces
				no cambia nada en el perfil.
			</p>
			<label>
				<span
					>Contanos algo que nos ayude a confirmar que es tuyo (opcional): por ejemplo, dónde
					publicás o cómo te conocemos</span
				>
				<textarea name="mensaje" maxlength="500" rows="3"></textarea>
			</label>
			<button type="submit" class="kv-cta" disabled={busy}>Es mi perfil</button>
		</form>
	{/if}
</aside>

<style>
	.claim {
		max-width: 60ch;
		margin: 2em auto 1em;
		padding-inline: var(--space-xs);
		font-size: var(--step--1);
		text-align: center;
	}
	.msg.bad {
		color: var(--error);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
		opacity: 0.8;
	}
	form {
		display: grid;
		gap: 0.6em;
		text-align: left;
	}
	label {
		display: grid;
		gap: 0.3em;
	}
	textarea {
		font: inherit;
		padding: 0.4em;
	}
	.kv-cta {
		justify-self: start;
		padding: 0.5em 1.2em;
		border-radius: var(--radius-pill);
		border: 0;
		background: hsl(319, 90%, 55%);
		color: white;
		font-weight: bold;
		cursor: pointer;
	}
</style>
