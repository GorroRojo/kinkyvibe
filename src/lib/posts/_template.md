---
# Acá entre los '---' se ponen las propiedades
# Si la propiedad tiene un '#' antes, se ignora
# Para activarla, sacarle el '#'


################################################
## ------ Para todas las publicaciones ------ ##
################################################

# La fecha de publicación, una vez esto está activado la publicación se vuelve visible
# Formato: YYYY-MM-DD
#published_date: 2023-05-16

# La última vez que se actualizó el post, si se actualizó alguna vez
#updated_date: 2023-11-04

# El título que va a aparecer en el nombre de la página y como título antes del contenido
title: Publicación de ejemplo

# Un resumen para las listas de posts y para que aparezca en links, buscadores, etc
summary: Una demostración de todas las cosas que puede tener una publicación

# Las etiquetas (acá un par puestas a modo ejemplo)
tags:
    - BDSM
    - KinkyVibe

# La categoría, una de las siguientes: material | calendario | amigues
category: material

# Quién recibe crédito por el material, el evento, o quiénes forman parte de un emprendimiento/proyecto
authors:
    - DemonWeb
    - FideosConTuco
    - Gorro_Rojo

# (opcional) ID de la imagen que aparece de miniatura en las listas y previews de links
#featured: 1

# (opcional) fuerza a que no aparezca en listas, aún si tiene fecha de publicación seteada. seguirá funcionando el url.
# formato: true | false
#force_unlisted: false

# (opcional) fuerza a que no esté publicada bajo el url además de no aparecer en ninguna lista: 
# formato: true | false
#force_unpublished: false


####################################################
## ------ Para publicaciónes de 'material' ------ ##
####################################################

# Indica tipo de publicación
# formato: descargable | link | contenido
#type: contenido

# Si es tipo descargable o link: link a ese descargable o ese link
# (opcional) Si es tipo contenido: link al contenido original en caso de ser una traducción un repost, una adaptación, etc
#link: https://www.altoporno.gay/edu


########### ----- Para tipo 'link' ----- ###########

# La última vez que se chequeó que ese link funcionara y conteniera lo que se supone que contiene
#access_date: 2023-11-21

# La fecha de publicación original del contenido linkeado
#original_published_date: 2010-04-03


######################################################
## ------ Para publicaciónes de 'calendario' ------ ##
######################################################

# El estado en el que está el evento
# Una vez ya haya pasado, esto se vuelve irrelevante automáticamente
# formato: anunciado | abierto | lleno | cancelado
#status: abierto

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
#start: 2023-06-02T20:00-03:00
#end: 2023-06-02T23:00-03:00

# Ubicación física donde sucede
# Si no está presente esta propiedad, se asume que es online
#location: Thames 240, Ciudad Autónoma de Buenos Aires

# Un link de acción en el evento, para inscribirse o para ir algun post original
#link: https://forms.google.com/elmejoreventodelmundo
#link_text: Inscibirme ➡️


###################################################
## ------ Para publicaciones de 'amigues' ------ ##
###################################################

# El título de la publicación debe ser nombre de la persona/emprendimiento/proyecto

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
#pronoun: https://pronombr.es/elle&él

# Link a su perfil/página del proyecto
#link: https://instagram.com/gnosis.king

# (opcional) ID de imagen de su logo
#logo: 2

# (opcional) ID de foto de la persona / lugar
#photo: 3

# (opcional) email de contacto
#email: ayuda@kinkyvibe.ar

# (opcional) ubicación, cuando es relevante, como para una publicación sobre el QI
#location: Thames 240, Ciudad Autónoma de Buenos Aires

# (opcional) teléfono de contacto
#tel: +54 9 11 5555 3333

# (opcional) pequeño subtítulo de la persona
# el 'summary' entonces se puede pensar como una versión más extendida de esto
#job_title: Educador BDSM - Dominatrix - Putito

# (opcional) identidad de género, para quien la quiera incluir(?
#gender_identity: Perrito Travo Interdimensional

# (opcional) cumpleaños, porque por qué no
#bday: 1996-04-09

unlisted: true
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

*enfasis* **otroenfasis** ***doble enfasis*** `código` ~~strikethrough~~

|head1|head2|
|-|-|
|value1|value2|

## Para amigues
```yaml
---
#published_date: 2023-05-16
#updated_date: 2023-11-04
title: Amigue de ejemplo
summary: Una demostración de todas las cosas que puede tener una publicación
tags:
    - BDSM
    - KinkyVibe
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
#published_date: 2023-05-16
#updated_date: 2023-11-04
title: Evento de ejemplo
summary: Una demostración de todas las cosas que puede tener una publicación
tags:
    - BDSM
    - KinkyVibe
category: calendario
authors:
    - DemonWeb
    - FideosConTuco
    - Gorro_Rojo
#featured: 1
#force_unlisted: false
#force_unpublished: false
# formato: anunciado | abierto | lleno | cancelado
status: abierto
start: 2023-06-02T20:00-03:00
end: 2023-06-02T23:00-03:00
# Si no está presente esta propiedad, se asume que es online
#location: Thames 240, Ciudad Autónoma de Buenos Aires
# Un link de acción en el evento, para inscribirse o para ir algun post original
link: https://forms.google.com/elmejoreventodelmundo
link_text: Inscibirme ➡️
---
```
## Para material
```yaml
---
#published_date: 2023-05-16
#updated_date: 2023-11-04
title: Material de ejemplo
summary: Una demostración de todas las cosas que puede tener una publicación
tags:
    - BDSM
    - KinkyVibe
category: material
authors:
    - DemonWeb
    - FideosConTuco
    - Gorro_Rojo
#featured: 1
#force_unlisted: false
#force_unpublished: false
type: contenido
#link: https://www.altoporno.gay/edu
########### ----- Para tipo 'link' ----- ###########
#access_date: 2023-11-21
#original_published_date: 2010-04-03
---
```
