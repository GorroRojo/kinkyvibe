<script>
	/**
	 * Galería de componentes del sistema de diseño (docs/estilo.md, «Componentes»). Cada sección:
	 * el componente de `$lib/components/ui`, su import, cuándo usarlo y cuándo no, y sus estados
	 * (normal, hover y foco forzados con una clase, apagado, error, elegido, vacío), con datos
	 * inventados. Arriba: superficie (panel o sitio), tema (claro u oscuro, solo el panel tiene
	 * oscuro) y ancho (celu o compu). También por la URL: `?superficie=sitio&tema=oscuro&ancho=celu`.
	 *
	 * SOLO existe en previews y en dev: la importa src/routes/estilo/+page.js dentro de su
	 * condición de compilación. No la importes desde otro lado (lo controla estiloGuard.test.js).
	 */
	import '$lib/admin/panel.scss';
	import '$lib/admin/panel-forms.scss';
	import { onDestroy, onMount } from 'svelte';
	import {
		CalendarDays,
		Copy,
		ExternalLink,
		Inbox,
		Pencil,
		Plus,
		Save,
		Search,
		Trash2,
		TriangleAlert,
		Ticket,
		Undo2
	} from '@lucide/svelte';
	import {
		Badge,
		Button,
		Card,
		Checkbox,
		Chip,
		ChoiceCard,
		Dialog,
		EmptyState,
		Field,
		Notice,
		PageHeader,
		SaveStatus,
		Segmented,
		Sheet,
		Switch,
		Table,
		Tabs,
		TagChip,
		UndoToast,
		askConfirm
	} from '$lib/components/ui';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Seccion from './Seccion.svelte';
	import Estado from './Estado.svelte';
	import { SECCIONES } from './secciones.js';

	/** Marca para `node scripts/demo/guard.js bundle`: si aparece en producción, algo falló. */
	const MARCA = 'kv-estilo-galeria';

	/** @type {'panel' | 'sitio'} */
	let superficie = 'panel';
	/** @type {'claro' | 'oscuro'} */
	let tema = 'claro';
	/** @type {'compu' | 'celu'} */
	let ancho = 'compu';

	const seccion = Object.fromEntries(SECCIONES.map((s) => [s.id, s]));

	// Datos inventados.
	let nombre = 'Persona de Prueba';
	let busqueda = '';
	let mail = 'sin-arroba.example.invalid';
	let notas = '';
	let casilla = true;
	let casillaNo = false;
	let interruptor = true;
	let interruptorGuardando = false;
	let interruptorError = true;
	/** @type {'' | 'saving' | 'saved' | 'error'} */
	let estadoDemo = '';
	let vista = 'entradas';
	let pago = 'transferencia';
	let chipElegido = true;
	let dialogoAbierto = false;
	let hojaAbierta = false;
	let respuesta = '';

	const TABS = [
		{ href: '/estilo#resumen', label: 'Resumen' },
		{ href: '/estilo#ventas', label: 'Ventas' },
		{ href: '/estilo#ordenes', label: 'Órdenes', count: 3 },
		{ href: '/estilo#puerta', label: 'Puerta' },
		{ href: '/estilo#mails', label: 'Mails', soon: true }
	];
	/** Los ejemplos de Button: en «Sitio», los dos aspectos. */
	/** @type {('panel' | 'sitio')[]} */
	const SOLO_PANEL = ['panel'];
	/** @type {('panel' | 'sitio')[]} */
	const SITIO_Y_PANEL = ['sitio', 'panel'];
	/** @type {{ key: string, label: string, align?: 'left' | 'right' }[]} */
	const COLUMNAS = [
		{ key: 'orden', label: 'Orden' },
		{ key: 'persona', label: 'Persona' },
		{ key: 'entradas', label: 'Entradas', align: 'right' },
		{ key: 'total', label: 'Total', align: 'right' }
	];
	const FILAS = [
		{ orden: 'KV-0001', persona: 'Persona de Prueba', entradas: 2, total: '$ 24.000' },
		{ orden: 'KV-0002', persona: 'Alguien Inventade', entradas: 1, total: '$ 12.000' },
		{ orden: 'KV-0003', persona: 'Otra Persona', entradas: 3, total: '$ 36.000' }
	];

	/** Lo que había en <html data-theme> antes de entrar, para dejarlo igual al salir. */
	/** @type {string | undefined} */
	let temaAnterior;
	let montada = false;

	onMount(() => {
		temaAnterior = document.documentElement.dataset.theme;
		const q = new URLSearchParams(location.search);
		if (q.get('superficie') === 'sitio') superficie = 'sitio';
		if (q.get('tema') === 'oscuro') tema = 'oscuro';
		if (q.get('ancho') === 'celu') ancho = 'celu';
		montada = true;
	});
	onDestroy(() => {
		if (!montada) return;
		if (temaAnterior === undefined) delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = temaAnterior;
	});
	$: if (montada) document.documentElement.dataset.theme = tema === 'oscuro' ? 'dark' : 'light';

	function probarGuardado() {
		estadoDemo = 'saving';
		setTimeout(() => (estadoDemo = 'saved'), 900);
	}

	/** @param {'primary' | 'danger' | 'permanent'} tone */
	async function preguntar(tone) {
		const ok = await askConfirm({
			title:
				tone === 'permanent'
					? '¿Borrar para siempre?'
					: tone === 'danger'
						? '¿Borrar esta nota?'
						: '¿Mandar el mail?',
			text:
				tone === 'permanent'
					? 'No tiene vuelta atrás.'
					: tone === 'danger'
						? 'La podés recuperar desde Actividad.'
						: 'Les llega a todes les que tienen entrada.',
			confirmLabel: tone === 'primary' ? 'Mandar' : 'Borrar',
			tone
		});
		respuesta = ok ? 'Elegiste confirmar.' : 'Elegiste cancelar.';
	}
