---
# Acá entre los '---' se ponen las propiedades
# Si la propiedad tiene un '#' antes, se ignora
# Para activarla, sacarle el '#'

################################################
## ------ Para todas las publicaciones ------ ##
################################################

#published_date: 2023-05-16Z-03:00   # (YYYY-MM-DD) fecha de publicación #
#updated_date: 2023-11-04Z-03:00   # (YYYY-MM-DD) ult vez actualizó el post #
title: Publicación de ejemplo # el nombre de la página en el navegador #

summary: Una demostración de todas las cosas que puede tener una publicación
# Un resumen para las listas de posts y para que aparezca en links, buscadores, etc

tags:
  - español
  - BDSM
  - KinkyVibe # etiqueta especial que marca las cosas con un highlight #

layout: material
category: material # material | calendario | amigues #

authors:
  - DemonWeb
  - FideosConTuco
  - Gorro_Rojo
# Quién recibe crédito por el material
# quiénes organizan el evento
# o quiénes forman parte de un emprendimiento/proyecto

#featured: 1
# (opcional) ID de la imagen que aparece de miniatura en las listas y previews de links

#force_unlisted: false  # true | false #
# (opcional) fuerza a que no aparezca en listas, aún si tiene fecha de publicación seteada. seguirá funcionando el url.

#force_unpublished: false  # true | false #
# (opcional) fuerza a que no esté publicada bajo el url además de no aparecer en ninguna lista:

####################################################
## ------ Para publicaciónes de 'material' ------ ##
####################################################

#type: contenido  # descargable | link | contenido #

#link: https://www.altoporno.gay/edu
# Para:
#   descargable o link:
#       link a ese descargable o ese link
#   contenido:
#       link (opcional) al contenido original en caso de
#       ser una traducción un repost, una adaptación, etc

########### ----- Para tipo 'link' ----- ###########

#access_date: 2023-11-21Z-03:00  # YYYY-MM-DD #
# La última vez que se chequeó que ese link funcionara y conteniera lo que se supone que contiene

#original_published_date: 2010-04-03Z-03:00  # YYYY-MM-DD #
# La fecha de publicación original del contenido linkeado

######################################################
## ------ Para publicaciónes de 'calendario' ------ ##
######################################################

#status: abierto  # anunciado | abierto | lleno | cancelado #
# Una vez ya haya pasado, esto se vuelve irrelevante automáticamente

#start: 2023-06-02T20:00-03:00
#end: 2023-06-02T23:00-03:00
# Fecha y hora en la que comienza y termina el evento
# formato: YYYY-MM-DDThh:mm-03:00
#          año       T     -03:00
#               mes   hora
#                  dia   minuto
# !!  IMPORTANTE LA 'T' Y EL -03:00  !!
#    la T separa la fecha de la hora
#    el -03:00 marca la zona horaria
# ejemplo, para el 2 de junio de 2023
#          de las 20hs hasta las 23hs

#location: Thames 240, Ciudad Autónoma de Buenos Aires
# Ubicación física donde sucede. si no está se asume online

#link: https://forms.google.com/elmejoreventodelmundo
#link_text: Inscibirme ➡️
# Un link de acción en el evento, para inscribirse o para ir algun post original

###################################################
## ------ Para publicaciones de 'amigues' ------ ##
###################################################

#pronoun: https://pronombr.es/elle&él
# Pronombres, campo libre pero sugiero que usen un link a pronombr.es
# https://pronombr.es/elle
#                         ↖cualquier pronombre
# opciones que funcionan en la página:
#   elle | ella | ellu | elli | elloa | il | ól | xelle
#   ellx | ell_ | ell* | ell@ | ella  | él | cualquiera
# también se pueden unir con un &, por ejemplo
#   elle&él | él&elle&ella | etc...
# para casos complejos, en la página hay generador que permite personalizar mas
# pero que genera links mucho menos legibles
# por ejemplo, los de gorrite son:
# https://pronombr.es/eso&elle,le,le,une,eso&elle,les,unes,les,e,co,
# y como no tiene support para plurales, lo más cercano es algo así
# https://pronombr.es/elles,les,les,unes,elles,les,unos,les,es,co,
# pero no es realmente plural, así que en ese caso se puede usar texto
# y listo, meter 'elles' en vez de un link

