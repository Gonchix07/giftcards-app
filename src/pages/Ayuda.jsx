import { useState } from 'react'
import { Card, Input } from '../components/ui'

// ---------- Contenido del manual como datos ----------
const manual = [
  {
    id: 'intro',
    title: '1. Introducción',
    blocks: [
      { t: 'p', text: 'La aplicación permite emitir y administrar Gift Cards para clientes. Cada Gift Card tiene un código único de 8 caracteres y un código QR, posee un monto máximo y admite usos parciales (queda saldo a favor del cliente hasta agotarse). El acceso es por email y contraseña, y lo que ve cada persona depende de su rol.' },
      { t: 'h3', text: 'Roles' },
      { t: 'ul', items: [
        '<b>Administrador</b>: acceso total (campañas, comercios, clientes, grupos, gift cards, reportes, usuarios y plantilla de mails).',
        '<b>Cajero</b>: canjea gift cards (por código o QR) del comercio asignado y ve sus usos del día.',
        '<b>Atención al Cliente</b>: busca clientes y consulta/descarga/envía las gift cards asignadas.',
        '<b>Tesorería</b>: solo lectura del panel (Inicio) y los reportes.',
      ] },
    ],
  },
  {
    id: 'acceso',
    title: '2. Acceso al sistema',
    blocks: [
      { t: 'ol', items: [
        'Ingresar a la dirección web de la aplicación.',
        'Escribir <b>email</b> y <b>contraseña</b>.',
        'Presionar <b>Ingresar</b>. El sistema lleva a la pantalla según el rol.',
      ] },
      { t: 'img', src: '/manual/01-login.png', alt: 'Pantalla de inicio de sesión' },
    ],
  },
  {
    id: 'admin',
    title: '3. Rol Administrador',
    blocks: [
      { t: 'h3', text: '3.1 Inicio (Dashboard)' },
      { t: 'p', text: 'Muestra totales generales y un desglose por campaña: total emitido, total usado, cantidad de gift cards y clientes. Arriba a la derecha se elige el período. Cada tarjeta de campaña abre la lista de Gift Cards filtrada por esa campaña.' },
      { t: 'img', src: '/manual/02-dashboard.png', alt: 'Dashboard con totales y desglose por campaña' },
      { t: 'h3', text: '3.2 Campañas y Comercios' },
      { t: 'ul', items: [
        'Los <b>comercios</b> se crean con nombre, logo y color de la tarjeta (el logo y el color pertenecen al comercio).',
        'Las <b>campañas</b> se crean con nombre y el comercio donde se usa la gift card.',
        'No se puede eliminar una campaña que tenga gift cards asociadas.',
      ] },
      { t: 'img', src: '/manual/03-empresas.png', alt: 'Sección Campañas y Comercios' },
      { t: 'h3', text: '3.3 Clientes y Grupos' },
      { t: 'ul', items: [
        'Cargar nombre, DNI, email (opcional) y código de cliente (opcional, 5 caracteres, único).',
        'Los grupos se crean en la tarjeta “Grupos” y se pueden asignar al cliente.',
        'No se puede eliminar un cliente con gift cards asignadas.',
      ] },
      { t: 'img', src: '/manual/04-clientes.png', alt: 'Sección Clientes y Grupos' },
      { t: 'h3', text: '3.4 Gift Cards' },
      { t: 'ol', items: [
        '<b>Emisión individual</b>: elegir campaña, opcional cliente, monto y vencimiento, y presionar “Generar y crear QR”.',
        '<b>Generación masiva</b>: por cantidad, o eligiendo un <b>grupo</b> para generar una gift card por integrante (con opción de enviar el QR por email).',
      ] },
      { t: 'ul', items: [
        'Las gift cards sin cliente se asignan desde la tabla; una vez asignado, el cliente no se puede cambiar.',
        'Solo se pueden eliminar gift cards sin uso.',
        'La tarjeta usa el color del comercio.',
      ] },
      { t: 'img', src: '/manual/05-giftcards.png', alt: 'Sección Gift Cards: emisión individual y masiva' },
      { t: 'img', src: '/manual/06-giftcard-popup.png', alt: 'Popup de la Gift Card (QR, descargar y enviar por email)' },
      { t: 'h3', text: '3.5 Reportes' },
      { t: 'ul', items: [
        '<b>Saldos</b>: estado y saldo de cada gift card.',
        '<b>Usos</b>: historial de consumos.',
        '<b>Auditoría</b>: todos los movimientos con fecha, hora y usuario (no se puede borrar).',
        'Cada reporte tiene buscador por cualquier campo y exportación a CSV.',
      ] },
      { t: 'img', src: '/manual/07-reportes.png', alt: 'Sección Reportes (Saldos, Usos, Auditoría)' },
      { t: 'h3', text: '3.6 Usuarios' },
      { t: 'ul', items: [
        'Crear usuarios con email, contraseña y rol.',
        'Desde la lista se cambia el rol y, para cajeros, el comercio asignado.',
      ] },
      { t: 'img', src: '/manual/08-usuarios.png', alt: 'Sección Usuarios' },
      { t: 'h3', text: '3.7 Mails' },
      { t: 'p', text: 'Permite editar la plantilla del email que reciben los clientes: asunto, título y textos. Admite HTML y variables que se reemplazan al enviar: {nombre}, {codigo}, {monto}, {empresa}, {comercio}, {vencimiento}.' },
      { t: 'img', src: '/manual/09-mails.png', alt: 'Sección Mails: editor y vista previa' },
    ],
  },
  {
    id: 'cajero',
    title: '4. Rol Cajero',
    blocks: [
      { t: 'p', text: 'Pantalla para canjear gift cards. Arriba se muestra el comercio asignado al cajero.' },
      { t: 'ol', items: [
        'Ingresar el código (8 caracteres) o tocar “Escanear QR”.',
        'El sistema muestra el saldo disponible. Ingresar el monto a usar (o “Usar todo”).',
        'Presionar “Confirmar uso”. Aparece un aviso de confirmación y se actualiza el listado.',
      ] },
      { t: 'ul', items: [
        'Si la gift card pertenece a otro comercio, el sistema avisa y no permite el uso.',
        'Debajo hay un listado de los usos del día, con selector de fecha y exportación a Excel.',
      ] },
      { t: 'img', src: '/manual/10-cajero.png', alt: 'Panel del Cajero' },
    ],
  },
  {
    id: 'atencion',
    title: '5. Rol Atención al Cliente',
    blocks: [
      { t: 'ol', items: [
        'Buscar el cliente por nombre o DNI.',
        'Ver la lista de sus gift cards (con filtro por estado: activas, agotadas, anuladas).',
        'En las gift cards activas, abrir el popup para ver, descargar o enviar por email la tarjeta.',
      ] },
      { t: 'img', src: '/manual/11-atencion.png', alt: 'Pantalla de Atención al Cliente' },
    ],
  },
  {
    id: 'tesoreria',
    title: '6. Rol Tesorería',
    blocks: [
      { t: 'p', text: 'Acceso de solo lectura. Ve únicamente dos secciones:' },
      { t: 'ul', items: [
        '<b>Inicio (Dashboard)</b>: totales y desglose por campaña, con selector de período.',
        '<b>Reportes</b>: Saldos, Usos y Auditoría, con buscador y exportación a CSV.',
      ] },
    ],
  },
]

