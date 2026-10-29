# ghost-headline-theme-nautas

[ENGLISH](README.md) | **ESPAÑOL**

Mantenido por Criptonautas. Sin afiliación ni respaldo de la Ghost Foundation.

El tema de Ghost detrás de [criptonautas.co](https://criptonautas.co). Empezó como fork de
[Headline](https://github.com/TryGhost/Themes/tree/main/packages/headline), de Ghost, y se
alejó lo suficiente como para mantenerse como tema propio y no como una piel sobre él.

> [!WARNING]
> **En desarrollo.** El proyecto funcionó mucho tiempo como experimento y recién ahora entra
> en una etapa mantenida. Este archivo, las plantillas y el CSS van a seguir cambiando hasta
> que una versión se marque como final. Nada de esto es una API estable: haz un fork y adáptalo,
> pero fija un commit si dependes de él.

Headline se pensó para noticias locales: muchos temas, grillas densas, muchas superficies de
contenido. Este fork conserva su esqueleto y su pipeline de assets compartido, y rehace la
lectura alrededor de una sola publicación larga en español: letra más grande, menos cajas,
más aire.

## Qué cambia respecto de Headline

**Lectura**
- Medida de unos 70 caracteres por línea, títulos en escala 1,25, tipografía en `rem` sobre
  una raíz de `71%`.
- Índice en una columna fija en los posts (`tocbot`), con el ancho en `--toc-width` de
  `assets/css/vars.css`. Los posts sin títulos no tienen columna y quedan centrados.
- Tema claro/oscuro que sigue al sistema y recuerda la elección explícita
  (`assets/js/theme.js`; la nota de CSP explica por qué es un archivo).
- Dificultad desde las etiquetas `#nivel-1/2/3`: puntos en las tarjetas y una banda sobre la
  imagen destacada; en `/blog`, los selectores de nivel filtran la lista.
- Glosario: la primera mención de un término de la etiqueta `blog-glosario` del foro lleva
  un subrayado punteado y una tarjeta con la definición (`assets/js/glossary.js`).
- Lightbox con PhotoSwipe 5, solo en imágenes que tienen más para ver.
- Prefetch nativo de enlaces y cabecera que se oculta al bajar, sin librerías extra.
- El corte de la navegación móvil pasa de `767px` a `991px`, con un pequeño plugin de PostCSS
  en `gulpfile.js` limitado al CSS de navegación compartido.

**Páginas y plantillas**

La portada es una landing armada desde la página `inicio`: el título del sitio como
titular, preguntas, voces de miembros del foro, los tres caminos de entrada, destacados y
temas del foro. `/blog` lista todos los posts con la comunidad al costado (aside) o arriba
(franja).

| Plantilla | Uso |
| --- | --- |
| `custom-full-feature-image.hbs` | Portada a todo el ancho con el título sobre la imagen |
| `custom-wide-feature-image.hbs` | Imagen ancha bajo la cabecera |
| `custom-post-plain.hbs` | Sin imagen destacada |
| `custom-post-no-suggested.hbs` | Post sin los relacionados al pie |
| `custom-collection.hbs` | Índice de una serie: capítulos como cartas de tarot, stepper y anterior/siguiente con imágenes. La serie sale de la etiqueta interna de la página |
| `custom-videos.hbs` | Videos de PeerTube con chips de canal, Random/Tendencia/Recientes y cargar más |
| `custom-signin` / `custom-signup` / `custom-account` | Páginas de membresía |
| `custom-authors` / `custom-tags` | Listados de archivo |

**Integración con el foro** ([Discourse](https://comunidad.criptonautas.co))
- Comentarios en un iframe que carga al 70% del scroll y sigue el claro/oscuro del blog
  (`assets/js/discourse-embed.js`; la mitad del foro es `common/head_tag.html` en
  discourse-horizon-mod-nautas).
- Reacciones con emoji desde el tema del foro de cada post, con el mismo set del foro.
- Temas de la comunidad junto a la portada y las etiquetas, abiertos en un diálogo; los
  temas solo para miembros, solo con sesión iniciada. Necesita CORS en el foro.
- Iconos de canal desde las categorías del foro en tarjetas, secciones, etiquetas y migas.
- Propinas en Monero con el plugin discourse-monero-tips, en autores y reacciones.

**Búsqueda**: modal de Typesense con blog, comunidad y videos. Los resultados del foro se
leen dentro del modal con el resumen de IA del foro; los videos se reproducen ahí, desde el segundo que coincidió.

**Otros**
- Panel de estado de servicios en `/stack`, alimentado por un chequeo de n8n.
- Pestaña de feedback en escritorio (idea, error o soporte, captura opcional) enviada a un
  webhook de n8n.
- Tarjetas de suscripción al newsletter que envían a un formulario de Keila.
- Webmentions y botones para compartir en LinkedIn y el Fediverso.

**Ghost Portal está desactivado** (`{{ghost_head exclude="portal"}}`). La membresía la
resuelven las páginas propias de arriba y BTCPay.

### Ajustes del tema

| Ajuste | |
| --- | --- |
| `discourse_url` | Foro para comentarios, reacciones, listas de la comunidad y propinas. Vacío los apaga |
| `discourse_comments`, `discourse_reactions` | Activa cada uno |
| `community_sidebar` | Qué lista el aside de la comunidad |
| `monero_tips_username` | Cuenta del foro que recibe las propinas. Vacío las oculta |
| `search_host`, `search_key` | Host de Typesense y clave **solo de búsqueda**. Vacío: la búsqueda de Ghost |
| `peertube_source` | URL de PeerTube para la página de videos, opcionalmente `\| ids de categoría` |
| `newsletter_form` | Dirección del formulario de Keila para las tarjetas de suscripción |
| `feedback_webhook` | Webhook de n8n para la pestaña de feedback |
| `dark_logo`, `github_url`, `footer_note` | Pie y logo |

### Workflows programados

| Workflow | Cuándo | Qué |
| --- | --- | --- |
| `sync-peertube.yml` | cada 3 h | Videos de PeerTube (con resúmenes de IA) y los fragmentos de sus subtítulos al índice de búsqueda. Fragmentos apagados hasta definir `VIDEO_CHUNKS` |
| `sync-mushin.yml` | cada hora | Documentos de Hister a Typesense. Apagado hasta definir `HISTER_URL` |
| `update-search-vendor.yml` | lunes | InstantSearch.js y el adaptador de Typesense, con la versión mayor fija |

## Desarrollo

Requiere **Node 22+** (fijado en `.nvmrc`; `cssnano` usa `Set.prototype.difference`, que
llega en la 22) y **pnpm**.

```bash
pnpm install
pnpm dev     # build + watch
pnpm test    # validación con gscan
pnpm zip     # paquete para subir a mano
```

El CSS fuente va en `assets/css/`, el JS en `assets/js/`, más las plantillas `.hbs`. Todo lo
de `assets/built/` es generado, pero **sí** se commitea, porque es lo que llega a Ghost.
Commitea siempre el build junto con los cambios de fuente.

`assets/js/*.js` se concatena en `built/main.min.js`, con dos excepciones a propósito:
`theme.js` queda afuera (carga solo en `<head>` antes del primer pintado, y al empaquetarlo
registraría el cambio de tema dos veces), y el orden de archivos lo controla
`ordered-read-streams` para que las librerías lleguen antes que el código que las usa.

### Dos cosas que muerden

**No dejes que Prettier formatee los `.hbs`.** Reescribe los argumentos de helpers dentro de
atributos HTML: `{{social_url type="twitter"}}` pasa a `{{social_url type=" twitter"}}`, y
`{{{block "body_class"}}}` a `{{{block " body_class"}}}`. Ghost usa esos valores tal cual, así
que el resultado es una salida rota en silencio, no un error. `.prettierignore` excluye
`*.hbs` por eso; déjalo así.

**La CSP del sitio bloquea los `<script>` en línea.** La política `script-src` lleva hashes
sha256 y, según la especificación, un hash hace que el navegador ignore `'unsafe-inline'`.
Solo corren los scripts en línea cuyo hash exacto está permitido, así que editar uno lo
desactiva en silencio. El JS nuevo va en un archivo bajo `assets/`, que la política ya permite.

## Despliegue

Un push a `main` ejecuta `.github/workflows/deploy-theme.yml`, que sube el tema a Ghost por
la Admin API.

Dos detalles sostienen todo:

- **`theme-name` tiene que coincidir con el id del tema activo en Ghost.** Ghost identifica
  un tema por el nombre del zip y solo lo reactiva si ese id coincide con el activo. Si no
  coincide, instala un segundo tema inactivo: el run sale verde y el sitio no cambia.
- **`/ghost/` no puede estar detrás de un proxy de forward-auth en la ruta de la Admin API.**
  Si lo está, la subida se redirige a un login, la acción lee el 2xx como éxito y nada llega
  a Ghost. Un paso previo hace fallar el build cuando lo detecta, en vez de dejarlo pasar.

## Créditos

Basado en [Headline](https://github.com/TryGhost/Themes/tree/main/packages/headline), de la
Ghost Foundation. Las traducciones del tema vienen de `@tryghost/theme-translations`.

## Copyright y licencia

Copyright (c) 2013-2026 Ghost Foundation, publicado bajo la [licencia MIT](LICENSE).

Texto de este README bajo [CC BY-NC-SA 4.0](CC-BY-NC-SA-4.0.txt).
