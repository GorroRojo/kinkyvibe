<script>
	/**
	 * Prototipo «Lista de espera» (/estilo/prototipos/lista-de-espera): qué pasa cuando un evento
	 * se agota (docs/entradas.md: «Cortar la venta», `status: agotadas` o cupo lleno; decisión 0006:
	 * «Lista de espera: configurable por evento»). Cuatro partes: la caja de entradas agotada con
	 * «Avisame si se libera un lugar», el estado de anotade, el aviso por mail o Telegram cuando se
	 * libera un lugar y, en el panel, la lista por evento con «Ofrecer lugar».
	 *
	 * Todo es estado local (la cola sale de ./espera.js), con un evento y personas inventadas: no
	 * hay tabla, ni mails, ni Telegram. Solo en previews y en dev.
	 */
	import '$lib/admin/panel.scss';
	import { Bell, BellOff, Clock, Hourglass, Mail, Send, Ticket } from '@lucide/svelte';
	import { Badge, Button, Card, Notice, Segmented, askConfirm } from '$lib/components/ui';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Marco from '../Marco.svelte';
	import ParaDecidir from '../ParaDecidir.svelte';
	import { comprar, liberarLugar, numero, ofrecer, vencerOfertas } from './espera.js';

	// Evento inventado.
	const EVENTO = {
		titulo: 'Fiesta de ejemplo',
		cuando: 'sábado 14 de noviembre · 22 h',
		donde: 'Lugar Inventado',
		cupo: 40,
		precio: '$ 8.000'
	};
	const HORAS = 24;
	const VENCE = 'viernes 13/11 a las 21:40';

	// ——— Público: la caja de entradas ———
	/** @type {'agotadas' | 'form' | 'anotade' | 'lugar' | 'afuera'} */
	let publico = 'agotadas';
	let conCuenta = 'si';
	let mail = 'persona.de.prueba@example.invalid';
	let telegram = true;
	const NUMERO = 4;
	$: if (conCuenta === 'no' && mail === 'persona.de.prueba@example.invalid') mail = '';
	$: if (conCuenta === 'si' && !mail) mail = 'persona.de.prueba@example.invalid';
	$: mailError = publico === 'form' && enviado && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail);
	let enviado = false;
	function anotarme() {
		enviado = true;
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return;
		publico = 'anotade';
		enviado = false;
	}
	const PASOS = [
		{ value: 'agotadas', label: 'Agotadas' },
		{ value: 'anotade', label: 'Anotade' },
		{ value: 'lugar', label: 'Se liberó' }
	];
	$: paso = publico === 'form' || publico === 'afuera' ? 'agotadas' : publico;
	/** @param {string} v */
	function irA(v) {
		publico = /** @type {any} */ (v);
	}

	// ——— El aviso ———
	let canal = 'mail';

	// ——— Panel: la lista del evento ———
	const PERSONAS = [
		{ id: '1', nombre: 'Ejemplo Uno', pronombres: 'elle', contacto: 'mail', hace: 'hace 3 días' },
		{
			id: '2',
			nombre: 'Persona Inventada',
			pronombres: 'ella',
			contacto: 'telegram',
			hace: 'hace 3 días'
		},
		{
			id: '3',
			nombre: 'Nombre de Prueba',
			pronombres: 'él',
			contacto: 'mail',
			hace: 'hace 2 días'
		},
		{
			id: '4',
			nombre: 'Persona de Prueba',
			pronombres: 'elle',
			contacto: 'telegram',
			hace: 'ayer'
		},
		{ id: '5', nombre: 'Ejemplo Cinco', pronombres: 'ella', contacto: 'mail', hace: 'ayer' },
		{ id: '6', nombre: 'Ejemplo Seis', pronombres: 'él', contacto: 'mail', hace: 'hace 2 horas' }
	];
	const porId = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));
	/** @type {'de-a-une' | 'todes'} */
	let modo = 'de-a-une';
	/** @param {'de-a-une' | 'todes'} m @returns {import('./espera.js').Cola} */
	const nueva = (m) => ({
		modo: m,
		libres: 0,
		filas: PERSONAS.map((p) => ({ id: p.id, estado: /** @type {const} */ ('esperando') }))
	});
	let cola = nueva(modo);
	let ultimo = '';
	$: if (cola.modo !== modo) {
		cola = nueva(modo);
		ultimo = '';
	}
	/** Lugares ofrecidos por encima del cupo (con confirmación). */
	let extra = 0;
	$: enEspera = cola.filas.filter((f) => numero(cola.filas, f.id) !== null).length;
	$: guardados = cola.filas.filter((f) => f.estado === 'ofrecido').length;

	/** @param {string} id */
	async function ofrecerA(id) {
		const r = ofrecer(cola, id);
		if (r.pasaCupo) {
			const ok = await askConfirm({
				title: '¿Ofrecer un lugar que no está libre?',
				text: `El evento está completo (${EVENTO.cupo} de ${EVENTO.cupo}). Si ${porId[id].nombre} compra, entran ${EVENTO.cupo + 1}: pasa el cupo y queda en el registro de actividad.`,
				confirmLabel: 'Ofrecer igual',
				tone: 'primary'
			});
			if (!ok) return;
			extra++;
		}
		cola = r.cola;
		ultimo = `Le guardamos un lugar a ${porId[id].nombre} por ${HORAS} h y le avisamos por ${porId[id].contacto === 'telegram' ? 'Telegram' : 'mail'}.`;
	}
	function simularLibre() {
		cola = liberarLugar(cola);
		ultimo =
			modo === 'todes'
				? 'Se liberó un lugar: les avisamos a todes les que esperan. Compra quien llegue primero.'
				: 'Se liberó un lugar (venció una reserva): se lo guardamos a la próxima persona de la lista.';
	}
	function simularVence() {
		const antes = guardados;
		cola = vencerOfertas(cola);
		ultimo = antes
			? `Pasaron ${HORAS} h sin compra: el lugar pasó a la siguiente persona.`
			: 'No había lugares guardados.';
	}
	function simularCompra() {
		const f = cola.filas.find((x) => x.estado === 'ofrecido' || x.estado === 'avisade');
		if (!f) {
			ultimo = 'Nadie tiene un lugar ofrecido ahora.';
			return;
		}
		cola = comprar(cola, f.id);
		ultimo = `${porId[f.id].nombre} compró su entrada: sale de la lista.`;
	}

	/** @type {Record<string, { tone: any, texto: string }>} */
	const ESTADOS = {
		esperando: { tone: 'neutral', texto: 'Esperando' },
		ofrecido: { tone: 'warn', texto: `Lugar guardado · vence en ${HORAS} h` },
		avisade: { tone: 'info', texto: 'Avisade' },
		compro: { tone: 'ok', texto: 'Compró' },
		vencio: { tone: 'neutral', texto: 'Venció sin comprar' },
		salio: { tone: 'neutral', texto: 'Salió de la lista' }
	};
