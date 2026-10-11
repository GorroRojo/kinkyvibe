<script>
	/**
	 * Borrador de los términos y condiciones (docs/legales.md). Las reglas de cuentas y perfiles
	 * salen de docs/cuentas.md y docs/amigues.md: si cambian, este texto se actualiza en el mismo PR.
	 */
	import Legal from './Legal.svelte';
	import Revisar from './Revisar.svelte';
	import { DEFAULT_CONTACT_EMAIL } from '$lib/utils/tickets.js';

	export let slug = '';
	/** @type {readonly import('./paginas.js').PaginaLegal[]} */
	export let paginas = [];

	const contacto = DEFAULT_CONTACT_EMAIL;

	const secciones = [
		{ id: 'que-es', titulo: 'Qué es Kinky Vibe' },
		{ id: 'edad', titulo: 'Solo para mayores de 18' },
		{ id: 'cuentas', titulo: 'Tu cuenta' },
		{ id: 'perfiles', titulo: 'Perfiles de la comunidad' },
		{ id: 'contenido', titulo: 'De quién es lo que se publica' },
		{ id: 'uso', titulo: 'Lo que no se puede hacer' },
		{ id: 'entradas', titulo: 'Entradas, propinas y el Fondo' },
		{ id: 'responsabilidad', titulo: 'Lo que el sitio no garantiza' },
		{ id: 'baja', titulo: 'Si no se respetan estas reglas' },
		{ id: 'cambios', titulo: 'Cambios y ley aplicable' }
	];
</script>

