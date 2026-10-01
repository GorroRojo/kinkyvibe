<script>
	/**
	 * Pedidos "Es mi perfil" para revisar: qué cuenta pide qué perfil, lo que contó y los botones
	 * Aprobar (la cuenta pasa a ser dueñe) y Rechazar. La página que lo usa tiene la action
	 * `?/pedido` (`claimDecisionAction` en src/lib/server/admin/amiguesRoutes.js).
	 * Props: `claims` (AdminClaim de src/lib/server/amigues/claims.js), `result` (respuesta de la
	 * action), `title`.
	 */
	import { enhance } from '$app/forms';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { accountHref, profileHref } from '$lib/admin/links.js';
	import { KIND_LABELS } from '$lib/utils/perfiles.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	/** @type {import('$lib/server/amigues/claims.js').AdminClaim[]} */
	export let claims;
	/** @type {{ ok: boolean, message: string } | null | undefined} */
	export let result = null;
	export let title = 'Pedidos «Es mi perfil»';

	let busy = 0;
</script>

<Card {title}>
	<p class="kv-note">
		Una cuenta dice que este perfil es suyo. Si lo aprobás, pasa a ser su dueñe y lo edita desde Mi
		rincón. Nadie más ve estos pedidos.
	</p>
	{#if result}
		<p class="kv-flash" class:bad={!result.ok} role="status">{result.message}</p>
	{/if}
	{#if claims.length === 0}
		<p class="kv-note">No hay pedidos pendientes.</p>
	{:else}
		<ul class="claims">
			{#each claims as c (c.id)}
				<li>
					<div class="who">
						<a href={profileHref(c.profileId)}><strong>{c.profileTitle}</strong></a>
						<Badge>{KIND_LABELS[c.kind] ?? c.kind}</Badge>
						{#if c.status !== 'pending'}<Badge tone={c.status === 'approved' ? 'ok' : 'bad'}
								>{c.status === 'approved' ? 'aprobado' : 'rechazado'}</Badge
							>{/if}
						<span class="muted">pedido por</span>
						<a href={accountHref(c.accountId)}>{c.email ?? 'cuenta borrada'}</a>
						<span class="muted">· {fmtDateTime(c.createdAt)}</span>
					</div>
					{#if c.message}<blockquote>{c.message}</blockquote>{/if}
					{#if c.status === 'pending' && !c.canHaveProfiles}
						<p class="kv-note warn">
							Esa cuenta no tiene el permiso "puede tener perfiles": dáselo antes de aprobar.
						</p>
					{/if}
					{#if c.status === 'pending'}
						<form
							method="POST"
							action="?/pedido"
							class="kv-row"
							use:enhance={() => {
								busy = c.id;
								return async ({ update }) => {
									await update();
									busy = 0;
								};
							}}
						>
							<input type="hidden" name="claim" value={c.id} />
							<button class="kv-btn small" name="decision" value="aprobar" disabled={busy !== 0}
								>Aprobar</button
							>
							<button class="kv-btn ghost small" name="decision" value="rechazar" disabled={busy !== 0}
								>Rechazar</button
							>
						</form>
					{:else if c.decidedBy}
						<p class="kv-note">Resuelto por @{c.decidedBy}, {fmtDateTime(c.decidedAt ?? 0)}.</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Card>

<style>
	.claims {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.9rem;
	}
	.claims li {
		border-top: 1px solid var(--field);
		padding-top: 0.7rem;
		display: grid;
		gap: 0.4rem;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
		overflow-wrap: anywhere;
	}
	blockquote {
		margin: 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--field);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.warn {
		color: var(--warn);
	}
	.muted {
		color: var(--muted);
	}
</style>
