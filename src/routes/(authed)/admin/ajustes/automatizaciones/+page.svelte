<script>
	/**
	 * Ajustes → Automatizaciones: lo que corre solo, para mirar (todavía no se edita nada acá).
	 * Cada fila: qué hace, cuándo corre, la última vez y la próxima (si se sabe) y dónde se configura.
	 */
	import { fmtDateTime, fmtRelative } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import {
		BellRing,
		Bot,
		CalendarClock,
		Clock,
		DatabaseBackup,
		History,
		Mail,
		Repeat,
		Send,
		Sparkles,
		Timer,
		Video,
		WandSparkles
	} from '@lucide/svelte';

	export let data;

	/** @type {Record<string, any>} */
	const ICONS = {
		'cron-recordatorios': Timer,
		'cron-backup': DatabaseBackup,
		'mail-recordatorios': BellRing,
		'mail-transmision': Video,
		'mail-series': Repeat,
		'mail-sigo-nuevo': Sparkles,
		'mail-sigo-recordatorio': Mail,
		telegram: Bot
	};
	/** @type {Record<string, 'ok' | 'neutral' | 'warn'>} */
	const TONE = { on: 'ok', off: 'neutral', warn: 'warn' };

	const sections = [
		{ id: 'crons', title: 'Tareas programadas', icon: CalendarClock, items: data.crons },
		{ id: 'mails', title: 'Mails que salen solos', icon: Send, items: data.mails },
		{ id: 'telegram', title: 'Bot de Telegram', icon: Bot, items: [data.telegram] }
	];
</script>

<PageHeader
	title="Automatizaciones"
	subtitle="Todo lo que corre solo, en un lugar. Por ahora es para mirar: cada cosa se configura donde dice."
/>

<div class="kv-stack automations">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible: no se sabe cuándo corrió cada cosa.</p>
	{/if}

	{#each sections as section (section.id)}
		<Card title={section.title} icon={section.icon}>
			<ul class="list">
				{#each section.items as a (a.id)}
					<li class="item" id={a.id}>
						<div class="head">
							<span class="icon" aria-hidden="true"
								><svelte:component this={ICONS[a.id] ?? WandSparkles} size={20} /></span
							>
							<h3>{a.title}</h3>
							<Badge tone={TONE[a.state]}>{a.stateLabel}</Badge>
						</div>
						<p class="what">{a.what}</p>
						<dl class="facts">
							<div>
								<dt><Clock size={14} aria-hidden="true" /> Cuándo</dt>
								<dd>{a.when}</dd>
							</div>
							<div>
								<dt><History size={14} aria-hidden="true" /> {a.lastRunLabel ?? 'Última vez'}</dt>
								<dd>
									{#if a.lastRun}
										<time datetime={new Date(a.lastRun).toISOString()}
											>{fmtDateTime(a.lastRun)}</time
										>
										<span class="muted">({fmtRelative(a.lastRun, data.now)})</span>
									{:else}
										<span class="muted">Todavía nada</span>
									{/if}
								</dd>
							</div>
							{#if a.nextRun}
								<div>
									<dt><CalendarClock size={14} aria-hidden="true" /> Próxima</dt>
									<dd>
										<time datetime={new Date(a.nextRun).toISOString()}
											>{fmtDateTime(a.nextRun)}</time
										>
										<span class="muted">({fmtRelative(a.nextRun, data.now)})</span>
									</dd>
								</div>
							{/if}
						</dl>
						{#if a.details.length}
							<details class="tech">
								<summary>Para técnicos</summary>
								<ul class="details">
									{#each a.details as d}<li>{d}</li>{/each}
								</ul>
							</details>
						{/if}
						<p class="config"><a href={a.configHref}>Se configura en {a.configLabel} →</a></p>
					</li>
				{/each}
			</ul>
		</Card>
	{/each}

	<Card title="Reglas" icon={WandSparkles}>
		<p class="soon"><Badge tone="info">próximamente</Badge> {data.rules.text}</p>
	</Card>

	<p class="kv-note">
		Las tareas programadas corren solas, solo en el sitio de verdad (no en las versiones de prueba).
		«Última vez» sale de lo que quedó guardado: si no salió ningún mail, no hay registro aunque la
		tarea haya corrido.
	</p>
	<details class="tech">
		<summary>Para técnicos</summary>
		<p class="kv-note">
			Los horarios están en <code>wrangler.toml</code> (<code>[triggers]</code>); los previews no
			ejecutan crons.
		</p>
	</details>
</div>

<style>
	.automations {
		max-width: 52rem;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.9rem;
	}
	.item {
		display: grid;
		gap: 0.35rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--line, color-mix(in srgb, currentColor 12%, transparent));
	}
	.item:first-child {
		padding-top: 0;
		border-top: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.icon {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--1) 12%, transparent);
		color: var(--1);
		flex: none;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
	}
	p {
		margin: 0;
	}
	.what {
		font-size: 0.92rem;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.4rem;
		margin: 0.2rem 0 0;
		font-size: 0.88rem;
	}
	.facts dt {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-weight: 600;
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
	}
	.tech summary {
		cursor: pointer;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.details {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.config {
		font-size: 0.88rem;
	}
	.muted {
		color: var(--muted);
	}
	.soon {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
	}
</style>