</script>

<Marco
	title="Lista de espera"
	explora="Qué ve la gente cuando se agotan las entradas, el aviso cuando se libera un lugar y la lista en el panel. Tocá los botones: nada se guarda ni se manda."
>
	<!-- 1. Página del evento -->
	<section class="parte" aria-labelledby="t-evento">
		<h2 id="t-evento" class="parte-titulo"><span>1</span>En la página del evento</h2>
		<div class="botones-paso" role="group" aria-label="Ir a un estado">
			{#each PASOS as p (p.value)}
				<button type="button" class:on={paso === p.value} on:click={() => irA(p.value)}
					>{p.label}</button
				>
			{/each}
		</div>

		<article class="evento">
			<div class="evento-img" aria-hidden="true"><Ticket size={36} /></div>
			<div>
				<h3>{EVENTO.titulo}</h3>
				<p class="evento-meta">{EVENTO.cuando} · {EVENTO.donde}</p>
			</div>
		</article>

		<section class="buy-cta" aria-label="Entradas">
			{#if publico === 'agotadas' || publico === 'afuera'}
				<p class="buy-closed">Agotadas.</p>
				{#if publico === 'afuera'}
					<p class="buy-when">Saliste de la lista. Si cambiás de idea, podés volver a anotarte.</p>
				{/if}
				<div class="espera-cta">
					<Button
						surface="sitio"
						variant="secondary"
						icon={Bell}
						on:click={() => (publico = 'form')}
					>
						Avisame si se libera un lugar
					</Button>
					<p class="buy-when">
						Si alguien no completa su compra o devuelve su entrada, te avisamos y tenés {HORAS} h para
						comprar.
					</p>
				</div>
			{:else if publico === 'form'}
				<p class="buy-closed">Agotadas.</p>
				<form class="espera-form" on:submit|preventDefault={anotarme} novalidate>
					<h4>Avisame si se libera un lugar</h4>
					<div class="cuenta">
						<span>En el prototipo:</span>
						<Segmented
							options={[
								{ value: 'si', label: 'Con cuenta' },
								{ value: 'no', label: 'Sin cuenta' }
							]}
							bind:value={conCuenta}
							label="Con o sin cuenta"
						/>
					</div>
					<label class="campo">
						<span>Tu mail</span>
						<input
							type="email"
							bind:value={mail}
							autocomplete="email"
							aria-invalid={mailError || undefined}
							aria-describedby={mailError ? 'mail-error' : undefined}
						/>
						{#if mailError}<span class="error" id="mail-error">Revisá el mail: le falta algo.</span
							>{/if}
					</label>
					{#if conCuenta === 'si'}
						<label class="casilla">
							<input type="checkbox" bind:checked={telegram} />
							Avisarme también por Telegram (tu cuenta ya lo tiene conectado)
						</label>
					{/if}
					<p class="letra-chica">
						Es una entrada por persona. Usamos tu mail solo para este aviso y lo borramos después
						del evento.
					</p>
					<div class="form-botones">
						<Button surface="sitio" variant="link" on:click={() => (publico = 'agotadas')}
							>Cancelar</Button
						>
						<Button surface="sitio" type="submit">Anotarme</Button>
					</div>
				</form>
			{:else if publico === 'anotade'}
				<p class="buy-closed">Agotadas.</p>
				<div class="anotade" role="status">
					<Hourglass size={28} aria-hidden="true" />
					<p class="anotade-titulo">Te anotamos, sos le número {NUMERO}</p>
					<p class="buy-when">
						Si se libera un lugar te avisamos a <strong>{mail}</strong
						>{#if conCuenta === 'si' && telegram}
							{' '}y por Telegram{/if}. Vas a tener {HORAS} h para comprar.
					</p>
					<Button
						surface="sitio"
						variant="link"
						icon={BellOff}
						on:click={() => (publico = 'afuera')}
					>
						Salir de la lista
					</Button>
				</div>
			{:else if publico === 'lugar'}
				<a class="buy-button" href="#entradas-prototipo" on:click|preventDefault>
					<span class="buy-title">Comprar mi entrada</span>
					<span class="buy-meta"
						>desde {EVENTO.precio} · <strong>Lugar guardado para vos</strong></span
					>
				</a>
				<p class="buy-when">
					<Clock size={14} aria-hidden="true" /> Hasta el {VENCE}. Después pasa a la próxima
					persona.
				</p>
				<Button surface="sitio" variant="link" on:click={() => (publico = 'afuera')}>
					Ya no puedo ir: pasarle el lugar a otre
				</Button>
			{/if}
		</section>
	</section>

	<!-- 2. El aviso -->
	<section class="parte" aria-labelledby="t-aviso">
		<h2 id="t-aviso" class="parte-titulo"><span>2</span>El aviso cuando se libera un lugar</h2>
		<div class="canal">
			<Segmented
				options={[
					{ value: 'mail', label: 'Mail' },
					{ value: 'telegram', label: 'Telegram' }
				]}
				bind:value={canal}
				label="Canal del aviso"
			/>
		</div>
		{#if canal === 'mail'}
			<article class="mail" aria-label="Ejemplo de mail">
				<header class="mail-head">
					<p><span>De:</span> KinkyVibe</p>
					<p><span>Para:</span> persona.de.prueba@example.invalid</p>
					<p class="asunto">Se liberó un lugar: tenés {HORAS} h para comprar</p>
				</header>
				<div class="mail-body">
					<p>Hola, Persona de Prueba:</p>
					<p>
						Se liberó un lugar para <strong>{EVENTO.titulo}</strong> ({EVENTO.cuando}, {EVENTO.donde})
						y te lo guardamos.
					</p>
					<p class="mail-plazo">Tenés hasta el <strong>{VENCE}</strong> para comprar tu entrada.</p>
					<p class="mail-cta"><span class="mail-btn">Comprar mi entrada</span></p>
					<p>
						Si ya no podés ir, tocá «Pasarle el lugar a otre» en el mismo link y le avisamos a la
						próxima persona.
					</p>
					<p class="mail-pie">
						Te llegó porque te anotaste en la lista de espera. Si no querés más avisos de este
						evento, salí de la lista.
					</p>
				</div>
			</article>
		{:else}
			<div class="tg" aria-label="Ejemplo de mensaje de Telegram">
				<p class="tg-de"><Send size={14} aria-hidden="true" /> Bot de KinkyVibe</p>
				<div class="tg-burbuja">
					<p><strong>Se liberó un lugar: tenés {HORAS} h para comprar</strong></p>
					<p>{EVENTO.titulo} · {EVENTO.cuando}</p>
					<p>Te lo guardamos hasta el {VENCE}.</p>
					<span class="tg-hora">21:40</span>
				</div>
				<div class="tg-botones">
					<span>Comprar mi entrada</span>
					<span>Pasarle el lugar a otre</span>
				</div>
			</div>
		{/if}
	</section>

	<!-- 3. El panel -->
	<section class="parte" aria-labelledby="t-panel">
		<h2 id="t-panel" class="parte-titulo"><span>3</span>En el panel: la lista del evento</h2>
		<div class="kv-panel panel">
			<ConfirmDialog />
			<Card title="Lista de espera" icon={Hourglass}>
				<p class="muted subtitulo">{EVENTO.titulo} · {EVENTO.cuando}</p>
				<dl class="numeros">
					<div>
						<dt>Cupo</dt>
						<dd>
							{EVENTO.cupo}{#if extra}<small> +{extra}</small>{/if}
						</dd>
					</div>
					<div>
						<dt>Libres</dt>
						<dd>{cola.libres}</dd>
					</div>
					<div>
						<dt>Guardados</dt>
						<dd>{guardados}</dd>
					</div>
					<div>
						<dt>En espera</dt>
						<dd>{enEspera}</dd>
					</div>
				</dl>
				<div class="modo">
					<span>Cuando se libera un lugar</span>
					<Segmented
						options={[
							{ value: 'de-a-une', label: `De a une (${HORAS} h)` },
							{ value: 'todes', label: 'A todes a la vez' }
						]}
						bind:value={modo}
						label="Cuando se libera un lugar"
					/>
				</div>

				<ol class="filas">
					{#each cola.filas as f (f.id)}
						{@const p = porId[f.id]}
						{@const n = numero(cola.filas, f.id)}
						<li class:fuera={n === null}>
							<span class="num" aria-label={n ? `número ${n}` : 'fuera de la lista'}
								>{n ?? '–'}</span
							>
							<span class="quien">
								<span><strong>{p.nombre}</strong> <span class="muted">({p.pronombres})</span></span>
								<span class="muted chico">
									{#if p.contacto === 'telegram'}<Send size={12} aria-hidden="true" /> Telegram y mail{:else}<Mail
											size={12}
											aria-hidden="true"
										/> Mail{/if} · se anotó {p.hace}
								</span>
							</span>
							<span class="accion">
								<Badge tone={ESTADOS[f.estado].tone}>{ESTADOS[f.estado].texto}</Badge>
								{#if f.estado === 'esperando' || f.estado === 'avisade'}
									<Button size="small" variant="secondary" on:click={() => ofrecerA(f.id)}>
										Ofrecer lugar
									</Button>
								{/if}
							</span>
						</li>
					{/each}
				</ol>

				{#if ultimo}
					<Notice compact>{ultimo}</Notice>
				{/if}

				<div class="probar">
					<p class="muted chico">Probar (en el sitio de verdad esto pasa solo):</p>
					<div class="probar-botones">
						<Button size="small" variant="secondary" on:click={simularLibre}
							>Se liberó un lugar</Button
						>
						<Button size="small" variant="secondary" on:click={simularVence}
							>Pasaron {HORAS} h</Button
						>
						<Button size="small" variant="secondary" on:click={simularCompra}>Alguien compró</Button
						>
						<Button
							size="small"
							variant="link"
							on:click={() => {
								cola = nueva(modo);
								extra = 0;
								ultimo = '';
							}}>Empezar de nuevo</Button
						>
					</div>
				</div>
			</Card>
		</div>
	</section>

	<ParaDecidir
		items={[
			{
				pregunta: '¿Cuánto tiempo para comprar?',
				propuesta: `${HORAS} h desde el aviso, o hasta que empieza el evento si falta menos. ¿Menos cerca de la fecha?`
			},
			{
				pregunta:
					'¿De a une, en orden, o a todes a la vez? (la decisión 0006 dice «configurable por evento»)',
				propuesta:
					'las dos, elegidas por evento en el panel; por defecto, de a une en orden de anotación.'
			},
			{
				pregunta: '¿El lugar queda guardado (nadie más lo puede comprar en esas horas)?',
				propuesta:
					'de a une, sí: es una reserva a nombre de esa persona; a todes, no: compra quien llega primero.'
			},
			{
				pregunta: '¿Aplica el descuento del Fondo? ¿Con qué precio compra?',
				propuesta:
					'el precio y el porcentaje del Fondo del momento en que compra, como cualquier compra (no el del día que se anotó). ¿Y si el lugar que se liberó era de una preventa más barata?'
			},
			{
				pregunta: '¿La lista es por evento o por tipo de entrada?',
				propuesta: 'por evento: se ofrece el tipo que se liberó.'
			},
			{
				pregunta: '¿Cuántas entradas puede pedir una persona?',
				propuesta: 'una por persona (como dicen las condiciones de compra).'
			},
			{
				pregunta: '¿Hace falta cuenta para anotarse?',
				propuesta:
					'no: alcanza el mail (¿con un mail para confirmarlo, para que nadie anote mails ajenos?).'
			},
			{
				pregunta: '¿El siguiente aviso sale solo o lo dispara une admin con «Ofrecer lugar»?',
				propuesta:
					'sale solo; «Ofrecer lugar» queda para elegir a mano (y pide confirmar si pasa el cupo).'
			},
			{
				pregunta: '¿Vender en la puerta respeta la lista o la saltea?'
			},
			{
				pregunta: '¿Qué guardamos y cuánto tiempo? (mail y Telegram de quien se anota)',
				propuesta: 'hasta que termina el evento, y después se borra.'
			}
		]}
	/>
</Marco>

<style>
	.parte {
		max-width: 40rem;
		margin: 0 auto var(--space-l);
	}
	.parte-titulo {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		margin: 0 0 var(--space-xs);
		font-size: var(--text-lg);
	}
	.parte-titulo span {
		display: inline-grid;
		place-items: center;
		width: 1.6em;
		height: 1.6em;
		border-radius: 50%;
		background: var(--2);
		color: white;
		font-size: var(--text-sm);
	}
	.botones-paso {
		display: flex;
		gap: var(--space-3xs);
		margin-bottom: var(--space-xs);
		overflow-x: auto;
	}
	.botones-paso button {
		flex: none;
		min-height: var(--tap);
		padding: 0 1em;
		font: inherit;
		font-size: var(--text-sm);
		border-radius: var(--radius-pill);
		border: 1px solid var(--2);
		background: var(--surface);
		color: var(--2-dark);
		cursor: pointer;
	}
	.botones-paso button.on {
		background: var(--2);
		color: white;
		font-weight: 700;
	}
	.canal {
		margin-bottom: var(--space-xs);
	}
	.evento {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin-bottom: var(--space-xs);
	}
	.evento-img {
		flex: none;
		display: grid;
		place-items: center;
		width: 4.5rem;
		height: 4.5rem;
		border-radius: var(--radius-m);
		background: var(--1-tint);
		color: var(--1);
	}
	.evento h3 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.evento-meta {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}
	/* La caja de entradas: el mismo aspecto que src/lib/components/evento/Compra.svelte. */
	.buy-cta {
		background: var(--surface);
		border-radius: var(--round);
		padding: var(--space-s);
		box-shadow: var(--shadow-1);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2xs);
	}
	.buy-closed {
		text-align: center;
		font-weight: 700;
		margin: 0;
	}
	.buy-when {
		text-align: center;
		margin: 0;
		font-size: var(--step--1);
		color: var(--muted);
	}
	.buy-button {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15em;
		padding: 0.8em 1.2em;
		border-radius: var(--round);
		background: var(--1);
		color: white;
		text-decoration: none;
		text-align: center;
		box-shadow: 0 0.2em 0.8em color-mix(in srgb, var(--1) 40%, transparent);
	}
	.buy-title {
		font-size: var(--step-2);
		font-weight: 700;
		line-height: 1.2;
	}
	.buy-meta {
		font-size: var(--step-0);
	}
	.espera-cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2xs);
	}
	.espera-form {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.espera-form h4 {
		margin: 0;
		font-size: var(--text-base);
		color: var(--1-ink);
	}
	.cuenta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		font-size: var(--text-xs);
		color: var(--muted);
		padding: var(--space-3xs) var(--space-2xs);
		border: 1px dashed var(--4-dark);
		border-radius: var(--radius-s);
	}
	.campo {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
		font-weight: 700;
	}
	.campo input {
		min-height: var(--tap);
		padding: 0 var(--space-2xs);
		border: 1px solid var(--field);
		border-radius: var(--radius-s);
		font: inherit;
		font-weight: 400;
		font-size: var(--text-field);
		background: var(--surface);
		color: var(--ink);
	}
	.campo input:focus {
		border-color: var(--focus-field);
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.campo input[aria-invalid] {
		border-color: var(--error);
	}
	.error {
		color: var(--error);
		font-weight: 400;
	}
	.casilla {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
		font-size: var(--text-sm);
	}
	.letra-chica {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.form-botones {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-xs);
	}
	.anotade {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2xs);
		text-align: center;
		color: var(--ink);
	}
	.anotade > :global(svg) {
		color: var(--2);
	}
	.anotade-titulo {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--2-dark);
	}
	/* El mail de ejemplo */
	.mail {
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-1);
		overflow: hidden;
		font-size: var(--text-sm);
	}
	.mail-head {
		padding: var(--space-2xs) var(--space-xs);
		border-bottom: 1px solid var(--line);
		background: var(--hover);
	}
	.mail-head p {
		margin: 0;
		color: var(--muted);
	}
	.mail-head span {
		display: inline-block;
		min-width: 3em;
	}
	.mail-head .asunto {
		margin-top: var(--space-3xs);
		color: var(--ink);
		font-weight: 700;
	}
	.mail-body {
		padding: var(--space-xs);
	}
	.mail-body p {
		margin: 0 0 var(--space-2xs);
	}
	.mail-plazo {
		padding: var(--space-2xs);
		background: var(--4-tint);
		border-radius: var(--radius-s);
	}
	.mail-cta {
		text-align: center;
	}
	.mail-btn {
		display: inline-block;
		padding: 0.6em 1.4em;
		border-radius: var(--radius-pill);
		background: var(--1);
		color: white;
		font-weight: 700;
	}
	.mail-pie {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	/* El mensaje de Telegram de ejemplo */
	.tg {
		background: color-mix(in srgb, var(--3-tint) 60%, var(--surface));
		border-radius: var(--radius-m);
		padding: var(--space-xs);
		font-size: var(--text-sm);
	}
	.tg-de {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: 0 0 var(--space-2xs);
		color: var(--muted);
	}
	.tg-burbuja {
		position: relative;
		max-width: 85%;
		padding: var(--space-2xs) var(--space-xs) var(--space-xs);
		background: var(--surface);
		border-radius: var(--radius-m) var(--radius-m) var(--radius-m) var(--radius-s);
		box-shadow: var(--shadow-1);
	}
	.tg-burbuja p {
		margin: 0 0 var(--space-3xs);
	}
	.tg-hora {
		position: absolute;
		right: var(--space-2xs);
		bottom: var(--space-3xs);
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.tg-botones {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		max-width: 85%;
		margin-top: var(--space-3xs);
	}
	.tg-botones span {
		padding: var(--space-2xs);
		text-align: center;
		border-radius: var(--radius-s);
		background: color-mix(in srgb, var(--3-dark) 20%, var(--surface));
		color: var(--3-ink);
		font-weight: 700;
	}
	/* Panel */
	.panel {
		padding: var(--space-xs);
		border-radius: var(--radius-m);
	}
	.subtitulo {
		margin: 0 0 var(--space-xs);
		font-size: var(--text-sm);
	}
	.numeros {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3xs);
		margin: 0 0 var(--space-xs);
		text-align: center;
	}
	.numeros div {
		padding: var(--space-3xs);
		background: var(--surface-2);
		border-radius: var(--radius-s);
	}
	.numeros dt {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.numeros dd {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 700;
	}
	.modo {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		margin-bottom: var(--space-xs);
		font-size: var(--text-sm);
		font-weight: 700;
	}
	.filas {
		list-style: none;
		margin: 0 0 var(--space-xs);
		padding: 0;
	}
	.filas li {
		display: grid;
		grid-template-columns: 2em 1fr;
		gap: var(--space-3xs) var(--space-2xs);
		padding: var(--space-2xs) 0;
		border-bottom: 1px solid var(--line);
	}
	.filas li.fuera {
		opacity: 0.65;
	}
	.num {
		grid-row: span 2;
		display: grid;
		place-items: center;
		width: 2em;
		height: 2em;
		border-radius: 50%;
		background: var(--link-bg);
		color: var(--link);
		font-weight: 700;
	}
	.quien {
		display: flex;
		flex-direction: column;
	}
	.accion {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
	}
	.muted {
		color: var(--muted);
		font-weight: 400;
	}
	.chico {
		font-size: var(--text-xs);
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
	}
	.probar {
		margin-top: var(--space-xs);
		padding-top: var(--space-2xs);
		border-top: 1px dashed var(--line);
	}
	.probar p {
		margin: 0 0 var(--space-3xs);
	}
	.probar-botones {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
</style>
