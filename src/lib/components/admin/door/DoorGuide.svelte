<script>
	/**
	 * Guía corta para quien está en la puerta (hoja «Cómo hacer la puerta» del modo puerta). Es la
	 * misma guía que `docs/tickets.md`, «Puerta: cómo hacerla»: si cambia una, cambiá la otra.
	 * Texto fijo, sin datos de nadie. Props: `canSell` (el evento vende en la puerta).
	 */
	export let canSell = true;
</script>

<div class="guide">
	<p class="lead">
		Lo que hace falta para hacer la puerta desde este celu. Ante la duda, frená la fila un segundo y
		preguntale a une organizadore: es mejor que adivinar.
	</p>

	<h3>Antes de abrir</h3>
	<ul>
		<li>
			Abrí esta pantalla <strong>con conexión</strong> y esperá el cartel verde «Listo para sin conexión»:
			la lista de entradas queda guardada en el celu por si se corta.
		</li>
		<li>Celu con batería (o cargador a mano) y el brillo alto. La pantalla no se apaga sola.</li>
		<li>
			Tené un plan B en papel: si el celu se queda sin batería, anotá nombre y código de cada
			persona y cargalo después.
		</li>
	</ul>

	<h3>Escanear</h3>
	<ul>
		<li>Apuntá la cámara al QR de la entrada (en el celu de la persona o impreso).</li>
		<li>
			<strong>Verde «Adelante»</strong>: pasa. Si te equivocaste de persona, tocá «Deshacer».
		</li>
		<li>
			<strong>Amarillo «Ya ingresó»</strong>: esa entrada ya se usó (dice a qué hora y quién la
			marcó). No lo discutas en la fila: pedile el mail de la compra y avisale a une organizadore.
		</li>
		<li>
			<strong>«Anulada», «De otro evento» o «QR inválido»</strong>: no pasa con esa entrada. Probá
			con «Buscar persona» por si tiene otra a su nombre.
		</li>
		<li>
			En iPhone la cámara de esta pantalla no lee QRs: usá «Escribir código» o «Buscar persona».
		</li>
	</ul>

	<h3>Escribir código y buscar</h3>
	<ul>
		<li>
			<strong>Escribir código</strong>: las 6 letras y números que están abajo del QR, o el link de
			la entrada.
		</li>
		<li>
			<strong>Buscar persona</strong>: por el nombre de la entrada, el de quien compró, el mail, el
			DNI o el código. Antes de marcar, confirmá que es esa persona (por ejemplo, con el mail de la
			compra o los últimos números del DNI).
		</li>
		<li>
			No leas en voz alta el nombre del documento, el DNI ni el mail: decí solo lo necesario y en
			voz baja.
		</li>
	</ul>

	{#if canSell}
		<h3>Vender en la puerta</h3>
		<ul>
			<li>
				«Vender en puerta»: elegí el tipo, la cantidad y cómo pagó (efectivo o transferencia que ya
				viste llegar). Las entradas quedan adentro al toque.
			</li>
			<li>
				Si cobraste otro precio, cambialo antes de registrar, y anotá el motivo en «Agregar nota».
			</li>
			<li>
				Si te pide confirmar (cupo lleno, más de 10 entradas o un evento solo anticipadas), frená y
				consultalo con une organizadore antes de seguir.
			</li>
		</ul>
	{/if}

	<h3>Sin conexión</h3>
	<ul>
		<li>
			Si se corta, seguí igual: escanear, escribir el código, buscar en la lista guardada{canSell
				? ' y vender'
				: ''} siguen andando. Arriba dice cuánto queda por sincronizar.
		</li>
		<li>
			Cuando vuelve la conexión se manda solo; si no, tocá «Sincronizar». <strong
				>No cierres la pestaña ni borres los datos del navegador</strong
			> con cosas pendientes.
		</li>
		<li>
			Si otro celu ya había marcado esa entrada, al sincronizar sale un aviso: cuenta el primer
			ingreso.
		</li>
	</ul>

	<h3>Si hay un problema</h3>
	<ul>
		<li>
			La persona no aparece o la entrada no le funciona: no la dejes pasar ni la rechaces sola.
			Pedile que espere a un costado y llamá a une organizadore.
		</li>
		<li>
			Dudas de edad: se puede pedir documento solo para ver la fecha de nacimiento. El nombre de la
			entrada no tiene que coincidir con el del documento.
		</li>
		<li>
			Si alguien está mal, se siente insegure o hay una situación de violencia, avisale enseguida a
			la persona de cuidado del evento.
		</li>
		<li>
			No prestes tu sesión ni el celu con el panel abierto a otra persona: si hace falta alguien más
			en la puerta, que lo resuelva une organizadore.
		</li>
	</ul>
</div>

<style>
	.guide {
		display: grid;
		gap: var(--space-2xs, 0.4rem);
		line-height: 1.45;
	}
	.lead {
		margin: 0 0 var(--space-2xs, 0.4rem);
		color: var(--muted);
	}
	h3 {
		margin: var(--space-xs, 0.6rem) 0 0;
		font-size: var(--text-base, 1rem);
	}
	ul {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.35rem;
	}
</style>
