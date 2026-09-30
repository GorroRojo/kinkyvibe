# 0010. Panel: tema, formularios, Inicio y detalles

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

El panel nuevo está en feedback. Mel y Pau son muy visuales, y les admins tienen que poder hacer
todo sin código.

## Decisión

- **Tema**: el panel arranca en **claro**. Se mantienen las opciones claro / oscuro / automático.
  Solo el panel cambia su valor por defecto.
- **Formularios** (elegidos con la maqueta):
  - 1B, editar: formulario largo con índice y borrador automático.
  - 2B, cargar nuevo: el mismo formulario largo.
  - 3B, comprar: tres pasos (Entradas → Tus datos → Pagar), con el resumen siempre visible.
- **Inicio en compu**: el espacio de la derecha muestra la agenda de 7 días, las ventas de esta
  noche y la actividad. Cuando exista la bandeja, también los mensajes sin responder.
- **"Importar planilla"** sale del menú lateral y pasa a ser un botón en el encabezado de Agenda.
  Sigue en las acciones rápidas de Inicio y en la paleta de comandos.
- **Bandeja**: los mails a la organización entran al panel (con copia opcional a Gmail), se
  responde desde ahí y se envía a una persona o en masa.
- **Gráficos**: primero el termómetro de ventas por evento. Después: ventas en el tiempo, mapa de
  la comunidad, asistencia y retorno, Fondo y finanzas.
- Imágenes para compartir: más paletas, layouts, formatos (apaisado, carrusel) y estilo por serie.
- Ícono de AMBA: 🏙️ (en `hardcodedTags.js`).
- **Datos de amigues** (mail, teléfono, cumpleaños): son públicos **a propósito**. No tocar ni
  volver a marcarlo como problema.

## Descartado

- Tema "sistema" como valor por defecto del panel.
- Pestañas o pasos para editar contenido.
- Aviso de cambios sin guardar en "nuevo" e "importar" por ahora (queda para el rediseño 2B).

## Consecuencias

- El cambio de tema por defecto no afecta al sitio público.
- El editor nuevo guarda borradores solo, para no perder lo hecho.