// ---------- helpers de búsqueda ----------
const norm = (s) => (s || '').toLowerCase()
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function highlight(text, q) {
  if (!q) return text
  return text.replace(new RegExp('(' + escapeRe(q) + ')', 'ig'), '<mark>$1</mark>')
}
const blockText = (b) =>
  b.t === 'ul' || b.t === 'ol' ? b.items.join(' ') : b.t === 'img' ? b.alt : b.text

export default function Ayuda() {
  const [q, setQ] = useState('')
  const query = q.trim()

  // Filtra secciones/bloques según la búsqueda
  const secciones = manual
    .map((sec) => {
      if (!query) return sec
      const tituloMatch = norm(sec.title).includes(norm(query))
      if (tituloMatch) return sec // si coincide el título, muestra toda la sección
      const blocks = sec.blocks
        .map((b) => {
          if (b.t === 'ul' || b.t === 'ol') {
            const items = b.items.filter((it) => norm(it).includes(norm(query)))
            return items.length ? { ...b, items } : null
          }
          return norm(blockText(b)).includes(norm(query)) ? b : null
        })
        .filter(Boolean)
      return blocks.length ? { ...sec, blocks } : null
    })
    .filter(Boolean)

  return (
    <div className="max-w-4xl mx-auto text-sm">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">❓</span>
        <h1 className="text-2xl font-bold">Ayuda · Manual de uso</h1>
      </div>
      <p className="text-slate-500 mb-4">Guía de uso del sistema de Gestión de Gift Cards según cada rol.</p>

      {/* Buscador */}
      <div className="mb-6 sticky top-0 z-10 bg-slate-100 py-2">
        <Input
          placeholder="🔎 Buscar en el manual…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full"
        />
        {query && (
          <p className="text-xs text-slate-500 mt-1">
            {secciones.length === 0
              ? 'Sin resultados.'
              : `Mostrando coincidencias de “${query}”.`}
          </p>
        )}
      </div>

      {/* Índice (se oculta al buscar) */}
      {!query && (
        <Card className="mb-6">
          <h3 className="text-base font-bold text-slate-700 mb-2">Contenido</h3>
          <ul className="grid sm:grid-cols-2 gap-1">
            {manual.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-indigo-600 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {secciones.length === 0 ? (
        <Card className="text-center text-slate-400 py-8">No se encontraron resultados para “{query}”.</Card>
      ) : (
        <Card className="space-y-1">
          {secciones.map((sec) => (
            <section key={sec.id} id={sec.id} className="scroll-mt-24">
              <h2
                className="text-xl font-bold text-indigo-700 mt-6 mb-3"
                dangerouslySetInnerHTML={{ __html: highlight(sec.title, query) }}
              />
              {sec.blocks.map((b, i) => {
                if (b.t === 'h3')
                  return (
                    <h3
                      key={i}
                      className="text-base font-bold text-slate-700 mt-4 mb-1"
                      dangerouslySetInnerHTML={{ __html: highlight(b.text, query) }}
                    />
                  )
                if (b.t === 'p')
                  return (
                    <p
                      key={i}
                      className="text-slate-700 mb-2"
                      dangerouslySetInnerHTML={{ __html: highlight(b.text, query) }}
                    />
                  )
                if (b.t === 'ul')
                  return (
                    <ul key={i} className="list-disc pl-6 space-y-1 text-slate-700 mb-2">
                      {b.items.map((it, j) => (
                        <li key={j} dangerouslySetInnerHTML={{ __html: highlight(it, query) }} />
                      ))}
                    </ul>
                  )
                if (b.t === 'ol')
                  return (
                    <ol key={i} className="list-decimal pl-6 space-y-1 text-slate-700 mb-2">
                      {b.items.map((it, j) => (
                        <li key={j} dangerouslySetInnerHTML={{ __html: highlight(it, query) }} />
                      ))}
                    </ol>
                  )
                if (b.t === 'img')
                  return (
                    <figure key={i} className="my-4">
                      <img src={b.src} alt={b.alt} className="w-full rounded-lg border border-slate-200 shadow-sm" loading="lazy" />
                      <figcaption className="text-xs text-slate-400 mt-1 text-center">{b.alt}</figcaption>
                    </figure>
                  )
                return null
              })}
            </section>
          ))}
        </Card>
      )}
    </div>
  )
}