</script>

<div
	class="galeria"
	class:kv-panel={superficie === 'panel'}
	class:sitio={superficie === 'sitio'}
	data-kv-estilo={MARCA}
>
	<header class="barra">
		<div class="titulo">
			<h1>Estilo</h1>
			<p>
				Los componentes compartidos de <code>$lib/components/ui</code>. Antes de crear uno nuevo,
				mirá esta página y preguntale a gorrite. Datos inventados; solo se ve en previews y en dev.
			</p>
		</div>
		<div class="controles">
			<Segmented
				label="Superficie"
				options={[
					{ value: 'panel', label: 'Panel' },
					{ value: 'sitio', label: 'Sitio' }
				]}
				bind:value={superficie}
			/>
			<Segmented
				label="Tema"
				options={[
					{ value: 'claro', label: 'Claro' },
					{ value: 'oscuro', label: 'Oscuro' }
				]}
				bind:value={tema}
			/>
			<Segmented
				label="Ancho"
				options={[
					{ value: 'compu', label: 'Compu' },
					{ value: 'celu', label: 'Celu' }
				]}
				bind:value={ancho}
			/>
		</div>
		{#if superficie === 'sitio' && tema === 'oscuro'}
			<p class="aviso-tema">
				El sitio público no tiene tema oscuro: el oscuro solo cambia las piezas del panel.
			</p>
		{/if}
		<nav class="indice" aria-label="Componentes">
			{#each SECCIONES as s (s.id)}<a href="#{s.id}">{s.nombre}</a>{/each}
		</nav>
	</header>

	<div class="marco" class:celu={ancho === 'celu'}>
		<!-- Button -->
		<Seccion seccion={seccion.button}>
			{#each superficie === 'panel' ? SOLO_PANEL : SITIO_Y_PANEL as s (s)}
				<div class:kv-panel={s === 'panel' && superficie === 'sitio'} class="sub">
					{#if superficie === 'sitio'}<h3 class="sub-titulo">
							{s === 'sitio' ? 'Sitio (.pill-btn)' : 'Panel (.kv-btn)'}
						</h3>{/if}
					<Estado label="Normal">
						<Button surface={s} icon={Save}>Guardar</Button>
						<Button surface={s} variant="secondary" icon={Copy}>Duplicar</Button>
						<Button surface={s} variant="danger" icon={Trash2}>Borrar</Button>
						<Button surface={s} variant="permanent" icon={TriangleAlert}>Borrar para siempre</Button
						>
					</Estado>
					<Estado label="Hover (forzado)">
						<Button surface={s} class="forzar-hover" icon={Save}>Guardar</Button>
						<Button surface={s} class="forzar-hover" variant="secondary" icon={Copy}
							>Duplicar</Button
						>
						<Button surface={s} class="forzar-hover" variant="danger" icon={Trash2}>Borrar</Button>
						<Button surface={s} class="forzar-hover" variant="permanent" icon={TriangleAlert}
							>Borrar para siempre</Button
						>
					</Estado>
					<Estado label="Foco (forzado)">
						<Button surface={s} class="forzar-foco" icon={Save}>Guardar</Button>
						<Button surface={s} class="forzar-foco" variant="secondary">Cancelar</Button>
					</Estado>
					<Estado label="Apagado">
						<Button surface={s} disabled icon={Save}>Guardar</Button>
						<Button surface={s} variant="secondary" disabled>Cancelar</Button>
						<Button surface={s} busy disabled>Guardando…</Button>
					</Estado>
					<Estado label="Chico">
						<Button surface={s} size="small" icon={Plus}>Agregar</Button>
						<Button surface={s} size="small" variant="secondary">Ver más</Button>
						<Button surface={s} size="small" variant="danger" icon={Trash2}>Sacar</Button>
					</Estado>
					<Estado label="Solo ícono">
						<Button surface={s} iconOnly icon={Pencil} label="Editar" />
						<Button surface={s} iconOnly variant="secondary" icon={Copy} label="Duplicar" />
						<Button
							surface={s}
							iconOnly
							size="small"
							variant="danger"
							icon={Trash2}
							label="Borrar"
						/>
					</Estado>
					<Estado label="Link">
						<Button variant="link" icon={ExternalLink} href="/estilo#button">Ver la página</Button>
						<Button variant="link" icon={Undo2} class="forzar-hover">Deshacer (hover)</Button>
					</Estado>
				</div>
			{/each}
		</Seccion>

		<!-- TagChip y Chip -->
		<Seccion seccion={seccion.chip}>
			<Estado label="Etiquetas">
				<TagChip tag="cabaret" />
				<TagChip tag="gratis" />
				<TagChip tag="a la gorra" />
				<TagChip tag="Online" />
				<TagChip tag="español" />
			</Estado>
			<Estado label="Elegida">
				<TagChip tag="cabaret" selected />
				<TagChip tag="gratis" selected />
				<TagChip tag="español" selected />
			</Estado>
			<Estado label="Link (hover forzado)">
				<TagChip tag="cabaret" href="/estilo#chip" />
				<span class="forzar-hover"><TagChip tag="gratis" href="/estilo#chip" /></span>
			</Estado>
			<Estado label="Chip simple">
				<Chip>Este mes</Chip>
				<Chip color="var(--2)">Con lugar</Chip>
				<Chip pressable selected={chipElegido} on:click={() => (chipElegido = !chipElegido)}
					>Tocame ({chipElegido ? 'elegido' : 'sin elegir'})</Chip
				>
				<Chip selected>Elegido</Chip>
			</Estado>
		</Seccion>

		<div class="kv-panel-anidado" class:kv-panel={superficie === 'sitio'}>
			<!-- Tabs -->
			<Seccion seccion={seccion.tabs}>
				<Estado label="Normal">
					<div class="fondo">
						<Tabs tabs={TABS} current="/estilo#ordenes" label="Ficha del evento" />
					</div>
				</Estado>
				<Estado label="Hover (forzado)">
					<div class="fondo forzar-hover-tabs">
						<Tabs tabs={TABS} current="/estilo#resumen" label="Ficha del evento (hover)" />
					</div>
				</Estado>
			</Seccion>

			<!-- Badge -->
			<Seccion seccion={seccion.badge}>
				<Estado label="Tonos">
					<Badge>Borrador</Badge>
					<Badge tone="ok">Pagada</Badge>
					<Badge tone="warn">Por vencer</Badge>
					<Badge tone="bad">Agotadas</Badge>
					<Badge tone="info">Venta cerrada</Badge>
				</Estado>
				<Estado label="Llenas">
					<Badge filled tone="ok">Pagada</Badge>
					<Badge filled tone="bad">Agotadas</Badge>
					<Badge filled tone="info">Fondo Kinky Vibe</Badge>
				</Estado>
				<Estado label="Ícono propio">
					<Badge tone="info" icon={Ticket}>2 entradas</Badge>
					<Badge tone="ok" icon={CalendarDays}>Hoy</Badge>
				</Estado>
			</Seccion>

			<!-- Field -->
			<Seccion seccion={seccion.field}>
				<div class="grilla">
					<Field label="Tu nombre" bind:value={nombre} help="Como querés que te llamemos." />
					<Field label="Vacío" placeholder="Ej.: Persona de Prueba" />
					<div class="forzar-foco-campo">
						<Field label="Con foco (forzado)" value="Escribiendo…" />
					</div>
					<Field
						label="Email"
						type="email"
						bind:value={mail}
						error="Revisá el email: le falta la arroba."
					/>
					<Field label="Apagado" value="No se puede cambiar" disabled />
					<Field
						label="Buscar"
						type="search"
						placeholder="Buscar personas…"
						bind:value={busqueda}
					/>
					<Field
						label="Notas"
						type="textarea"
						placeholder="Algo para recordar…"
						bind:value={notas}
					/>
					<Field
						label="Grande (flujo de compra)"
						size="large"
						placeholder="Tu DNI"
						inputmode="numeric"
					/>
				</div>
				<p class="nota">
					<Search size={14} aria-hidden="true" /> El buscador va en píldora; los demás campos, rectángulo.
				</p>
			</Seccion>

			<!-- Checkbox -->
			<Seccion seccion={seccion.checkbox}>
				<Estado label="Estados">
					<Checkbox bind:checked={casilla} label="Marcada" />
					<Checkbox bind:checked={casillaNo} label="Sin marcar" />
					<Checkbox indeterminate label="A medias" />
					<Checkbox disabled label="Apagada" />
					<Checkbox checked disabled label="Marcada y apagada" />
				</Estado>
			</Seccion>

			<!-- Switch -->
			<Seccion seccion={seccion.switch}>
				<Estado label="Estados">
					<Switch
						label="Lo que sigo"
						onLabel="Prendido"
						offLabel="Apagado"
						bind:checked={interruptor}
						status="saved"
					/>
					<Switch
						label="Guardando"
						onLabel="Prendido"
						offLabel="Apagado"
						bind:checked={interruptorGuardando}
						status="saving"
					/>
					<Switch
						label="Con error"
						bind:checked={interruptorError}
						status="error"
						error="No se pudo guardar. Probá de nuevo."
					/>
					<Switch label="Apagado (no se puede tocar)" disabled />
				</Estado>
			</Seccion>
		</div>

		<!-- Segmented -->
		<Seccion seccion={seccion.segmented}>
			<Estado label="Normal">
				<Segmented
					label="Qué mostrar"
					options={[
						{ value: 'entradas', label: 'Entradas' },
						{ value: 'plata', label: 'Plata' }
					]}
					bind:value={vista}
				/>
			</Estado>
			<Estado label="Hover (forzado)">
				<div class="forzar-hover-seg">
					<Segmented
						label="Período (hover)"
						options={[
							{ value: 'dia', label: 'Día' },
							{ value: 'semana', label: 'Semana' },
							{ value: 'mes', label: 'Mes' }
						]}
						value="dia"
					/>
				</div>
			</Estado>
		</Seccion>

		<!-- ChoiceCard -->
		<Seccion seccion={seccion.choice}>
			<div class="grilla">
				<ChoiceCard
					name="pago"
					value="transferencia"
					title="Transferencia"
					text="Te pasamos los datos y tenés unas horas para pagar."
					bind:group={pago}
				/>
				<ChoiceCard
					name="pago"
					value="mercadopago"
					title="Mercado Pago"
					text="Pagás con tarjeta o dinero en cuenta."
					bind:group={pago}
				/>
				<ChoiceCard
					name="pago"
					value="efectivo"
					title="En la puerta (apagado)"
					text="Para este evento no se puede."
					disabled
					bind:group={pago}
				/>
			</div>
		</Seccion>

		<div class="kv-panel-anidado" class:kv-panel={superficie === 'sitio'}>
			<!-- Card -->
			<Seccion seccion={seccion.card}>
				<div class="grilla">
					<Card title="Lisa">Una tarjeta blanca, sin estado.</Card>
					<Card title="Con acciones" icon={Ticket}>
						<Button slot="actions" size="small" variant="secondary">Ver todo</Button>
						Las acciones van a la derecha del título.
					</Card>
					<Card title="Estado: ok" status="ok">Todo en orden.</Card>
					<Card title="Estado: aviso" status="warn">Faltan datos del lugar.</Card>
					<Card title="Estado: error" status="error">No se pudo mandar el mail.</Card>
					<Card title="Llena (destacar)" status="info" filled
						>Hay 1 transferencia esperando confirmación.</Card
					>
				</div>
			</Seccion>

			<!-- Notice -->
			<Seccion seccion={seccion.notice}>
				<Notice>Guardado ✓</Notice>
				<Notice tone="warn">El evento todavía no tiene lugar.</Notice>
				<Notice tone="error">No se pudo guardar: revisá tu conexión.</Notice>
				<UndoToast message="Sacaste a Persona de Prueba de la lista." />
				<UndoToast message="No se pudo deshacer." error canUndo={false} />
			</Seccion>

			<!-- EmptyState -->
			<Seccion seccion={seccion.empty}>
				<div class="grilla">
					<Card padded={false}>
						<EmptyState
							icon={Inbox}
							title="No hay órdenes todavía"
							text="Cuando alguien compre, aparece acá."
						/>
					</Card>
					<Card padded={false}>
						<EmptyState
							icon={CalendarDays}
							title="Sin eventos este mes"
							text="Probá con el mes que viene."
						>
							<Button size="small" icon={Plus}>Crear evento</Button>
						</EmptyState>
					</Card>
				</div>
			</Seccion>

			<!-- Dialog -->
			<Seccion seccion={seccion.dialog}>
				<!-- El panel lo monta una vez en su layout; acá, para que askConfirm lo use. -->
				<ConfirmDialog />
				<Estado label="Maqueta">
					<Dialog inline title="¿Borrar esta nota?" icon={Trash2} tone="danger">
						<p>La podés recuperar desde Actividad.</p>
						<svelte:fragment slot="buttons">
							<Button variant="secondary">Cancelar</Button>
							<Button variant="danger" icon={Trash2}>Borrar</Button>
						</svelte:fragment>
					</Dialog>
				</Estado>
				<Estado label="Probá">
					<Button variant="secondary" on:click={() => preguntar('primary')}
						>askConfirm primary</Button
					>
					<Button variant="secondary" on:click={() => preguntar('danger')}>askConfirm danger</Button
					>
					<Button variant="secondary" on:click={() => preguntar('permanent')}
						>askConfirm permanent</Button
					>
					<Button variant="secondary" on:click={() => (dialogoAbierto = true)}>Dialog propio</Button
					>
					{#if respuesta}<span class="nota" role="status">{respuesta}</span>{/if}
				</Estado>
				<Dialog bind:open={dialogoAbierto} title="Un diálogo propio" icon={Pencil}>
					<p>Con contenido a medida. Escape lo cierra.</p>
					<svelte:fragment slot="buttons">
						<Button on:click={() => (dialogoAbierto = false)}>Listo</Button>
					</svelte:fragment>
				</Dialog>
			</Seccion>

			<!-- Sheet -->
			<Seccion seccion={seccion.sheet}>
				<Estado label="Maqueta">
					<div class="hoja-maqueta">
						<Sheet inline title="Filtros">
							<Checkbox checked label="Solo con entradas" />
							<Checkbox label="Incluir pasados" />
						</Sheet>
					</div>
				</Estado>
				<Estado label="Probá">
					<Button variant="secondary" on:click={() => (hojaAbierta = true)}>Abrir la hoja</Button>
				</Estado>
				<Sheet bind:open={hojaAbierta} title="Una hoja">
					<p>En el celu, arrastrá el encabezado hacia abajo o tocá la X.</p>
				</Sheet>
			</Seccion>

			<!-- PageHeader -->
			<Seccion seccion={seccion.pageheader}>
				<Estado label="Simple">
					<div class="ancho">
						<PageHeader title="Personas" subtitle="La comunidad que pasó por los eventos.">
							<svelte:fragment slot="actions">
								<Button variant="secondary" icon={Copy}>Exportar</Button>
								<Button icon={Plus}>Agregar</Button>
							</svelte:fragment>
						</PageHeader>
					</div>
				</Estado>
				<Estado label="Con imagen">
					<div class="ancho">
						<PageHeader
							title="Noche de prueba"
							subtitle="vie 2 oct · 22:00"
							back={{ href: '/estilo#pageheader', label: 'Eventos' }}
							image="/android-chrome-192x192.png"
						>
							<svelte:fragment slot="meta">
								<Badge tone="ok">Publicado</Badge>
								<TagChip tag="cabaret" />
							</svelte:fragment>
							<svelte:fragment slot="actions">
								<Button variant="secondary" icon={ExternalLink}>Ver página</Button>
								<Button variant="secondary" icon={Copy}>Duplicar</Button>
							</svelte:fragment>
						</PageHeader>
					</div>
				</Estado>
				<Estado label="Sin imagen (ícono)">
					<div class="ancho">
						<PageHeader title="Taller sin imagen" subtitle="Sin fecha" icon={CalendarDays}>
							<svelte:fragment slot="meta"><Badge>Borrador</Badge></svelte:fragment>
						</PageHeader>
					</div>
				</Estado>
			</Seccion>

			<!-- SaveStatus -->
			<Seccion seccion={seccion.savestatus}>
				<Estado label="Estados">
					<SaveStatus status="saving" />
					<SaveStatus status="saved" />
					<SaveStatus status="error" error="No se pudo guardar. Probá de nuevo." />
				</Estado>
				<Estado label="Probá">
					<Button size="small" variant="secondary" on:click={probarGuardado}>Guardar algo</Button>
					<SaveStatus status={estadoDemo} />
				</Estado>
			</Seccion>

			<!-- Table -->
			<Seccion seccion={seccion.table}>
				<Table caption="Órdenes de prueba" columns={COLUMNAS} rows={FILAS} rowKey="orden" />
				<Table caption="Vacía" columns={COLUMNAS} rows={[]} empty="Todavía no hay órdenes." />
			</Seccion>
		</div>
	</div>
</div>

<style>
	.galeria {
		background: var(--bg);
		color: var(--text, var(--ink));
		min-height: 100vh;
		padding: var(--space-s) var(--space-xs) var(--space-xl);
		box-sizing: border-box;
	}
	.barra {
		max-width: 75rem;
		margin: 0 auto var(--space-s);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	h1 {
		margin: 0;
		font-size: var(--text-2xl);
	}
	.titulo p {
		margin: var(--space-3xs) 0 0;
		color: var(--muted);
		max-width: 50rem;
	}
	.controles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	.aviso-tema {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.indice {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
		font-size: var(--text-sm);
	}
	.indice a {
		color: var(--link, var(--2-dark));
	}
	.marco {
		container: galeria / inline-size;
		max-width: 75rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.marco.celu {
		max-width: 390px;
		outline: 1px solid var(--line);
		outline-offset: var(--space-2xs);
		border-radius: var(--radius-l);
	}
	/* Las secciones que solo tienen el aspecto del panel, dentro de un .kv-panel en «Sitio». */
	.kv-panel-anidado {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
		min-width: 0;
	}
	.kv-panel-anidado.kv-panel,
	.sub.kv-panel {
		min-height: 0;
		background: transparent;
	}
	.sub {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}
	.sub-titulo {
		margin: 0;
		font-size: var(--text-sm);
	}
	.grilla {
		display: grid;
		gap: var(--space-xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		align-items: start;
	}
	.fondo {
		background: var(--bg);
		border-radius: var(--radius-m);
		padding: var(--space-3xs) var(--space-2xs);
		min-width: 0;
		max-width: 100%;
	}
	.ancho {
		width: 100%;
		min-width: 0;
	}
	.hoja-maqueta {
		background: var(--scrim, var(--bg));
		border-radius: var(--radius-m);
		padding: var(--space-s) var(--space-2xs) 0;
		width: 100%;
		max-width: 34rem;
	}
	.nota {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	code {
		background: var(--surface-2, var(--hover));
		border-radius: var(--radius-s);
		padding: 0 var(--space-3xs);
	}

	/* Estados forzados: lo mismo que hace el navegador con :hover y :focus-visible, con una clase,
	   para verlos sin pasar el mouse. */
	.galeria :global(.kv-btn.forzar-hover),
	.galeria :global(.pill-btn.forzar-hover) {
		background: var(--btn-bg-hover);
		color: var(--btn-ink);
	}
	.galeria :global(.kv-btn.ghost.forzar-hover) {
		color: var(--accent-text);
	}
	.galeria :global(.pill-btn.ghost.forzar-hover) {
		color: var(--1-ink);
	}
	.galeria :global(.kv-link.forzar-hover) {
		text-decoration-thickness: 2px;
	}
	.galeria :global(.forzar-hover .kv-tag) {
		text-decoration: underline;
	}
	.galeria :global(.forzar-foco) {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.galeria.kv-panel :global(.forzar-foco) {
		outline: 2px solid var(--link);
	}
	.galeria :global(.forzar-foco-campo input) {
		outline: 2px solid var(--focus-field);
		outline-offset: 0;
		border-color: var(--focus-field);
	}
	.galeria :global(.forzar-hover-tabs a.tab:not(.on)) {
		background: color-mix(in srgb, var(--surface) 55%, transparent);
	}
	.galeria :global(.forzar-hover-seg .kv-segmented > button:nth-child(2)) {
		background: var(--bad-bg, var(--1-tint));
	}
</style>
