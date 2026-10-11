<script>
	/**
	 * Borrador de la política de privacidad (docs/legales.md). Describe lo que hace el código hoy:
	 * si cambia qué se guarda (docs/cuentas.md, tickets.md, analiticas.md, lo-que-sigo.md,
	 * telegram.md, amigues.md, mails.md), este texto se actualiza en el mismo PR.
	 */
	import Legal from './Legal.svelte';
	import Revisar from './Revisar.svelte';
	import { DEFAULT_CONTACT_EMAIL } from '$lib/utils/tickets.js';

	export let slug = '';
	/** @type {readonly import('./paginas.js').PaginaLegal[]} */
	export let paginas = [];

	const contacto = DEFAULT_CONTACT_EMAIL;

	const secciones = [
		{ id: 'quienes', titulo: 'Quiénes somos y a quién le escribís' },
		{ id: 'resumen', titulo: 'En corto' },
		{ id: 'datos', titulo: 'Qué datos guardamos y para qué' },
		{ id: 'navegador', titulo: 'Cookies y lo que queda en tu navegador' },
		{ id: 'terceros', titulo: 'Quién más procesa tus datos' },
		{ id: 'base-legal', titulo: 'Por qué podemos tratarlos' },
		{ id: 'tiempo', titulo: 'Cuánto tiempo los guardamos' },
		{ id: 'derechos', titulo: 'Tus derechos y cómo usarlos' },
		{ id: 'menores', titulo: 'Menores de 18' },
		{ id: 'seguridad', titulo: 'Cómo los cuidamos' },
		{ id: 'cambios', titulo: 'Cambios a esta política' }
	];
</script>

