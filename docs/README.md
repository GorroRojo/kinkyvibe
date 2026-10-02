# Documentación de kinkyvibe

Guías cortas, una por parte del sitio. Cada una arranca con qué hace (para cualquiera), sigue con
lo que nunca se tiene que romper, dónde está el código, cómo probarlo y las tareas comunes.

Si recién llegás, empezá por [incorporacion.md](incorporacion.md).

| Guía                                           | De qué trata                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [incorporacion.md](incorporacion.md)           | Para une desarrolladore nueve: cómo armar el entorno, la arquitectura en una página y cómo se trabaja        |
| [pruebas-y-ci.md](pruebas-y-ci.md)             | Cómo funcionan los tests y la CI, y qué hacer cuando algo está en rojo                                       |
| [panel.md](panel.md)                           | El panel de admin (`/admin`): secciones, permisos, registro de actividad                                     |
| [entradas.md](entradas.md)                     | Venta de entradas: guía corta con las reglas que no se pueden romper                                         |
| [tickets.md](tickets.md)                       | Venta de entradas: referencia completa (precios, Fondo, Mercado Pago, variables, pendientes)                 |
| [propinas.md](propinas.md)                     | Propinas con Mercado Pago al pie de las publicaciones de KinkyVibe (en lugar del cafecito), interruptor      |
| [contenido.md](contenido.md)                   | Eventos, material, amigues y wiki: archivos `.md`, cómo se editan desde el panel y el plan de pasarlos a D1  |
| [publicar-contenido.md](publicar-contenido.md) | Cómo se publica lo que se guarda en el panel: un PR por cambio que se mergea solo cuando pasan las pruebas   |
| [mails.md](mails.md)                           | Qué mails manda el sitio, con Resend, plantillas editables, recordatorios y el filtro de los previews        |
| [datos.md](datos.md)                           | La base D1: tablas, migraciones, cómo agregar una, base de preview y base de producción                      |
| [objetos.md](objetos.md)                       | "Todo es un objeto": objetos y relaciones en D1, las reglas que no se rompen y cómo agregar un tipo núcleo   |
| [etiquetas.md](etiquetas.md)                   | Etiquetas como objetos en D1 (tipo `etiqueta`, wiki, series): el modelo y cómo va el paso a la base          |
| [cuentas.md](cuentas.md)                       | Cuentas del público ("Ingresar" / "Mi rincón"): código por mail, contraseña, sesiones, interruptor           |
| [amigues.md](amigues.md)                       | Amigues como perfiles (persona, proyecto, lugar), "Es mi perfil", lugares y la privacidad de sus direcciones |
| [personas-eventos.md](personas-eventos.md)     | Personas con rol en eventos y material, y preguntas de inscripción (interruptor `personas_eventos`)          |
| [demo.md](demo.md)                             | Modo demo de los deploys de preview: entrar como admin de prueba sin tocar el repo ni producción             |
| [release-1.md](release-1.md)                   | Release 1: qué prender, importar y verificar antes de la revisión grande, y rendimiento de los endpoints     |
| [workers-migracion.md](workers-migracion.md)   | Paso de Cloudflare Pages a Workers (ya hecho), backups nocturnos y cómo restaurar                            |
| [decisiones/](decisiones/README.md)            | Registro de decisiones de gorrite: leelo antes de cambiar un área                                            |

Otras guías sueltas:

- [`README.md`](../README.md) de la raíz: cómo escribir publicaciones a mano (propiedades,
  imágenes, etiquetas).
- [`workers/cron/README.md`](../workers/cron/README.md): el Worker que dispara los recordatorios.
- [`CLAUDE.md`](../CLAUDE.md): reglas para los agentes (también valen para humanes).

## Cómo mantener esto

- Si tu PR cambia cómo funciona un área, actualizá su guía **en el mismo PR** (decisión 0009).
- Guías cortas: lo que ya está en un comentario del código no se repite, se enlaza.
- Nada privado: el repo es público (sin datos de personas, secretos ni detalles de
  vulnerabilidades sin arreglar).
