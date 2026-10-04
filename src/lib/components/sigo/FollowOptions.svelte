<script>
	/**
	 * Las opciones de una cosa seguida en Mi rincón → Lo que sigo: «En mi calendario» como
	 * interruptor aparte y los avisos como grilla de qué (filas: «Algo nuevo», «Recordatorio el día
	 * antes») × por dónde (columnas: Mail, Telegram…). Va adentro del <form> de ?/opciones: cada
	 * interruptor prendido manda su casilla (`calendario`, `mail_nuevo`, `recordatorio`).
	 *
	 * Las columnas salen de `channels` (NOTIFY_CHANNELS de $lib/utils/sigo.js): una columna sin
	 * `enabled` se ve apagada, con «Próximamente» (o su `offLabel`), y no manda nada. Cada columna
	 * prendida manda además `canal=<id>`, para que el servidor sepa qué casillas se mostraron (una
	 * casilla apagada no se manda). Telegram se prende por cuenta con `notifyChannels`.
	 *
	 * Props: `options` (FollowOptions), `name` (para los textos de lectores de pantalla),
	 * `disabled`, `channels`, `kinds`, `noteId` (id del texto que explica lo que viene). Reenvía
	 * `change` de cada interruptor (para guardar en el momento).
	 */
	import { NOTIFY_CHANNELS, NOTIFY_KINDS } from '$lib/utils/sigo.js';

	/** @type {import('$lib/utils/sigo.js').FollowOptions} */
	export let options;
	export let name = '';
	export let disabled = false;
	/** @type {readonly import('$lib/utils/sigo.js').NotifyChannel[]} */
	export let channels = NOTIFY_CHANNELS;
	/** @type {readonly { id: import('$lib/utils/sigo.js').NotifyKindId, label: string }[]} */
	export let kinds = NOTIFY_KINDS;
	/** @type {string | undefined} */
	export let noteId = undefined;

	/**
	 * La casilla de una celda, si la columna está prendida y tiene una para esa fila.
	 *
	 * @param {import('$lib/utils/sigo.js').NotifyChannel} c
	 * @param {import('$lib/utils/sigo.js').NotifyKindId} k
	 */
	const fieldOf = (c, k) => (c.enabled ? c.fields[k] : undefined);
</script>

<div class="follow-options">
	{#each channels as c (c.id)}
		{#if c.enabled}<input type="hidden" name="canal" value={c.id} />{/if}
	{/each}
	<label class="switch calendar">
		<input
			type="checkbox"
			role="switch"
			name="calendario"
			checked={options.calendario}
			{disabled}
			on:change
		/>
		<span><span aria-hidden="true">📅</span> En mi calendario</span>
	</label>

	<table class="channels">
		<caption class="visually-hidden">Avisos de {name}</caption>
		<thead>
			<tr>
				<td></td>
				{#each channels as c (c.id)}
					<th scope="col" class:soon={!c.enabled} data-channel={c.id}>
						{c.label}
						{#if !c.enabled}<span class="soon-chip">{c.offLabel ?? 'Próximamente'}</span>{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each kinds as k (k.id)}
				<tr>
					<th scope="row">{k.label}</th>
					{#each channels as c (c.id)}
						{@const field = fieldOf(c, k.id)}
						<td>
							<label class="switch" class:off={!field}>
								{#if field}
									<input
										type="checkbox"
										role="switch"
										name={field}
										checked={options[field]}
										{disabled}
										on:change
									/>
								{:else}
									<input
										type="checkbox"
										role="switch"
										disabled
										aria-describedby={c.note ? noteId : undefined}
									/>
								{/if}
								<span class="visually-hidden"
									>{k.label} por {c.label}{field
										? ''
										: ` (${(c.offLabel ?? 'Próximamente').toLowerCase()})`}</span
								>
							</label>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.follow-options {
		/* la fila de Lo que sigo pone --accent con el color de la etiqueta (para su borde): los
		   interruptores siguen con el rosa de siempre */
		--accent: var(--1);
		display: grid;
		gap: 0.4em;
	}
	/* el interruptor en sí es el compartido (style.scss, `role="switch"`) */
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.55em;
		min-height: var(--tap);
		cursor: pointer;
	}
	/* columna que todavía no existe: rayada, sin perilla */
	.switch.off {
		cursor: not-allowed;
	}
	.switch.off input {
		background: repeating-linear-gradient(
			-45deg,
			var(--line),
			var(--line) 4px,
			var(--surface) 4px,
			var(--surface) 8px
		);
		outline: 1px solid var(--line);
		opacity: 1;
	}
	.switch.off input::before {
		display: none;
	}
	.calendar {
		font-weight: 700;
	}
	.channels {
		border-collapse: collapse;
		width: 100%;
		font-size: var(--step--1);
	}
	.channels th,
	.channels td {
		padding: 0 0.25em;
		text-align: center;
		vertical-align: middle;
	}
	/* las columnas, tan angostas como su contenido: la fila de nombres se queda con el resto
	   (a 330px, «Recordatorio» entra entero) */
	.channels thead th {
		width: 1%;
		min-width: 3.5em;
		white-space: nowrap;
		padding-bottom: 0.1em;
		color: var(--muted);
		font-weight: 700;
		line-height: 1.2;
	}
	.channels thead th.soon {
		font-weight: 400;
	}
	.soon-chip {
		display: block;
		width: max-content;
		margin: 0.15em auto 0;
		padding: 0 0.45em;
		border-radius: var(--round-pill);
		background: var(--2-tint);
		color: var(--2-dark);
		font-size: var(--step--2);
		font-weight: 700;
	}
	.channels tbody th {
		padding-inline-start: 0;
		text-align: start;
		font-weight: 400;
		line-height: 1.25;
	}
	.channels tbody tr + tr {
		border-top: 1px solid var(--line);
	}
</style>
