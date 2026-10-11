<script>
	/**
	 * El panel de mentira de los prototipos de navegación: un marco que se achica (anchos para
	 * simular compu, compu angosta, tablet y celu), la barra de arriba, el contenido (el mismo en
	 * las tres opciones, `Contenido.svelte`) y, en el celu, el header, la barra de abajo de hoy
	 * (Inicio, Eventos, Puerta, Ventas, Más) y la hoja «Más».
	 *
	 * Lo que cambia entre opciones: la barra lateral (slot `lateral`, recibe `estado`), qué hay en
	 * la barra de arriba (C suma «+ Crear» e «Ir a… ⌘K») y cómo se ve la hoja «Más».
	 *
	 * Se adapta con container queries (`@container pantalla`), no con el ancho de la ventana: así el
	 * selector de ancho simula una tablet en la compu. Los componentes de la barra lateral usan el
	 * mismo contenedor.
	 */
	import '$lib/admin/panel.scss';
	import '$lib/admin/panel-forms.scss';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		CalendarRange,
		ClipboardCheck,
		Ellipsis,
		History,
		House,
		Plus,
		ScanLine,
		Search,
		Ticket,
		X
	} from '@lucide/svelte';
	import logo from '../../../logo.png';
	import Contenido from './Contenido.svelte';
	import { CREAR, RECIENTES } from './datos.js';
	import { ANCHOS, enlace, leerEstado } from './estado.js';

	/** @type {'A' | 'B' | 'C'} */
	export let opcion;
	/** @type {import('./datos.js').Seccion[]} */
	export let secciones;
	/** @type {import('./datos.js').Pestana[]} */
	export let pestanasEvento;
	/** @type {import('./datos.js').Pestana[]} */
	export let pestanasEventoMas = [];
	/** @type {'siempre' | 'angosto'} */
	export let tabsArriba = 'siempre';
	/** Hoja «Más» del celu: lista de secciones (A, C) o grilla de tejas (B). */
	/** @type {'lista' | 'grilla'} */
	export let masModo = 'lista';

	$: estado = leerEstado($page.url);
	$: ancho = estado.w === 'auto' ? '' : `${estado.w}px`;
	$: puertaHref =
		opcion === 'C'
			? enlace(estado, { s: 'puerta', t: 'hoy' })
			: enlace(estado, { s: 'eventos', t: 'puerta' });
	$: enPuerta =
		estado.s === 'puerta' || (estado.s === 'eventos' && estado.t === 'puerta' && !estado.e);
	$: abajo = [
		{ id: 'inicio', label: 'Inicio', icon: House, href: enlace(estado, { s: 'inicio', t: '' }) },
		{
			id: 'eventos',
			label: 'Eventos',
			icon: CalendarRange,
			href: enlace(estado, { s: 'eventos', t: 'proximos' })
		},
		{ id: 'puerta', label: 'Puerta', icon: ScanLine, href: puertaHref },
		{ id: 'ventas', label: 'Ventas', icon: Ticket, href: enlace(estado, { s: 'ventas', t: '' }) }
	];
	$: enMas = secciones.filter((x) => !['inicio', 'eventos', 'puerta', 'ventas'].includes(x.id));
	/** @param {string} id */
	const activoAbajo = (id) =>
		id === 'puerta' ? enPuerta : estado.s === id && !(id === 'eventos' && enPuerta);

	let masAbierto = false;
	let crearAbierto = false;
	let irAbierto = false;
	let consulta = '';
	/** @type {HTMLInputElement | undefined} */
	let irInput;
	$: if (estado) {
		masAbierto = false;
		crearAbierto = false;
		irAbierto = false;
	}

	/**
	 * «Ir a…» (solo C): todas las páginas y las acciones, para buscar escribiendo.
	 * @type {{ label: string, donde: string, href: string }[]}
	 */
	$: comandos = [
		...CREAR.map((c) => ({
			label: `Crear: ${c.label}`,
			donde: 'Acción',
			href: enlace(estado, { s: c.s, t: c.t })
		})),
		{
			label: 'Marcar ingreso · Fiesta de Primavera',
			donde: 'Acción',
			href: enlace(estado, { s: 'puerta', t: 'hoy' })
		},
		{
			label: 'Órdenes · Fiesta de Primavera',
			donde: 'Evento',
			href: enlace(estado, { s: 'eventos', e: 'fiesta-primavera', et: 'ordenes' })
		},
		...secciones.flatMap((sec) =>
			sec.tabs.flatMap((t) =>
				t.partes
					? t.partes.map((p) => ({
							label: p.label,
							donde: `${sec.label} › ${t.label}`,
							href: enlace(estado, { s: sec.id, t: p.id })
						}))
					: [
							{
								label: sec.tabs.length > 1 ? t.label : sec.label,
								donde: sec.tabs.length > 1 ? sec.label : 'Sección',
								href: enlace(estado, { s: sec.id, t: t.id })
							}
						]
			)
		)
	];
	$: q = consulta.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
	$: resultados = (
		q
			? comandos.filter((c) =>
					`${c.label} ${c.donde}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)
				)
			: comandos.slice(0, 9)
	).slice(0, 9);

	async function abrirIr() {
		irAbierto = true;
		consulta = '';
		await tick();
		irInput?.focus();
	}

	/** @param {KeyboardEvent} e */
	function teclas(e) {
		if (e.key === 'Escape') {
			masAbierto = crearAbierto = irAbierto = false;
		}
		if (opcion === 'C' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			abrirIr();
		}
	}
	/** @param {SubmitEvent} e */
	function irPrimero(e) {
		e.preventDefault();
		if (resultados[0]) goto(resultados[0].href, { noScroll: true });
	}

	onMount(() => {
		window.addEventListener('keydown', teclas);
		return () => window.removeEventListener('keydown', teclas);
	});
</script>

<nav class="anchos" aria-label="Ancho para simular">
	<span>Ver en:</span>
	{#each ANCHOS as a (a.value)}
		<a
			href={enlace(estado, { w: a.value })}
			data-sveltekit-noscroll
			aria-current={estado.w === a.value ? 'true' : undefined}>{a.label}</a
		>
	{/each}
</nav>

<div class="kv-panel pantalla" style:max-width={ancho || null} data-sveltekit-noscroll>
	<div class="app">
		<aside class="lateral" aria-label="Barra lateral">
			<a class="logo" href={enlace(estado, { s: 'inicio', t: '' })}
				><img src={logo} alt="" width="28" height="28" /><span>Panel</span></a
			>
			<slot name="lateral" {estado} />
		</aside>

		<div class="main">
			<div class="arriba">
				{#if opcion === 'C'}
					<button type="button" class="buscar" on:click={abrirIr}>
						<Search size={18} aria-hidden="true" /><span>Ir a… o buscar</span><kbd>⌘K</kbd>
					</button>
				{:else}
					<span class="buscar falso"
						><Search size={18} aria-hidden="true" /><span>Buscar eventos, órdenes, personas…</span
						><kbd>/</kbd></span
					>
				{/if}
				<a class="revisar" href={enlace(estado, { s: 'ventas', t: 'transferencias' })}
					><ClipboardCheck size={18} aria-hidden="true" /><span class="txt">Para revisar</span><span
						class="count">2</span
					></a
				>
				{#if opcion === 'C'}
					<div class="crear">
						<button
							type="button"
							class="kv-btn"
							aria-expanded={crearAbierto}
							on:click={() => (crearAbierto = !crearAbierto)}
							><Plus size={18} aria-hidden="true" />Crear</button
						>
						{#if crearAbierto}
							<ul class="menu" role="list">
								{#each CREAR as c (c.id)}
									<li>
										<a href={enlace(estado, { s: c.s, t: c.t })}
											><svelte:component this={c.icon} size={18} aria-hidden="true" />{c.label}</a
										>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>

			<div class="celu-head">
				<a class="logo" href={enlace(estado, { s: 'inicio', t: '' })}
					><img src={logo} alt="" width="26" height="26" /><span>Panel</span></a
				>
				<span class="esp"></span>
				{#if opcion === 'C'}
					<button type="button" class="kv-btn icon ghost" aria-label="Ir a…" on:click={abrirIr}
						><Search size={20} aria-hidden="true" /></button
					>
					<button
						type="button"
						class="kv-btn icon"
						aria-label="Crear"
						aria-expanded={crearAbierto}
						on:click={() => (crearAbierto = !crearAbierto)}
						><Plus size={20} aria-hidden="true" /></button
					>
				{:else}
					<span class="kv-btn icon ghost" aria-hidden="true"><Search size={20} /></span>
				{/if}
				<a
					class="kv-btn icon ghost revisar-celu"
					aria-label="Para revisar (2)"
					href={enlace(estado, { s: 'ventas', t: 'transferencias' })}
					><ClipboardCheck size={20} aria-hidden="true" /><span class="count">2</span></a
				>
			</div>

			<main class="scroll">
				<Contenido {secciones} {estado} {pestanasEvento} {pestanasEventoMas} {tabsArriba} />
			</main>

			<nav class="abajo" aria-label="Barra de abajo">
				{#each abajo as b (b.id)}
					<a
						href={b.href}
						class:door={b.id === 'puerta'}
						class:on={activoAbajo(b.id)}
						aria-current={activoAbajo(b.id) ? 'page' : undefined}
						><span class="ti"><svelte:component this={b.icon} size={22} aria-hidden="true" /></span
						>{b.label}</a
					>
				{/each}
				<button type="button" class:on={masAbierto} on:click={() => (masAbierto = true)}
					><span class="ti"><Ellipsis size={22} aria-hidden="true" /></span>Más</button
				>
			</nav>
		</div>

		{#if masAbierto}
			<div class="velo" role="presentation" on:click={() => (masAbierto = false)}></div>
			<div class="hoja" role="dialog" aria-modal="true" aria-label="Más">
				<div class="hoja-head">
					<strong>Más</strong>
					<button
						type="button"
						class="kv-btn icon ghost"
						aria-label="Cerrar"
						on:click={() => (masAbierto = false)}><X size={20} aria-hidden="true" /></button
					>
				</div>
				{#if masModo === 'grilla'}
					<ul class="tejas" role="list">
						{#each secciones as sec (sec.id)}
							<li>
								<a
									href={enlace(estado, { s: sec.id, t: '' })}
									class:on={estado.s === sec.id}
									aria-current={estado.s === sec.id ? 'page' : undefined}
									><svelte:component this={sec.icon} size={24} aria-hidden="true" /><span
										>{sec.corto ?? sec.label}</span
									></a
								>
							</li>
						{/each}
					</ul>
				{:else}
					<ul class="filas" role="list">
						{#each enMas as sec (sec.id)}
							<li>
								<a
									href={enlace(estado, { s: sec.id, t: '' })}
									class:on={estado.s === sec.id}
									aria-current={estado.s === sec.id ? 'page' : undefined}
									><svelte:component this={sec.icon} size={22} aria-hidden="true" />{sec.label}</a
								>
							</li>
						{/each}
					</ul>
					{#if opcion === 'C'}
						<p class="rotulo"><History size={16} aria-hidden="true" />Recientes</p>
						<ul class="filas chicas" role="list">
							{#each RECIENTES as r (r.label)}
								<li><a href={enlace(estado, r)}>{r.label}</a></li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		{/if}

		{#if crearAbierto}
			<div class="velo solo-celu" role="presentation" on:click={() => (crearAbierto = false)}></div>
			<div class="hoja solo-celu" role="dialog" aria-modal="true" aria-label="Crear">
				<div class="hoja-head">
					<strong>Crear</strong>
					<button
						type="button"
						class="kv-btn icon ghost"
						aria-label="Cerrar"
						on:click={() => (crearAbierto = false)}><X size={20} aria-hidden="true" /></button
					>
				</div>
				<ul class="filas" role="list">
					{#each CREAR as c (c.id)}
						<li>
							<a href={enlace(estado, { s: c.s, t: c.t })}
								><svelte:component this={c.icon} size={22} aria-hidden="true" />{c.label}</a
							>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if irAbierto}
			<div class="velo" role="presentation" on:click={() => (irAbierto = false)}></div>
			<div class="paleta" role="dialog" aria-modal="true" aria-label="Ir a…">
				<form on:submit={irPrimero}>
					<Search size={20} aria-hidden="true" />
					<input
						bind:this={irInput}
						bind:value={consulta}
						class="kv-input"
						placeholder="Escribí una página, un evento o una acción («crear», «cobros»…)"
						aria-label="Ir a…"
					/>
				</form>
				<ul role="list">
					{#each resultados as r, i (r.label + r.donde)}
						<li>
							<a href={r.href} class:primero={i === 0}
								><span>{r.label}</span><span class="donde">{r.donde}</span></a
							>
						</li>
					{:else}
						<li class="nada">Nada con «{consulta}».</li>
					{/each}
				</ul>
				<p class="ayuda">Enter abre el primero · Esc cierra</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.anchos {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--space-3xs) var(--space-2xs);
		margin: var(--space-s) auto var(--space-2xs);
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.anchos a {
		padding: 0.1em 0.7em;
		border-radius: var(--radius-pill);
		border: 1px solid var(--line, #ddd);
		color: var(--2-dark);
		text-decoration: none;
	}
	.anchos a[aria-current] {
		background: var(--2);
		border-color: var(--2);
		color: white;
		font-weight: 700;
	}
	.pantalla {
		container: pantalla / inline-size;
		position: relative;
		margin: 0 auto;
		min-height: 0;
		height: 52rem;
		max-height: calc(100dvh - 2rem);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-3);
		overflow: hidden;
		font-size: var(--text-sm);
	}
	.app {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		height: 100%;
	}
	.lateral {
		background: var(--surface);
		border-right: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		padding: var(--space-xs) var(--space-2xs);
		overflow-y: auto;
		min-height: 0;
	}
	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		font-weight: 700;
		color: var(--link);
		text-decoration: none;
		padding: 0 var(--space-2xs);
	}
	.main {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}
	.arriba {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-2xs) var(--space-s);
		border-bottom: 1px solid var(--line);
		background: var(--bg);
	}
	.buscar {
		flex: 1;
		max-width: 30rem;
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border: 1px solid var(--field);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--placeholder);
		font: inherit;
		cursor: pointer;
		text-align: left;
	}
	.buscar span {
		flex: 1;
	}
	.buscar.falso {
		cursor: default;
	}
	kbd {
		font: inherit;
		font-size: var(--text-xs);
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		padding: 0 0.4em;
		color: var(--muted);
	}
	.revisar {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		font-weight: 700;
		color: var(--warn);
		text-decoration: none;
		padding: var(--space-3xs) var(--space-xs);
		border-radius: var(--radius-pill);
		background: var(--warn-bg);
	}
	.count {
		background: var(--counter);
		color: var(--counter-ink);
		font-size: var(--text-xs);
		font-weight: 700;
		border-radius: var(--radius-m);
		padding: 0 0.55em;
	}
	.crear {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + var(--space-3xs));
		z-index: 5;
		margin: 0;
		padding: var(--space-3xs);
		list-style: none;
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-2);
		min-width: 15rem;
	}
	.menu a,
	.filas a {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--round);
		color: var(--accent);
		font-weight: 700;
		text-decoration: none;
	}
	.menu a:hover,
	.filas a:hover {
		background: var(--surface-2);
	}
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-s);
		min-height: 0;
	}
	.celu-head,
	.abajo,
	.solo-celu {
		display: none;
	}

	/* Velo, hoja «Más» y paleta: dentro del marco, no de la ventana. */
	.velo {
		position: absolute;
		inset: 0;
		z-index: 8;
		background: var(--scrim);
	}
	.hoja {
		position: absolute;
		z-index: 9;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		width: min(26rem, 90%);
		background: var(--bg);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-3);
		padding: var(--space-xs) var(--space-s) var(--space-s);
	}
	.hoja-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2xs);
		font-size: var(--text-lg);
	}
	.filas,
	.tejas {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.filas {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.filas a {
		background: var(--surface);
		box-shadow: var(--shadow-1);
		padding: var(--space-xs);
	}
	.filas.chicas a {
		box-shadow: none;
		font-weight: 400;
		padding: var(--space-2xs) var(--space-xs);
	}
	.filas a.on,
	.tejas a.on {
		background: var(--link-bg);
		color: var(--link);
	}
	.rotulo {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: var(--space-xs) 0 var(--space-3xs);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.tejas {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-2xs);
	}
	.tejas a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3xs);
		padding: var(--space-xs) var(--space-3xs);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-1);
		color: var(--accent);
		font-weight: 700;
		font-size: var(--text-xs);
		text-decoration: none;
		text-align: center;
	}
	.paleta {
		position: absolute;
		z-index: 9;
		left: 50%;
		top: 12%;
		translate: -50% 0;
		width: min(36rem, 92%);
		background: var(--surface);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-3);
		padding: var(--space-xs);
	}
	.paleta form {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		color: var(--muted);
	}
	.paleta input {
		flex: 1;
	}
	.paleta ul {
		list-style: none;
		margin: var(--space-2xs) 0 0;
		padding: 0;
	}
	.paleta a {
		display: flex;
		justify-content: space-between;
		gap: var(--space-xs);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--round);
		color: var(--text);
		text-decoration: none;
	}
	.paleta a:hover,
	.paleta a.primero {
		background: var(--link-bg);
		color: var(--link);
	}
	.donde,
	.ayuda,
	.nada {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.nada {
		padding: var(--space-2xs) var(--space-xs);
	}
	.ayuda {
		margin: var(--space-2xs) 0 0;
		text-align: right;
	}

	/* Celu: sin barra lateral; header chico, barra de abajo y hojas que suben desde abajo. */
	@container pantalla (max-width: 699px) {
		.app {
			grid-template-columns: minmax(0, 1fr);
		}
		.lateral,
		.arriba {
			display: none;
		}
		.celu-head {
			display: flex;
			align-items: center;
			gap: var(--space-3xs);
			padding: var(--space-2xs) var(--space-xs);
			background: var(--bg);
		}
		.esp {
			flex: 1;
		}
		.revisar-celu {
			position: relative;
		}
		.revisar-celu .count {
			position: absolute;
			top: -0.2rem;
			right: -0.2rem;
		}
		.scroll {
			padding: var(--space-3xs) var(--space-xs) var(--space-m);
		}
		.abajo {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			background: var(--surface);
			padding: var(--space-3xs);
			box-shadow: var(--shadow-1);
		}
		.abajo a,
		.abajo button {
			position: relative;
			border: 0;
			background: none;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: flex-end;
			gap: 0.15rem;
			font: inherit;
			font-size: var(--text-xs);
			font-weight: 700;
			color: var(--accent);
			padding: var(--space-3xs) 0;
			min-height: 3.6rem;
			text-decoration: none;
			cursor: pointer;
		}
		.abajo .on {
			color: var(--link);
		}
		.ti {
			display: grid;
			place-items: center;
		}
		.door .ti {
			background: var(--accent);
			color: white;
			width: 3.3rem;
			height: 3.3rem;
			border-radius: 50%;
			margin-top: -1.5rem;
			box-shadow: var(--shadow-2);
		}
		.door.on .ti {
			background: var(--2);
		}
		.solo-celu {
			display: block;
		}
		.hoja {
			top: auto;
			bottom: 0;
			left: 0;
			translate: none;
			width: 100%;
			box-sizing: border-box;
			border-radius: var(--radius-l) var(--radius-l) 0 0;
			padding-bottom: var(--space-l);
		}
		.paleta {
			top: var(--space-xs);
		}
	}
</style>