<Legal titulo="Términos y condiciones" {slug} {paginas} {secciones}>
	<p>
		Estas son las reglas para usar kinkyvibe.ar. Las escribimos lo más claro que pudimos: si algo no
		se entiende, escribinos a <a href="mailto:{contacto}">{contacto}</a>. Usar el sitio quiere decir
		que estás de acuerdo con ellas, con la <a href="/legales/privacidad">política de privacidad</a>
		y, si comprás una entrada, con la <a href="/legales/entradas">política de entradas</a>.
	</p>
	<Revisar>
		datos de quien ofrece el servicio (nombre o razón social, CUIT y domicilio), que la Ley 24.240
		de Defensa del Consumidor pide que estén a la vista.
	</Revisar>

	<section id="que-es">
		<h2>Qué es Kinky Vibe</h2>
		<p>
			Un espacio de educación y comunidad cuir sobre sexualidades, kink y BDSM: un calendario de
			talleres y eventos (propios y de otres), material, una wiki, un directorio de amigues
			(personas, proyectos y lugares) y la venta de entradas para algunos eventos.
		</p>
		<p>
			Lo que hay en el sitio es para aprender y encontrarnos. No reemplaza la consulta con
			profesionales de la salud, y cada quien es responsable de sus prácticas, con consentimiento y
			cuidado.
		</p>
	</section>

	<section id="edad">
		<h2>Solo para mayores de 18</h2>
		<p>
			El sitio y los eventos son para personas de 18 años o más. Al entrar te lo preguntamos, al
			comprar lo confirmás, y en la puerta se puede pedir documento.
		</p>
	</section>

	<section id="cuentas">
		<h2>Tu cuenta</h2>
		<ul>
			<li>La cuenta es opcional: para mirar el sitio o comprar entradas no hace falta.</li>
			<li>
				Entrás con un código que te mandamos al mail o con tu contraseña. Cuidá el acceso a tu mail:
				quien lo tenga puede entrar a tu cuenta.
			</li>
			<li>Una cuenta es de una persona. No uses el mail de otra persona sin su permiso.</li>
			<li>
				La podés borrar cuando quieras desde Mi rincón. Qué se borra y qué queda está en la
				<a href="/legales/privacidad#tiempo">política de privacidad</a>.
			</li>
		</ul>
	</section>

	<section id="perfiles">
		<h2>Perfiles de la comunidad</h2>
		<ul>
			<li>
				Crear perfiles (de persona, de proyecto o de lugar) es un permiso que da el equipo. Cada
				perfil nuevo aparece en el sitio recién cuando el equipo lo aprueba.
			</li>
			<li>
				Un perfil de persona es tuyo. Uno de proyecto lo pueden manejar varias cuentas; siempre
				queda al menos une dueñe. Quien maneja un perfil no se muestra nunca.
			</li>
			<li>
				Un proyecto te puede invitar a figurar como integrante; aparecés recién si aceptás, y te
				podés ir con un clic cuando quieras.
			</li>
			<li>
				Si un perfil público es sobre vos y no lo cargaste vos, podés pedir hacerte cargo con «Es mi
				perfil» o escribirnos para que lo corrijamos o lo saquemos.
			</li>
			<li>
				Si cargás un lugar, elegís cuánto de la dirección se muestra. Cargá solo direcciones que
				tengas derecho a publicar.
			</li>
		</ul>
		<Revisar>
			criterios para aprobar, ocultar o borrar un perfil (hoy lo decide el equipo caso por caso) y
			si se avisa a la persona cuando se rechaza o se oculta.
		</Revisar>
	</section>

	<section id="contenido">
		<h2>De quién es lo que se publica</h2>
		<ul>
			<li>
				Los textos, el material y las imágenes de Kinky Vibe son de Kinky Vibe y de sus autores. Si
				querés usar algo, citá la fuente y, si es para algo más que compartirlo, preguntanos.
			</li>
			<li>
				Lo que escribís en tu perfil sigue siendo tuyo. Al publicarlo nos das permiso para mostrarlo
				en el sitio (y en sus avisos, como el calendario o el bot de Telegram) mientras el perfil
				exista.
			</li>
			<li>
				Lo que publiques tiene que ser tuyo o tener permiso: no subas fotos ni datos de otras
				personas sin su consentimiento.
			</li>
		</ul>
		<Revisar>
			qué licencia tiene el material (¿todos los derechos reservados? ¿Creative Commons?) y qué pasa
			con el contenido de les autores invitades y de los eventos de otres organizadores. El código
			del sitio está en un repositorio público: aclarar si su licencia es distinta de la del
			contenido.
		</Revisar>
	</section>

	<section id="uso">
		<h2>Lo que no se puede hacer</h2>
		<ul>
			<li>
				Publicar datos, fotos o capturas de otras personas sin su consentimiento, o exponer a
				alguien (por ejemplo, decir dónde vive o con quién juega).
			</li>
			<li>
				Discursos de odio: patologizantes, capacitistas, cisexistas, transodiantes, clasistas,
				gordodiantes, racistas, fascistas o kinkshameros.
			</li>
			<li>Acosar, amenazar o mandar mensajes a quien no quiere recibirlos.</li>
			<li>Hacerte pasar por otra persona, proyecto o lugar.</li>
			<li>
				Usar el sitio para publicidad que no pediste, para estafas o para cualquier cosa ilegal,
				incluido cualquier contenido sexual con menores.
			</li>
			<li>
				Intentar romper el sitio, saltear sus límites, entrar a cuentas ajenas o juntar datos de
				forma automática.
			</li>
		</ul>
		<p>
			Para cómo nos tratamos en los eventos y en la comunidad, mirá el
			<a href="/legales/convivencia">código de convivencia</a>.
		</p>
	</section>

	<section id="entradas">
		<h2>Entradas, propinas y el Fondo</h2>
		<p>
			Las condiciones de compra, las reservas, los cambios de titular y las devoluciones están en la
			<a href="/legales/entradas">política de entradas y devoluciones</a>. Las propinas van al Fondo
			KinkyVibe.
		</p>
		<Revisar>
			eventos de otres organizadores: ¿quién responde por el evento y por las devoluciones cuando
			Kinky Vibe solo lo difunde o vende sus entradas? Dejarlo escrito antes de vender entradas de
			eventos ajenos.
		</Revisar>
	</section>

	<section id="responsabilidad">
		<h2>Lo que el sitio no garantiza</h2>
		<ul>
			<li>
				Tratamos de que la información de los eventos esté al día, pero la de eventos de otres
				organizadores la carga cada quien: ante la duda, consultales.
			</li>
			<li>
				El sitio puede estar caído un rato o tener errores. Si algo de una compra salió mal,
				escribinos y lo resolvemos.
			</li>
			<li>Los links a otros sitios no son nuestros y no respondemos por lo que hay ahí.</li>
		</ul>
		<Revisar>
			alcance de la responsabilidad del sitio (por los eventos, por los perfiles que carga la
			comunidad, por los sitios enlazados). La Ley de Defensa del Consumidor no deja limitar ciertas
			responsabilidades: redactarlo con une abogade.
		</Revisar>
	</section>

	<section id="baja">
		<h2>Si no se respetan estas reglas</h2>
		<p>
			Podemos ocultar o borrar lo publicado, sacar el permiso de tener perfiles o cerrar una cuenta.
			Si se puede, te vamos a avisar y explicar por qué, y podés responder. Preferimos hablar antes
			que castigar.
		</p>
		<Revisar>
			quién decide, cómo se avisa y si hay instancia de revisión. Conviene que sea el mismo proceso
			que el del código de convivencia.
		</Revisar>
	</section>

	<section id="cambios">
		<h2>Cambios y ley aplicable</h2>
		<p>
			Si cambiamos estas reglas, lo avisamos en el sitio antes de que empiecen a valer. Se rigen por
			las leyes de la República Argentina.
		</p>
		<Revisar>
			fecha de vigencia, jurisdicción (tribunales de qué ciudad) y si hace falta el «botón de
			arrepentimiento» de la Resolución 424/2020 por vender entradas en línea.
		</Revisar>
	</section>
</Legal>