#link: https://instagram.com/gnosis.king # Link a su perfil/página del proyecto #

## opcionales ##

#logo: 2  # (opcional) ID de imagen de su logo #
#photo: 3  # (opcional) ID de foto de la persona / lugar #
#email: ayuda@kinkyvibe.ar  # (opcional) email de contacto #
#location: Thames 240, Ciudad Autónoma de Buenos Aires  # (opcional) #
#tel: +54 9 11 5555 3333  # (opcional) #
#bday: 1996-04-09  # (opcional) cumpleaños, porque por qué no "

# (opcional) pequeño subtítulo de la persona
# el 'summary' entonces se puede pensar como una versión más extendida de esto
#job_title: Educador BDSM - Dominatrix - Putito

# (opcional) identidad de género, para quien la quiera incluir(? #
#gender_identity: Perrito Travo Interdimensional

force_unlisted: true
---

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

Lorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit ametLorem ipsum dolor sit amet.

Otro parrafo.

- Lista
- tremenda lsita
  - sub list
  - sub list
    - sub sub lista

> cita muy importante de alguien que importa mucho

_enfasis_ **otroenfasis** **_doble enfasis_** `código` ~~strikethrough~~

| head1  | head2  |
| ------ | ------ |
| value1 | value2 |

## Para amigues

```yaml
---
#published_date: 2023-05-16Z-03:00
#updated_date: 2023-11-04Z-03:00
title: Amigue de ejemplo
summary: Una demostración de todas las cosas que puede tener una publicación
tags:
  - español
  - BDSM
  - KinkyVibe # etiqueta especial #
layout: amigues
category: amigues
authors:
  - DemonWeb
  - FideosConTuco
  - Gorro_Rojo
#featured: 1
#force_unlisted: false
#force_unpublished: false
pronoun: https://pronombr.es/elle&él
link: https://instagram.com/gnosis.king
#logo: 2
#photo: 3
#email: ayuda@kinkyvibe.ar
#location: Thames 240, Ciudad Autónoma de Buenos Aires
#tel: +54 9 11 5555 3333
#job_title: Educador BDSM - Dominatrix - Putito
#gender_identity: Perrito Travo Interdimensional
#bday: 1996-04-09

---
```

## Para calendario

```yaml
---
#published_date: 2023-05-16Z-03:00
#updated_date: 2023-11-04Z-03:00
title: Evento de ejemplo
summary: Una demostración de todas las cosas que puede tener una publicación
tags:
  - español
  - BDSM
  - KinkyVibe # etiqueta especial #
layout: calendario
category: calendario
authors:
  - DemonWeb
  - FideosConTuco
  - Gorro_Rojo
#featured: 1
#force_unlisted: false
#force_unpublished: false
status: abierto # anunciado | abierto | lleno | cancelado #
start: 2023-06-02T20:00-03:00
end: 2023-06-02T23:00-03:00
#location: Thames 240, Ciudad Autónoma de Buenos Aires
link: https://forms.google.com/elmejoreventodelmundo
link_text: Inscibirme ➡️
---
```

## Para material

```yaml
---
#published_date: 2023-05-16Z-03:00
#updated_date: 2023-11-04Z-03:00
title: Material de ejemplo
summary: Una demostración de todas las cosas que puede tener una publicación
tags:
  - español # español | inglés #
  - gratis # gratis | pago #
  - guía # guía | articulo | fanzine | libro (no son excluyentes, pueden haber varios) #
  - gratis # gratis | pago #
#  - descargable # descargable | link #
  - KinkyVibe # etiqueta especial #
  - BDSM
layout: material
category: material
authors:
  - DemonWeb
  - PauConTuco
  - Gorro_Rojo
#featured: 1
#force_unlisted: false
#force_unpublished: false
#link: https://www.altoporno.gay/edu
########### ----- Para tipo 'link' ----- ###########
#redirect: false
#access_date: 2023-11-21Z-03:00
#original_published_date: 2010-04-03Z-03:00
---
```
