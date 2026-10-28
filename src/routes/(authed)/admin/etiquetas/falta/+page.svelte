<script>
	/**
	 * Etiquetas › «Enlaces que faltan»: lo que los textos nombran con `[[…]]`, `@` o `#` y no existe,
	 * de lo que más se escribe a lo que menos (la lista de qué escribir para hacer crecer la
	 * Kinkipedia). Cada nombre lleva los objetos que lo usan, con link a su editor y a su página.
	 */
	import { ExternalLink, Unlink } from '@lucide/svelte';
	import { Badge, Card, EmptyState, PageHeader } from '$lib/components/ui';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @type {Record<string, string>} */
	const TYPE_LABEL = {
		evento: 'Evento',
		material: 'Material',
		perfil: 'Perfil',
		etiqueta: 'Kinkipedia'
	};
	/** @type {Record<string, string>} */
	const VISIBILITY_LABEL = { members: 'solo con cuenta', hidden: 'oculto' };
</script>

<PageHeader
	title="Enlaces que faltan"
	subtitle="Lo que los textos nombran con [[…]], @ o # y todavía no existe: cuántas veces se escribe y dónde."
	back={{ href: '/admin/etiquetas', label: 'Etiquetas' }}
/>

<p class="note">
	Se revisaron {data.scanned} textos{data.truncated
		? ' (los editados más recientemente; hay más)'
		: ''}
	con {data.references} enlaces. Un nombre que lleva a algo oculto no falta: existe. Para que deje de
	faltar, creá la etiqueta, el perfil o la publicación con ese nombre, o corregí el texto.
</p>

{#if data.items.length}
	<Card padded={false}>
		<ul class="list">
			{#each data.items as item (item.name)}
				<li>
					<div class="head">
						<code class="name">{item.name}</code>
						<Badge tone="warn">{item.count} {item.count === 1 ? 'vez' : 'veces'}</Badge>
					</div>
					<ul class="sources">
						{#each item.sources as s (s.id)}
							<li>
								{#if s.editHref}
									<a href={s.editHref}>{s.title}</a>
								{:else}
									<span>{s.title}</span>
								{/if}
								<span class="meta"
									>{[TYPE_LABEL[s.type] ?? s.type, VISIBILITY_LABEL[s.visibility]]
										.filter(Boolean)
										.join(' · ')}</span
								>
								{#if s.path}
									<a
										class="icon-link"
										href={s.path}
										target="_blank"
										rel="noreferrer"
										title="Ver la página"
										aria-label="Ver la página de {s.title} (se abre en otra pestaña)"
										><ExternalLink size={14} aria-hidden="true" /></a
									>
								{/if}
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	</Card>
{:else}
	<EmptyState
		icon={Unlink}
		title="No falta nada"
		text="Todos los enlaces de los textos llevan a algo."
	/>
{/if}

<style>
	.note {
		color: var(--muted);
		font-size: var(--text-sm);
		max-width: 70ch;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list > li {
		padding: var(--space-2xs) var(--space-xs);
		border-bottom: 1px solid var(--line);
	}
	.list > li:last-child {
		border-bottom: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
	}
	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.sources {
		margin: var(--space-3xs) 0 0;
		padding-inline-start: 1.2em;
		font-size: var(--text-sm);
	}
	.sources li {
		overflow-wrap: anywhere;
	}
	.meta {
		color: var(--muted);
		font-size: var(--text-xs);
		margin-inline-start: 0.3em;
	}
	.icon-link {
		color: var(--muted);
		vertical-align: middle;
	}
	.icon-link:hover {
		color: var(--link);
	}
</style>