<Legal titulo="Política de privacidad" {slug} {paginas} {secciones}>
	<p>
		Kinky Vibe es un espacio de educación y comunidad sobre sexualidades, kink y BDSM. Sabemos que
		para muches de nosotres que se sepa que vamos a un taller o a una fiesta puede ser delicado, así
		que tratamos de guardar lo menos posible y de contarte, sin vueltas, qué guardamos, para qué y
		cómo pedir que lo borremos. Esta política sigue la Ley 25.326 de Protección de Datos Personales
		de Argentina.
	</p>

	<section id="quienes">
		<h2>Quiénes somos y a quién le escribís</h2>
		<p>
			Les responsables de los datos que se juntan en kinkyvibe.ar son quienes organizan Kinky Vibe.
			Para cualquier consulta sobre tus datos, escribinos a
			<a href="mailto:{contacto}">{contacto}</a>.
		</p>
		<Revisar>
			falta el nombre o la razón social de le responsable de la base de datos, su CUIT y un
			domicilio, como pide la ley. Decidir también si la base se inscribe en el Registro Nacional de
			Bases de Datos de la AAIP.
		</Revisar>
	</section>

	<section id="resumen">
		<h2>En corto</h2>
		<ul>
			<li>
				Para mirar el sitio <strong>no hace falta cuenta</strong> ni te pedimos datos. Las visitas se
				cuentan de forma anónima: sin tu IP, sin cookies y sin saber quién sos.
			</li>
			<li>
				Si comprás una entrada, te pedimos nombre, pronombres, mail y DNI, y el nombre y los
				pronombres de cada persona que va. Los usamos para mandarte las entradas, organizar el
				ingreso y avisarte de cambios.
			</li>
			<li>
				La cuenta («Mi rincón») es opcional. Guarda tu mail y, si querés, una contraseña, tus datos
				para la próxima compra, lo que seguís y tu chat de Telegram. La podés borrar cuando quieras.
			</li>
			<li>No vendemos tus datos ni los usamos para publicidad.</li>
			<li>
				Usamos algunos servicios de afuera para que el sitio funcione (Cloudflare, Resend, Mercado
				Pago, Telegram). Te contamos cuáles y para qué.
			</li>
		</ul>
	</section>

	<section id="datos">
		<h2>Qué datos guardamos y para qué</h2>

		<h3>Cuando mirás el sitio</h3>
		<ul>
			<li>
				<strong>Visitas anónimas.</strong> Por cada página que se ve anotamos la página, de qué sitio
				llegaste (solo el dominio, por ejemplo instagram.com), el país, si es celu, tablet o compu y,
				en los eventos, en qué paso de la compra quedó la visita. No guardamos tu IP, tu navegador, cookies,
				tu cuenta ni nada que te identifique. Lo usamos para saber qué se lee y si la compra de entradas
				funciona bien.
			</li>
			<li>
				<strong>Límites contra el abuso.</strong> Para frenar ataques (por ejemplo, alguien que prueba
				miles de códigos), contamos los intentos por conexión con una huella de tu IP (un hash) que cambia
				todos los días. La IP en sí no se guarda y esos contadores duran como mucho 24 horas.
			</li>
		</ul>
		<Revisar>
			además de las visitas anónimas, el sitio carga el script de Cloudflare Web Analytics.
			Confirmar con la documentación de Cloudflare qué junta (dice no usar cookies) y si se deja o
			se saca. Confirmar también qué guardan los registros técnicos (logs) del servidor en
			Cloudflare y por cuánto tiempo.
		</Revisar>

		<h3>Cuando comprás una entrada</h3>
		<ul>
			<li>
				<strong>De quien compra:</strong> nombre, pronombres, mail y DNI. Del mail van las entradas, los
				recordatorios, el aviso si cambia la fecha y la devolución si la hay. El DNI sirve para controlar
				el ingreso y resolver problemas con una compra: nunca va en un mail, en un link ni en la página
				de la entrada.
			</li>
			<li>
				<strong>De cada entrada:</strong> el nombre con el que te conocen (no hace falta el del documento)
				y los pronombres, para la puerta y para tratarte como querés.
			</li>
			<li>
				<strong>Respuestas a las preguntas de inscripción</strong>, si el evento tiene alguna.
			</li>
			<li>
				<strong>De la compra:</strong> evento, tipo y cantidad de entradas, precio, opción del Fondo,
				código de descuento, medio de pago, estado, fechas y, el día del evento, a qué hora entró cada
				entrada.
			</li>
		</ul>
		<p>
			<strong>Quién lo ve:</strong> el equipo de Kinky Vibe que administra el sitio. Les organizadores
			de un evento van a poder ver las respuestas a las preguntas de inscripción de ese evento. En la
			puerta, quien controla el ingreso ve el nombre, los pronombres, el mail de quien compró y los últimos
			3 números del DNI (y el DNI entero si lo necesita; eso queda registrado).
		</p>
		<p>
			<strong>El pago:</strong> con Mercado Pago, pagás en su sitio y le pasamos tu nombre y tu mail;
			los datos de tu tarjeta o de tu cuenta los maneja Mercado Pago, nunca pasan por nosotres. Con transferencia,
			el comprobante que nos mandás llega a nuestra casilla de mail.
		</p>
		<Revisar>
			el DNI se pide en todas las compras. Decidir si hace falta siempre (por ejemplo, para los
			eventos online) y dejar escrito para qué se usa exactamente. Revisar también que les
			organizadores que no son del equipo vean las respuestas de inscripción: ¿hay que avisarlo en
			la pregunta misma?
		</Revisar>

		<h3>Si tenés cuenta («Mi rincón»)</h3>
		<ul>
			<li>
				Tu <strong>mail</strong> (verificado con un código) y, si ponés una, tu
				<strong>contraseña</strong>, guardada de forma que nadie la puede leer.
			</li>
			<li>
				<strong>Tus datos para la próxima compra</strong>, solo si tildás la casilla: nombre,
				pronombres y, aparte, el DNI. Los ves y los borrás en Mi rincón.
			</li>
			<li>
				<strong>Tus sesiones abiertas</strong> (cuándo empezó cada una y cuándo se usó por última vez)
				y tus preferencias.
			</li>
			<li>
				Tus compras aparecen en Mi rincón si se hicieron con el mismo mail, también las de antes de
				tener cuenta.
			</li>
		</ul>

		<h3>Perfiles de la comunidad (amigues)</h3>
		<p>
			Si tu cuenta puede tener perfiles, lo que escribís en un perfil (nombre, pronombres,
			presentación, links, imagen y contacto) se publica según la visibilidad que elijas y recién
			cuando el equipo lo aprueba. Si es un lugar, también la dirección, con el nivel de privacidad
			que elijas (todo, solo la dirección, solo el barrio o nada). Nadie ve qué cuenta maneja un
			perfil ni que dos perfiles son de la misma persona. Para ubicar un lugar en el mapa, la
			dirección se busca en OpenStreetMap (Nominatim).
		</p>
		<Revisar>
			las fichas de amigues que se cargaron antes como archivos están en el repositorio público del
			sitio, con su historia. Borrar un perfil hoy no las saca de esa historia: decidir qué se le
			dice a quien pida que se borre.
		</Revisar>

		<h3>Lo que seguís y tu calendario</h3>
		<p>
			Qué etiquetas, series, perfiles y lugares seguís, con qué avisos, y un link secreto para tu
			calendario personal. Es privado: no se muestra a nadie, tampoco como «N personas siguen esto».
			Sin cuenta, «Avisame si se repite» guarda tu mail y la serie, y te pide confirmarlo por mail
			antes de mandarte nada; si no lo confirmás, se borra.
		</p>

		<h3>Telegram</h3>
		<p>
			Si conectás tu cuenta con el bot de Telegram, guardamos solo el número de ese chat para
			mandarte los avisos. Nada de tu perfil de Telegram. Lo desconectás con <code
				>/desvincular</code
			>
			o desde Mi rincón.
		</p>

		<h3>Propinas</h3>
		<p>
			Para dejar una propina no te pedimos ningún dato. Guardamos el monto, el mensaje si escribís
			uno y el número de pago de Mercado Pago (para poder devolverla).
		</p>

		<h3>Lo que anota el equipo</h3>
		<p>
			El panel guarda un registro de lo que hace el equipo (por ejemplo, quién confirmó una
			transferencia), sin mails. El equipo también puede anotar notas internas sobre una persona
			(por ejemplo, para recordar algo de una compra).
		</p>
		<Revisar>
			las notas internas del equipo sobre personas están asociadas a su mail. Decidir para qué se
			usan, quién las escribe, si la persona puede pedirlas y cuándo se borran.
		</Revisar>
	</section>

	<section id="navegador">
		<h2>Cookies y lo que queda en tu navegador</h2>
		<p>No usamos cookies de publicidad ni de seguimiento. Estas son las únicas:</p>
		<ul>
			<li>
				<code>kvRincon</code>: tu sesión de Mi rincón, solo si entraste. Dura hasta que salís (el
				navegador la guarda hasta 400 días y se renueva cuando usás el sitio).
			</li>
			<li>
				<code>kv_orders</code>: recuerda tus últimas compras en ese navegador para mostrarte los
				links a tus entradas. Dura 7 días.
			</li>
			<li>
				<code>userToken</code>, <code>oauthState</code> y <code>oauthRedirectTo</code>: solo para el
				equipo, al entrar al panel con GitHub.
			</li>
		</ul>
		<p>Además, el sitio guarda en tu navegador (no nos llega a nosotres):</p>
		<ul>
			<li>que respondiste que tenés 18 años o más, para no preguntarte cada vez;</li>
			<li>algunas preferencias de cómo ves el sitio;</li>
			<li>
				mientras completás la compra, un borrador del formulario (DNI incluido) que vive solo en esa
				pestaña y se borra al terminar la compra o al cerrarla.
			</li>
		</ul>
		<p>
			Cuando un evento o un lugar muestra un mapa, tu navegador baja las imágenes del mapa de los
			servidores de OpenStreetMap, que ven tu IP como cualquier sitio que visitás.
		</p>
	</section>

	<section id="terceros">
		<h2>Quién más procesa tus datos</h2>
		<p>No le vendemos ni le pasamos tus datos a nadie para publicidad. Para funcionar usamos:</p>
		<ul>
			<li>
				<strong>Cloudflare</strong>: aloja el sitio, la base de datos, las copias de seguridad, las
				visitas anónimas y el reenvío de nuestro mail.
			</li>
			<li>
				<strong>Resend</strong>: manda los mails del sitio (recibe tu mail y el texto del mail).
			</li>
			<li>
				<strong>Mercado Pago</strong>: cobra las entradas y las propinas, con su propia política de
				privacidad.
			</li>
			<li>
				<strong>Telegram</strong>: si usás el bot, tus mensajes con el bot pasan por Telegram, con
				su propia política.
			</li>
			<li>
				<strong>OpenStreetMap</strong>: los mapas y la búsqueda de direcciones de los lugares.
			</li>
			<li><strong>GitHub</strong>: el equipo entra al panel con su cuenta de GitHub.</li>
		</ul>
		<Revisar>
			el mail de contacto y el de las entradas terminan en una casilla de Gmail (Google), donde
			también llegan los comprobantes de transferencia: sumarlo a la lista si se confirma. Varios de
			estos servicios guardan datos fuera de Argentina: la ley pide condiciones para transferir
			datos a otros países. Revisar los contratos o términos de cada uno.
		</Revisar>
	</section>

	<section id="base-legal">
		<h2>Por qué podemos tratarlos</h2>
		<ul>
			<li>
				Los datos de una compra, porque los necesitamos para venderte la entrada y cumplir con lo
				que compraste.
			</li>
			<li>
				Los de la cuenta, lo que seguís, los perfiles y Telegram, porque vos nos los das y lo elegís
				(tu consentimiento). Lo podés retirar borrando esos datos o la cuenta.
			</li>
			<li>
				Los límites contra el abuso y las visitas anónimas, para que el sitio funcione y sea seguro.
			</li>
		</ul>
		<Revisar>
			la ley trata la información sobre la vida sexual como «dato sensible», con reglas más
			estrictas. Comprar una entrada para un evento kink o BDSM, o seguir ciertas etiquetas, podría
			decir algo de eso. Decidir con une abogade cómo se encuadra y si hace falta un consentimiento
			expreso aparte al comprar o al crear la cuenta.
		</Revisar>
	</section>

	<section id="tiempo">
		<h2>Cuánto tiempo los guardamos</h2>
		<ul>
			<li>
				<strong>Códigos para entrar:</strong> vencen a los 10 minutos y se borran solos al día siguiente.
			</li>
			<li>
				<strong>Contadores contra el abuso:</strong> 24 horas como mucho.
			</li>
			<li>
				<strong>Visitas anónimas:</strong> el detalle, unos 3 meses; después quedan solo totales por mes.
			</li>
			<li>
				<strong>Cuenta:</strong> hasta que la borres. Al borrarla se borran tu mail, tu contraseña, tus
				sesiones, tus datos guardados, lo que seguís y tu chat de Telegram; tus perfiles de persona se
				vacían.
			</li>
			<li>
				<strong>Compras:</strong> hoy no se borran solas. Si borrás la cuenta, tus compras quedan, sin
				el vínculo con la cuenta.
			</li>
			<li>
				<strong>Copias de seguridad:</strong> una por noche durante 30 días, una por mes durante un año
				y una por año sin fecha de borrado.
			</li>
		</ul>
		<Revisar>
			definir cuánto tiempo se guardan las compras (con el DNI) después del evento, y qué pasa con
			las copias anuales que no se borran nunca. Hay plazos legales y contables que pueden pedir
			guardar algo, y el DNI quizás pueda borrarse antes que el resto.
		</Revisar>
	</section>

	<section id="derechos">
		<h2>Tus derechos y cómo usarlos</h2>
		<p>
			Podés pedir <strong>ver</strong> qué datos tenemos de vos (acceso),
			<strong>corregirlos</strong> (rectificación), <strong>completarlos</strong> o
			<strong>borrarlos</strong> (supresión).
		</p>
		<p>Mucho lo podés hacer vos en Mi rincón:</p>
		<ul>
			<li>ver tu mail, tus compras y tus datos guardados, y corregirlos o borrarlos;</li>
			<li>bajar la lista de lo que seguís;</li>
			<li>desconectar Telegram, cerrar todas tus sesiones o borrar la cuenta.</li>
		</ul>
		<p>
			Para lo demás (por ejemplo, una compra hecha sin cuenta), escribinos a
			<a href="mailto:{contacto}">{contacto}</a> desde el mail con el que compraste. Te respondemos dentro
			de los plazos de la ley: 10 días corridos para un pedido de acceso y 5 días hábiles para corregir
			o borrar.
		</p>
		<p class="leyenda">
			La persona titular de los datos personales tiene la facultad de ejercer el derecho de acceso a
			ellos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
			interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
			25.326. La Agencia de Acceso a la Información Pública (AAIP), en su carácter de Órgano de
			Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que
			interpongan quienes resulten afectades en sus derechos por incumplimiento de las normas
			vigentes en materia de protección de datos personales.
		</p>
		<Revisar>
			confirmar el texto obligatorio de la AAIP (arriba, adaptado con lenguaje inclusivo: ver si se
			puede) y cómo verificamos que quien pide es la persona dueña de los datos antes de mostrar o
			borrar una compra.
		</Revisar>
	</section>

	<section id="menores">
		<h2>Menores de 18</h2>
		<p>
			Kinky Vibe es solo para personas de 18 años o más. El sitio pregunta la edad al entrar, la
			compra pide confirmar que tenés 18 o más, y en la puerta se puede pedir documento. No juntamos
			a propósito datos de menores: si nos enteramos de que una cuenta o una compra es de une menor,
			la borramos.
		</p>
		<Revisar>
			la pregunta de edad al entrar es una declaración (se guarda en el navegador y no se controla).
			Decidir si alcanza y qué se hace con la compra de une menor (¿devolución?).
		</Revisar>
	</section>

	<section id="seguridad">
		<h2>Cómo los cuidamos</h2>
		<ul>
			<li>Todo viaja cifrado (HTTPS).</li>
			<li>
				Las contraseñas, los códigos y las sesiones se guardan de forma que no se pueden leer, ni
				siquiera nosotres.
			</li>
			<li>
				El DNI nunca va en mails, links ni registros técnicos, y en la puerta se ve tapado salvo que
				haga falta.
			</li>
			<li>
				Solo el equipo que administra el sitio entra al panel, y lo que hace queda registrado.
			</li>
		</ul>
	</section>

	<section id="cambios">
		<h2>Cambios a esta política</h2>
		<p>
			Si cambiamos algo importante, lo vamos a avisar en el sitio y, si tenés cuenta, por mail,
			antes de que empiece a valer.
		</p>
		<Revisar>
			fecha de vigencia y cómo se avisa un cambio (¿mail a todas las cuentas? ¿a quienes
			compraron?).
		</Revisar>
	</section>
</Legal>

<style>
	.leyenda {
		font-size: var(--text-sm);
		color: var(--muted);
	}
</style>
