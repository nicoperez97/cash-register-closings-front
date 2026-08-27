import { Permission } from '../auth/auth.models';

export type HelpBlockTone = 'read' | 'do' | 'lock' | 'info';

export type HelpBlock = {
  title: string;
  body: string;
  /** Si está vacío, se muestra a cualquiera que vea la pantalla. */
  anyOf?: Permission[];
  icon?: string;
  tone?: HelpBlockTone;
  /** Lista corta de pasos o recortes. */
  items?: string[];
  /** Dato útil o error típico. */
  tip?: string;
};

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  blocks: HelpBlock[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'home',
    title: 'Inicio',
    summary: 'El día del local de un vistazo: atajos, quién vino y avisos.',
    blocks: [
      {
        title: 'Empezá acá',
        icon: 'waving_hand',
        tone: 'read',
        body: 'Esta pantalla resume el local. Lo que ves depende de tus permisos: no todos tienen los mismos atajos.',
        items: [
          'Arriba: ir a lo que más usás (cierres, pagos, reservas…).',
          'Presentismo de hoy, si tenés acceso.',
          'Campana: avisos de pagos, movimientos y más.',
          'Saldos: cada cuenta es lo que entra menos lo que sale. Tocá una cuenta para ver sus movimientos.',
        ],
        tip: 'Si llega un aviso mientras estás en una lista, esa pantalla se recarga sola. No hace falta tirar para actualizar.',
      },
    ],
  },
  {
    id: 'profile',
    title: 'Perfil',
    summary: 'Tu cuenta, avisos del local y el orden del menú lateral.',
    blocks: [
      {
        title: 'Cuenta',
        icon: 'manage_accounts',
        tone: 'do',
        body: 'Desde el menú de tu usuario abrís Perfil. En Cuenta subís la foto y editás nombre, teléfono, alias y CBU.',
        tip: 'El email solo lo cambia un admin. En iPhone, Subir foto materializa y comprime la imagen antes de enviarla.',
        items: ['Tocá Guardar datos cuando cambies los campos.', 'Quitar elimina la foto del perfil.'],
      },
      {
        title: 'Notificaciones',
        icon: 'notifications',
        tone: 'do',
        body: 'Solo aparecen avisos que el local te habilitó. En cada uno podés silenciar la app, el mail o ambos. Si tocás un aviso (en la campana o en el celular), abre ese local y el módulo. Cuando se puede, también abre el dato: el pago, el gasto, el cierre, el faltante o la reserva.',
        tip: 'Si no te habilitaron un aviso, no lo ves acá.',
      },
      {
        title: 'Menú lateral',
        icon: 'menu',
        tone: 'do',
        body: 'La barra lateral usa primero Tu menú (si lo guardaste) y, si no, el Menú del local. Con ⋮ renombrás, movés de grupo u ocultás un módulo.',
        items: [
          'Guardar menú aplica tu orden de inmediato en la barra lateral.',
          'Usar menú del local borra tu personalización y vuelve al del local.',
        ],
      },
    ],
  },
  {
    id: 'closings',
    title: 'Cierres',
    summary: 'La caja del día: borrador, envío y bloqueo cuando ya está conciliado.',
    blocks: [
      {
        title: 'La lista',
        icon: 'list',
        tone: 'read',
        anyOf: ['closings.read', 'closings.create'],
        body: 'Cada fila es un día (y un turno, si el local tiene más de uno). Primero ves caja sistema, total declarado y la diferencia en color (si el declarado es mayor, estás a favor en verde). Después el desglose: efectivo, PVS, Mercado Pago, DNI, transferencias, delivery, otros y egresos.',
        items: [
          'Entrá al cierre para ver el detalle.',
          'En el celular la lista viene compacta. Con el botón de info de cada fila ves el detalle, o cambiá a vista detallada junto a Buscar.',
          'Volver a procesar compara cada cierre con el libro. Marcá cuáles cargar.',
        ],
      },
      {
        title: 'Volver a procesar',
        icon: 'sync',
        tone: 'do',
        anyOf: ['closings.create'],
        body: 'Compara los ingresos de cada cierre (PVS, efectivo, MP, etc.) con el libro. Marcá cuáles aplicar. El botón de info abre estas instrucciones.',
        items: [
          'Nuevo: no está en el libro. Si lo marcás, se crea.',
          'No coincide: el libro tiene otro importe ese día. Si lo marcás, el libro pasa al importe del cierre.',
          'Solo nuevos, Todos o Ninguno te ahorran tildar uno por uno.',
          'Abajo ves cómo quedarían los saldos con lo marcado.',
        ],
        tip: 'Los que ya coinciden no se tocan. Si no marcás nada, no se carga nada.',
      },
      {
        title: 'Armar el cierre',
        icon: 'edit_note',
        tone: 'do',
        anyOf: ['closings.create', 'closings.update'],
        body: 'Cargá ventas, efectivo, posnets, cuentas aparte, cubiertos y gastos. Guardá borrador y, cuando esté, envialo.',
        items: [
          'En efectivo: primero el total, después apertura, a retirar y lo que se deja en caja. El total tiene que ser igual a retirar más dejar.',
        ],
        tip: 'El total declarado se compara con lo esperado: la diferencia queda a la vista.',
      },
      {
        title: 'Bloquear',
        icon: 'lock',
        tone: 'lock',
        anyOf: ['closings.lock'],
        body: 'Cuando el día ya está conciliado, bloquealo. Un cierre bloqueado no se edita.',
      },
    ],
  },
  {
    id: 'closings-new',
    title: 'Nuevo cierre',
    summary: 'Paso a paso del cierre de caja de un día.',
    blocks: [
      {
        title: 'Cómo cargarlo',
        icon: 'checklist',
        tone: 'do',
        anyOf: ['closings.create', 'closings.update'],
        body: 'Andá sección por sección: cobros, efectivo, posnets, retiro, egresos del cierre, propinas y notas. Si el local tiene más de un turno, elegí en qué turno cerrás (viene el que está vigente: sigue hasta que abre el siguiente).',
        items: [
          'Los egresos del cierre salen de conceptos con categoría Cierre: monto y descripción.',
          'Las propinas van en un paso aparte.',
          'No hace falta terminar de una: guardá borrador.',
          'Cuando los números cierren, envialo para que otros lo vean como enviado.',
        ],
        tip: 'Si se te cierra la sesión, al volver a entrar recuperamos el cierre que estabas cargando en este dispositivo.',
      },
    ],
  },
  {
    id: 'cash-withdrawals',
    title: 'A retirar',
    summary: 'Plata de caja que hay que sacar y asignar a un socio.',
    blocks: [
      {
        title: 'Qué hacer',
        icon: 'payments',
        tone: 'do',
        anyOf: ['cashWithdrawals.read'],
        body: 'Acá están los retiros que salieron del cierre y todavía no tienen dueño.',
        items: [
          'Marcá retirado cuando la plata ya salió.',
          'Asigná la cuenta del socio cuando sepas a quién va.',
        ],
      },
    ],
  },
  {
    id: 'settlements',
    title: 'Rendiciones',
    summary: 'Cuentas aparte que se rinden después, no en el cierre del día.',
    blocks: [
      {
        title: 'Seguimiento',
        icon: 'account_balance_wallet',
        tone: 'read',
        anyOf: ['settlements.read'],
        body: 'Pendiente vs realizado, según las cuentas aparte del local (efectivo o depósito).',
        tip: 'Si un local rinde “después”, esas cuentas aparecen acá y no se dan por cerradas en el día.',
      },
    ],
  },
  {
    id: 'expenses',
    title: 'Gastos',
    summary: 'Salidas de plata: manuales, del cierre y pagos abonados.',
    blocks: [
      {
        title: 'La lista',
        icon: 'visibility',
        tone: 'read',
        anyOf: ['expenses.read'],
        body: 'Acá ves los egresos del local, incluidos los de pagos abonados. En Transacciones están gastos, ingresos y pases juntos.',
        items: [
          'Origen: Cierre, Pago o Manual.',
          'Tipo de pago: a proveedores, servicios o empleados (solo filas de pagos).',
          'En Transacciones también filtrás por tipo (gasto, ingreso o pase), cuenta, forma de pago, empleado, comprobante y turno si el local tiene más de uno.',
          'También podés filtrar por concepto, facturado y texto en la descripción.',
          'Descargar Excel o PDF usa los mismos filtros que la lista.',
          'Si el gasto tiene comprobante, aparece en la columna Comprobante. El clip lo abre (foto o PDF).',
          'En computadora, Acciones queda fija a la derecha: no hace falta scrollear al final de la fila.',
          'En el teléfono, el lápiz abre el gasto. Tocar la tarjeta no lo edita.',
        ],
        tip: 'Un gasto de un pago se puede editar: el pago se actualiza solo. No lo borres: revertí el pago en Pagos.',
      },
      {
        title: 'Saldos',
        icon: 'account_balance_wallet',
        tone: 'read',
        anyOf: ['expenses.read', 'incomes.read', 'accountTransfers.read'],
        body: 'Cada cuenta suma lo que entra y resta lo que sale. Ingreso y Egreso no se listan: son el origen y el destino del libro.',
        items: [
          'Si PVS queda negativo, pagó gastos o pases a socios por más de lo que le ingresó.',
          'Tocá una cuenta para ver sus movimientos. Ahí filtrás por período, tipo, concepto, origen y texto.',
          'Al importar el Excel, la pestaña Saldos muestra cómo quedaría cada cuenta antes de confirmar.',
          'Gemini lee el mismo archivo y te explica en la vista previa por qué un saldo queda raro.',
        ],
      },
      {
        title: 'Cargar un gasto',
        icon: 'payments',
        tone: 'do',
        anyOf: ['expenses.manage'],
        body: 'Con Gasto rápido elegís concepto, forma de pago (efectivo, transferencia o tarjeta) y de qué cuenta sale. Siempre va a Egreso. Si es transferencia o tarjeta, el comprobante es obligatorio (foto o archivo). El aviso a administradores se envía siempre.',
        tip: 'Usá Descargar plantilla o el Excel del contador. En la vista previa Gemini analiza el archivo, elegís módulos, asignás cuentas y conceptos, y en Saldos ves cómo queda cada cuenta.',
      },
      {
        title: 'Editar o borrar',
        icon: 'lock',
        tone: 'lock',
        body: 'Editar y borrar un gasto lo puede el super admin y las personas que él habilite en Usuarios. Crear un gasto sigue con el permiso de gestionar gastos. Al guardar o borrar podés avisar a quien elijas; Todos los admins marca a los administradores del local.',
      },
    ],
  },
  {
    id: 'account-transfers',
    title: 'Movimientos entre cuentas',
    summary: 'Pases de una cuenta a otra, sin concepto.',
    blocks: [
      {
        title: 'La lista',
        icon: 'visibility',
        tone: 'read',
        anyOf: ['accountTransfers.read'],
        body: 'Solo transferencias entre cuentas. Filtrá por fecha o texto.',
      },
      {
        title: 'Transferir',
        icon: 'swap_horiz',
        tone: 'do',
        anyOf: ['accountTransfers.manage'],
        body: 'Indicá origen, destino y monto. No lleva concepto. Aparecen las cuentas tildadas en Cuentas → Mostrar esta cuenta en → Movimientos entre cuentas. Los proveedores y servicios no se listan: se pagan desde Pagos.',
        tip: 'La plantilla es la misma del libro. En la vista previa Gemini analiza el archivo; marcá módulos, asigná cuentas y conceptos, y en Saldos ves cómo queda cada cuenta.',
      },
    ],
  },
  {
    id: 'partner-splits',
    title: 'División de socios',
    summary: 'Reparto igualitario entre socios, con dinero a dejar en cada cuenta.',
    blocks: [
      {
        title: 'Cómo se arma',
        icon: 'groups',
        tone: 'read',
        anyOf: ['partnerSplits.read'],
        body: 'Toma los saldos de socios y canales. El total menos lo que dejás en cada cuenta y los extras se reparte en partes iguales entre los socios marcados.',
        items: [
          'Diferencia a saldar = lo que tiene que quedar menos el saldo de hoy.',
          'Si es positivo, esa cuenta recibe. Si es negativo, esa cuenta pone.',
          'En el teléfono ves una tarjeta por cuenta. En computadora es una tabla: socios arriba, canales abajo, y Dejar al lado del saldo.',
          'Se queda es cuánto queda en esa cuenta al cerrar: socios y canales.',
          'TOTAL a repartir es lo que se va a mover ahora. Si los socios ya están parejos y los canales en cero, queda $0.',
          'Dejar en la cuenta está en socios y canales: esa plata queda ahí y no se reparte. En un socio, Se queda es su parte más lo que dejaste.',
          'Exportar PDF baja una hoja: resumen, socios, canales con movimiento y los pases Sale de → Entra a.',
          'En el PDF, Pasa significa que esa cuenta pone plata y Recibe que esa cuenta cobra.',
          'En Divisiones queda cada aplicación. Detalle abre el armado: socios, canales, pases y si fue pago, movimiento o completo. PDF baja la misma hoja.',
          'En Pases que se van a crear ves de qué cuenta sale cada pase, a cuál llega y el importe.',
        ],
      },
      {
        title: 'Aplicar',
        icon: 'swap_horiz',
        tone: 'do',
        anyOf: ['partnerSplits.manage'],
        body: 'Aplicar abre un modal. Cada tarjeta es un pase de una cuenta a otra. Entre socios elegís pago o movimiento. En un canal, Completo decide si se anota ese pase: si no lo marcás, no se mueve y vuelve a aparecer la próxima vez.',
        items: [
          'Pago: queda en A socios, validado, con la cuenta que sale y la que entra.',
          'Movimiento: se anota ese pase en Movimientos entre cuentas.',
          'Completo en un canal anota ese pase. Sin Completo, no se transfiere el saldo.',
          'Si no hay pases entre socios ni ningún Completo, Aplicar queda bloqueado.',
        ],
        tip: 'Guardá el armado si querés seguir después. Aplicar no se puede deshacer.',
      },
    ],
  },
  {
    id: 'incomes',
    title: 'Ingresos',
    summary: 'Entradas de plata al local: de la cuenta Ingreso a una caja o canal.',
    blocks: [
      {
        title: 'La lista',
        icon: 'visibility',
        tone: 'read',
        anyOf: ['incomes.read'],
        body: 'Acá ves lo que entra al local. Sale de Ingreso y llega a una cuenta (efectivo, MP, etc.).',
        items: [
          'Filtrá por período, concepto y texto.',
          'No se mezclan con gastos ni con pases entre cuentas.',
        ],
        tip: 'Si un ingreso no aparece, fijate el período o si quedó como movimiento entre cuentas.',
      },
      {
        title: 'Cargar un ingreso',
        icon: 'south_west',
        tone: 'do',
        anyOf: ['incomes.manage'],
        body: 'Con Ingreso rápido elegís concepto, a qué cuenta entra y el monto. Siempre sale de Ingreso. El aviso a administradores se envía siempre.',
        tip: 'Importar Excel usa el mismo archivo del contador. En la vista previa Gemini lo analiza; marcá Ingresos, asigná cuentas y conceptos, y en Saldos ves cómo queda cada cuenta.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Pagos',
    summary: 'A proveedores, servicios, empleados o socios: primero se valida, después se paga.',
    blocks: [
      {
        title: 'Dos pestañas',
        icon: 'tab',
        tone: 'read',
        anyOf: ['payments.read'],
        body: 'Arriba está el recorte del día a día. No hace falta pelear con el filtro de estado.',
        items: [
          'Pendientes: a validar y ya validados que faltan pagar.',
          'Pagados: por defecto solo pagados.',
          'En Pagados podés sumar rechazados y cancelados; si no los pedís, no se mezclan.',
          'Al lado de las pestañas elegís el orden. Por defecto, la última modificación.',
        ],
        tip: 'Si no ves un pago, cambió de pestaña. Un pagado no aparece en Pendientes.',
      },
      {
        title: 'Filtros y vistas',
        icon: 'filter_alt',
        tone: 'read',
        anyOf: ['payments.read'],
        body: 'Debajo: quién valida, quién paga, vencimiento, fechas, proveedor/servicio/empleado y montos. La descripción del pago aparece debajo del concepto, con su etiqueta. En el celular la lista viene compacta: con el botón de info ves el detalle de esa fila. En la computadora: tarjetas o lista. Descargar abre Excel o PDF de lo que estás viendo.',
      },
      {
        title: 'El circuito',
        icon: 'paid',
        tone: 'do',
        anyOf: ['payments.manage'],
        body: 'Creá el pago, alguien valida, otro paga. Subí factura y comprobante cuando corresponda.',
        items: [
          'Si tenés el permiso de editar y borrar pagos, al crear podés elegir el estado (pendiente, validado o pagado).',
          'En Proveedor podés buscar por nombre, CUIT o alias.',
          'Validar: elegí la cuenta que paga. Ahí recién se pide, no al crear.',
          'Pagar: elegí cuenta y forma de pago. En proveedores, servicios o empleados se crea un gasto. En A socios se hace el pase de la cuenta emisora a la receptora.',
          'A socios: pagos de una división. Nacen ya validados, con cuenta que sale y cuenta que entra.',
          'Un abonado no se edita: usá Marcar no pagado (borra el gasto), editá y volvé a abonar.',
          'En un pago pagado, Ver en gastos abre el gasto. Desde el gasto podés editarlo y el pago se actualiza. Antes de editar un pago te pide confirmación.',
          'Rechazar o cancelar: sale de Pendientes; en Pagados solo si activás esos chips.',
        ],
        tip: 'Al abonar se crea el gasto; al marcar no pagado se elimina. No borres el gasto desde Gastos.',
      },
      {
        title: 'Editar o borrar',
        icon: 'lock',
        tone: 'lock',
        body: 'Editar y borrar un pago lo puede el super admin y las personas que él habilite en Usuarios. Esas mismas personas, al crear un pago, pueden elegir el estado. Crear, validar y abonar siguen con los permisos de siempre. Al guardar o borrar podés avisar a quien elijas; Todos los admins marca a los administradores del local.',
      },
    ],
  },
  {
    id: 'suppliers',
    title: 'Proveedores',
    summary: 'A quién le comprás: nombre, datos y cuenta para pagarles.',
    blocks: [
      {
        title: 'Consultar',
        icon: 'inventory_2',
        tone: 'read',
        anyOf: ['suppliers.read'],
        body: 'La lista alimenta los pagos a proveedores. En el celular hay vista compacta o detallada.',
      },
      {
        title: 'Alta y edición',
        icon: 'tune',
        tone: 'do',
        anyOf: ['suppliers.manage'],
        body: 'Creá, editá o desactivá. Cada proveedor puede tener su cuenta para el pago.',
      },
    ],
  },
  {
    id: 'services',
    title: 'Servicios',
    summary: 'Luz, gas, internet y demás: el catálogo para pagos a servicios.',
    blocks: [
      {
        title: 'Consultar',
        icon: 'home_repair_service',
        tone: 'read',
        anyOf: ['services.read'],
        body: 'Listado del local. Se usa al cargar un pago “a servicios”.',
      },
      {
        title: 'Alta y edición',
        icon: 'tune',
        tone: 'do',
        anyOf: ['services.manage'],
        body: 'Creá o editá el servicio y, si aplica, la cuenta con la que se paga.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reportes',
    summary: 'El período en números: KPIs, tablas y descarga en Excel o PDF si te lo habilitan.',
    blocks: [
      {
        title: 'Mirar el período',
        icon: 'insights',
        tone: 'read',
        anyOf: ['reports.view'],
        body: 'Elegí fechas y ves totales, movimientos y tablas. Tocá Abrir (o la fila) para ir al cierre. Si hay presentismo, el Excel general puede incluir esas hojas.',
      },
      {
        title: 'Descargar',
        icon: 'download',
        tone: 'do',
        anyOf: ['reports.export'],
        body: 'El botón Descargar del encabezado abre Excel o PDF del recorte que estás viendo.',
      },
    ],
  },
  {
    id: 'reports-concepts',
    title: 'Conceptos (reporte)',
    summary: 'Cuánto se fue (o entró) por cada concepto, y el % del total.',
    blocks: [
      {
        title: 'Cómo leerlo',
        icon: 'pie_chart',
        tone: 'read',
        anyOf: ['reports.view'],
        body: 'Filtrá período y tipo (egreso, ingreso, transferencia). La tabla suma importes; los % cierran en 100%.',
      },
      {
        title: 'Descargar',
        icon: 'table_view',
        tone: 'do',
        anyOf: ['reports.export'],
        body: 'El mismo botón ofrece Excel o PDF de la tabla.',
      },
    ],
  },
  {
    id: 'reports-products',
    title: 'Ventas POS',
    summary: 'Qué se vendió, según el sistema de ventas del local.',
    blocks: [
      {
        title: 'Requisito',
        icon: 'restaurant_menu',
        tone: 'read',
        anyOf: ['reports.view'],
        body: 'Hace falta un sistema POS configurado (Restosoft, WeMenu, etc.). Si no hay conector, esta pantalla no tiene de dónde leer.',
      },
    ],
  },
  {
    id: 'reports-stats',
    title: 'Estadísticas',
    summary: 'Gráficos para ver cómo viene el período, no una planilla.',
    blocks: [
      {
        title: 'Los gráficos',
        icon: 'analytics',
        tone: 'read',
        anyOf: ['reports.view'],
        body: 'Evolución y mix del rango elegido: ingresos, egresos y canales.',
      },
    ],
  },
  {
    id: 'reservations',
    title: 'Reservas',
    summary: 'Mesas del día, pedidos que llegan por la web y el tablero de salón.',
    blocks: [
      {
        title: 'La agenda',
        icon: 'calendar_month',
        tone: 'read',
        anyOf: ['reservations.read'],
        body: 'Semana o día, adentro y afuera. El tablero de sala y esta agenda se actualizan solos cuando alguien carga o sienta una mesa.',
      },
      {
        title: 'Operar',
        icon: 'table_restaurant',
        tone: 'do',
        anyOf: ['reservations.manage'],
        body: 'Creá, editá, sentá o cancelá. Las solicitudes públicas se aceptan o rechazan acá.',
        items: [
          'Tablero para la sala: /r',
          'Formulario para el cliente: /reservar. Si falta un campo obligatorio, te dice cuál.',
          'Consulta de reserva por mail: /mi-reserva (pendiente, confirmada o rechazada con motivo).',
          'Horarios y textos del formulario: Salón → Horarios.',
          'Ahí también elegís si el horario es obligatorio. Un día se cambia en Aviso y cupos.',
          'Desde el admin podés cargar sin tope de cupo.',
          'Abierto / Adentro / Afuera piden confirmación, para no cambiarlos sin querer.',
        ],
      },
    ],
  },
  {
    id: 'waiting-list',
    title: 'Lista de espera',
    summary: 'Quién espera mesa, adentro o afuera.',
    blocks: [
      {
        title: 'La cola',
        icon: 'hourglass_top',
        tone: 'read',
        anyOf: ['waitingList.read'],
        body: 'Vas a ver el orden de espera del salón. La pantalla /w se actualiza sola cuando entra o sale alguien de la cola.',
      },
      {
        title: 'Llamar y cerrar',
        icon: 'notifications_active',
        tone: 'do',
        anyOf: ['waitingList.manage'],
        body: 'Anotá a quien llega. Mesa lista avisa en la pantalla pública (/w) que ya pueden sentarse. Sentar los saca de la cola.',
        items: [
          'Mesa lista: se ve destacado en la pantalla pública.',
          'Sentar: sale de la lista.',
          'WhatsApp: si hay teléfono, avisales.',
        ],
        tip: 'La pantalla pública se actualiza sola cuando marcás Mesa lista.',
      },
    ],
  },
  {
    id: 'salon',
    title: 'Salón',
    summary: 'El mapa de mesas y cuánta gente entra en cada sector. No son las normas de servicio.',
    blocks: [
      {
        title: 'El diagrama',
        icon: 'grid_view',
        tone: 'read',
        anyOf: ['reservations.read'],
        body: 'Mesas físicas por sector. Si otro dispositivo cambia el mapa, esta pantalla se actualiza sola.',
        items: [
          'Si no hay mesas ni cantidades, al entrar se arma solo con el pico de reservas confirmadas: mesas de 2 y 3, y reglas por tamaño.',
          'Después podés sumar, quitar o cambiar cada mesa. Armar desde reservas vuelve a calcularlo.',
        ],
      },
      {
        title: 'Las reglas',
        icon: 'tune',
        tone: 'do',
        anyOf: ['reservations.manage'],
        body: 'Cuántas mesas armadas de cada tamaño por sector. Si el salón estaba vacío, ya vienen del pico de reservas.',
        items: [
          'Cambiá tamaño o cantidad y tocá Guardar. Con + tamaño sumás uno que falte, por ejemplo 1 de 8.',
        ],
        tip: 'Juntar mesas grandes descuenta de estas cantidades. Armar desde reservas pisa las reglas; las mesas de más se dejan.',
      },
      {
        title: 'Horarios y mensajes',
        icon: 'schedule',
        tone: 'do',
        anyOf: ['reservations.manage'],
        body: 'En Horarios está el mensaje de todos los días y si el horario es opcional u obligatorio. Tocá un día para editar sus turnos y el texto. Eso se ve en Reservá tu mesa. Un día puntual (aviso, cupo u horario) se carga en Reservas.',
        tip: 'Si un día no tiene horarios, el cliente pide mesa sin elegir hora aunque esté marcado como obligatorio.',
      },
    ],
  },
  {
    id: 'stock',
    title: 'Stock alimentos',
    summary: 'Qué hay en cocina y qué está por faltar.',
    blocks: [
      {
        title: 'La foto',
        icon: 'inventory',
        tone: 'read',
        anyOf: ['stock.read'],
        body: 'Tarjetas o lista, A–Z o por faltante. Lo que está bajo el mínimo se destaca.',
      },
      {
        title: 'Ajustar',
        icon: 'tune',
        tone: 'do',
        anyOf: ['stock.manage'],
        body: 'Cantidades, mínimos, envíos entre locales y un snapshot para compartir con admins.',
      },
    ],
  },
  {
    id: 'beverage-stock',
    title: 'Stock bebidas',
    summary: 'Lo mismo que alimentos, para bar.',
    blocks: [
      {
        title: 'La foto',
        icon: 'local_bar',
        tone: 'read',
        anyOf: ['beverageStock.read'],
        body: 'Misma lógica que stock de alimentos: cantidades y alertas de mínimo.',
      },
      {
        title: 'Ajustar',
        icon: 'tune',
        tone: 'do',
        anyOf: ['beverageStock.manage'],
        body: 'Cargas, mínimos y avisos cuando baja el stock.',
      },
    ],
  },
  {
    id: 'shortages',
    title: 'Faltantes',
    summary: 'Lo que no hay: nada, poco, normal o mucho.',
    blocks: [
      {
        title: 'El listado',
        icon: 'report',
        tone: 'read',
        anyOf: ['shortages.read'],
        body: 'Filtrá por nivel. Los críticos avisan a los admins.',
      },
      {
        title: 'Actualizar',
        icon: 'tune',
        tone: 'do',
        anyOf: ['shortages.manage'],
        body: 'Cargá el faltante y su nivel. Pasarlo a normal o mucho se toma como resuelto.',
      },
    ],
  },
  {
    id: 'orders',
    title: 'Pedidos',
    summary: 'Mercadería que entra: alimentos, bebidas o faltantes, con factura.',
    blocks: [
      {
        title: 'El listado',
        icon: 'local_shipping',
        tone: 'read',
        anyOf: ['orders.read'],
        body: 'Cada pedido tiene fecha, los materiales y la factura. Filtrá por período.',
      },
      {
        title: 'Cargar un pedido',
        icon: 'add',
        tone: 'do',
        anyOf: ['orders.manage'],
        body: 'Elegí la fecha, adjuntá la factura (obligatoria) y sumá líneas: alimento, bebida o faltante, con la cantidad que entra.',
        items: [
          'En Material podés buscar. Si no está, escribí el nombre y elegí Crear.',
          'Alimentos y bebidas suman al stock al guardar.',
          'Los faltantes quedan registrados en el pedido; el nivel no cambia solo.',
          'Si borrás el pedido, se revierte el stock que había sumado.',
        ],
        tip: 'Sin factura no se puede guardar. Usá PDF o una foto nítida.',
      },
    ],
  },
  {
    id: 'attendance',
    title: 'Asistencia · Servicio',
    summary: 'Quién vino a trabajar el turno: presente, ausente o feriado, con o sin horas.',
    blocks: [
      {
        title: 'El tablero',
        icon: 'storefront',
        tone: 'read',
        anyOf: ['attendance.read'],
        body: 'Mes, día y extras en un rango de fechas (Descargar usa Excel o PDF, desde/hasta, no un mes cerrado). El tablero público /p se actualiza cuando marcás asistencia. “Hoy” y el turno usan el mismo criterio que el cierre: el día y el turno siguen hasta que abre el siguiente.',
        tip: 'Si el local apagó “Presentismo con horario”, solo se marca presente / ausente / feriado: no hay entrada, salida ni extra.',
      },
      {
        title: 'Marcar el día',
        icon: 'check_circle',
        tone: 'do',
        anyOf: ['attendance.manage'],
        body: 'Al pasar presente se copian la entrada y salida del empleado (si las tiene) o las del local.',
        items: [
          'Podés corregir la hora por persona.',
          '“Todos presentes” no incluye rotativos.',
          'Feriado: clic derecho o mantener.',
        ],
      },
      {
        title: 'Horas extra',
        icon: 'schedule',
        tone: 'read',
        anyOf: ['attendance.read'],
        body: 'Elegí el rango y tocá Ver. Destildado, extra es lo que se quedó después de su retirada (o la del local). Podés tildar por separado “Contar llegadas tarde” y “Contar retiros temprano”. El costo usa el precio/hora del empleado.',
      },
    ],
  },
  {
    id: 'production-attendance',
    title: 'Asistencia · Producción',
    summary: 'Horas de cocina: quién produce comida y cuánto laburó.',
    blocks: [
      {
        title: 'La grilla',
        icon: 'restaurant',
        tone: 'read',
        anyOf: ['attendance.read'],
        body: 'Solo empleados marcados como “produce comida”. Es distinto del presentismo de salón.',
      },
      {
        title: 'Cargar horas',
        icon: 'check_circle',
        tone: 'do',
        anyOf: ['attendance.manage'],
        body: 'Un toque pone las horas default del local; después las podés editar.',
      },
    ],
  },
  {
    id: 'my-production',
    title: 'Mis horas de producción',
    summary: 'Tus horas, y las de tu equipo si sos supervisor.',
    blocks: [
      {
        title: 'Cargar las mías',
        icon: 'restaurant',
        tone: 'do',
        anyOf: ['attendance.self'],
        body: 'Por día, semana o mes. Si tenés equipo a cargo, también las de ellos.',
        tip: 'Esto no abre el tablero de servicio: es solo producción.',
      },
    ],
  },
  {
    id: 'employees',
    title: 'Empleados',
    summary: 'Ficha de cada persona: sueldo, tipo, horario de servicio y extra.',
    blocks: [
      {
        title: 'El listado',
        icon: 'badge',
        tone: 'read',
        anyOf: ['employees.read'],
        body: 'Fijo o rotativo, si produce comida, y lo visible según tus permisos.',
      },
      {
        title: 'La ficha',
        icon: 'tune',
        tone: 'do',
        anyOf: ['employees.manage'],
        body: 'Sueldo, precio de hora extra, alias/CBU si es productor, supervisor y usuario de la app.',
        items: [
          'Entrada y salida de servicio: si las dejás vacías, usa las del local.',
          'Eso alimenta el extra del presentismo cuando el local marca con horario.',
        ],
      },
    ],
  },
  {
    id: 'candidates',
    title: 'CVs / Candidatos',
    summary: 'Currículums que llegaron al local.',
    blocks: [
      {
        title: 'Consultar',
        icon: 'person_search',
        tone: 'read',
        anyOf: ['candidates.read'],
        body: 'Postulantes y archivos adjuntos.',
      },
      {
        title: 'Cargar',
        icon: 'upload_file',
        tone: 'do',
        anyOf: ['candidates.manage'],
        body: 'Alta y actualización de candidatos y CVs (PDF o foto).',
      },
    ],
  },
  {
    id: 'payroll',
    title: 'Liquidaciones',
    summary: 'El mes cerrado a partir del presentismo de servicio.',
    blocks: [
      {
        title: 'Cómo se arma',
        icon: 'request_quote',
        tone: 'read',
        anyOf: ['payroll.read'],
        body: 'Presentismo, feriados y extras (por horario) × sueldo/21/8, más bonus de presentismo si el local lo usa.',
      },
      {
        title: 'Cerrar el período',
        icon: 'lock',
        tone: 'lock',
        anyOf: ['payroll.manage'],
        body: 'Generá la liquidación y bloqueala cuando ya no se toca.',
      },
    ],
  },
  {
    id: 'commissions',
    title: 'Comisiones',
    summary: 'Reglas de comisión y el cálculo del período.',
    blocks: [
      {
        title: 'Consultar',
        icon: 'percent',
        tone: 'read',
        anyOf: ['commissions.read'],
        body: 'Reglas y liquidaciones ya armadas.',
      },
      {
        title: 'Calcular',
        icon: 'tune',
        tone: 'do',
        anyOf: ['commissions.manage'],
        body: 'Definí reglas y corré el cálculo del período.',
      },
    ],
  },
  {
    id: 'reimbursements',
    title: 'Reintegros',
    summary: 'Gastos de productores que el local tiene que devolver.',
    blocks: [
      {
        title: 'Cargar un gasto',
        icon: 'receipt_long',
        tone: 'do',
        anyOf: ['reimbursements.self'],
        body: 'Descripción, importe y tu alias/CBU. Un admin lo marca pagado.',
      },
      {
        title: 'Ver el local',
        icon: 'visibility',
        tone: 'read',
        anyOf: ['reimbursements.read'],
        body: 'Todos los reintegros y su estado.',
      },
      {
        title: 'Pagar',
        icon: 'paid',
        tone: 'lock',
        anyOf: ['reimbursements.manage'],
        body: 'Marcá pagado y subí el comprobante.',
      },
    ],
  },
  {
    id: 'service-rules',
    title: 'Normas de servicio',
    summary: 'Lo que hay que hacer antes, durante y después del turno, para leer o pegar en la pared.',
    blocks: [
      {
        title: 'Leer y pegar',
        icon: 'menu_book',
        tone: 'read',
        anyOf: ['serviceRules.read'],
        body: 'Cada categoría (cocina, salón, caja…) agrupa las normas de antes, durante y después. En /n, en pantallas anchas se ven en tres columnas (una por momento); en el celu van una abajo de la otra. El PDF es esa misma página, sin el botón de descargar.',
      },
      {
        title: 'Escribirlas',
        icon: 'edit_note',
        tone: 'do',
        anyOf: ['serviceRules.manage'],
        body: 'Creá categorías, ordená y editá el texto (antes, durante o después del servicio). No hace falta ser admin del local: alcanza el permiso de normas.',
      },
      {
        title: 'Borrar varias',
        icon: 'delete_sweep',
        tone: 'do',
        anyOf: ['serviceRules.manage'],
        body: 'Marcá las normas con el tilde, o usá Seleccionar todas. Después Borrar seleccionadas. Las categorías se siguen borrando de a una (y se llevan todas sus normas).',
      },
      {
        title: 'Cargar desde archivo',
        icon: 'upload_file',
        tone: 'do',
        anyOf: ['serviceRules.manage'],
        body: 'Subí un PDF, una foto o un .txt. La IA arma un borrador; lo revisás en la vista previa y confirmás. Se suma a lo que ya tenés: no borra normas. Si la categoría ya existe (mismo nombre), reutiliza esa.',
        tip: 'Si la IA no está configurada en el servidor, vas a ver un mensaje de error al subir el archivo.',
      },
    ],
  },
  {
    id: 'tips',
    title: 'Propinas',
    summary: 'Lo que dejó la gente: se carga el día y después se reparte.',
    blocks: [
      {
        title: 'Consultar',
        icon: 'volunteer_activism',
        tone: 'read',
        anyOf: ['tips.read'],
        body: 'El día y el histórico.',
      },
      {
        title: 'Cargar el día',
        icon: 'add_card',
        tone: 'do',
        anyOf: ['tips.create'],
        body: 'Total en efectivo, transferencia y tickets.',
      },
      {
        title: 'Reparto',
        icon: 'tune',
        tone: 'do',
        anyOf: ['tips.manage'],
        body: 'Quién se lleva qué. Podés marcar entregado (incluso a todos de una).',
      },
    ],
  },
  {
    id: 'admin-shop',
    title: 'Local',
    summary: 'Cara del local: logo, horarios, módulos públicos y cómo opera el presentismo.',
    blocks: [
      {
        title: 'Configurar',
        icon: 'storefront',
        tone: 'do',
        anyOf: ['shops.manage'],
        body: 'Identidad, mails, menú lateral, francos y horarios.',
        items: [
          'Menú lateral: creá grupos, reordená con las flechas y con ⋮ renombrá, mové de grupo u ocultá módulos.',
          'Tocá el título de cada bloque para expandir o contraer la configuración.',
          'Turnos: nombre, días de la semana, apertura y cierre. Si ese día hay un solo turno, no se pide elegir en el cierre ni en el presentismo.',
          'Entrada y salida de servicio: default para quien no tiene horario propio (si el turno es de día completo).',
          'Presentismo con horario: si lo apagás, el tablero es solo presente / ausente / feriado.',
          'Módulos públicos: carta /m, normas /n, reservas, presentismo.',
          'iPad antiguo (iOS 9): usá /legacy/index.html. Safari viejo no puede abrir la app normal.',
        ],
      },
      {
        title: 'Dump (super admin)',
        icon: 'backup',
        tone: 'lock',
        body: 'En Zona peligrosa abrís Dump y reset. Podés bajar Excel o SQL, por módulo o todo el local. Cargar dump solo acepta Excel. El reset pide escribir RESET.',
        items: [
          'Por módulos ves todos los de la app, cada uno aparte: cierres, a retirar, rendiciones, gastos, ingresos, movimientos, división de socios, pagos, reservas, salón, stock, personal, POS, cuentas y conceptos.',
        ],
        tip: 'Si vaciás conceptos, también se limpian movimientos, gastos, ingresos y pagos. Los cierres se resetean aparte.',
      },
    ],
  },
  {
    id: 'admin-shops',
    title: 'Locales',
    summary: 'La red de locales. Solo super admin.',
    blocks: [
      {
        title: 'La red',
        icon: 'admin_panel_settings',
        tone: 'lock',
        body: 'Creá o desactivá locales. El resto de la app vive adentro de un local elegido.',
      },
    ],
  },
  {
    id: 'admin-users',
    title: 'Usuarios',
    summary: 'Quién entra y qué puede tocar en cada módulo.',
    blocks: [
      {
        title: 'Permisos',
        icon: 'group',
        tone: 'do',
        anyOf: ['users.manage'],
        body: 'Invitá gente y asigná un preset (cajero, productor, recepcionista…) o módulos uno a uno.',
        items: [
          'El rol Empleado también puede tener módulos extra (propinas, normas, reintegros…).',
          'Productor = sus horas + sus reintegros, no el tablero de servicio.',
          'Cierres, A Retirar, Rendiciones, Gastos y Movimientos entre cuentas se tildan por separado.',
          'Solo un super admin puede marcar “Puede editar y borrar gastos” y “Puede editar y borrar pagos”.',
        ],
        tip: 'La columna Foto y el nombre muestran la foto de perfil si la cargó el usuario.',
      },
    ],
  },
  {
    id: 'admin-accounts',
    title: 'Cuentas',
    summary: 'Cajas, bancos y cuentas de sistema que usa el dinero del local.',
    blocks: [
      {
        title: 'El plan',
        icon: 'account_balance',
        tone: 'do',
        anyOf: ['accounts.manage'],
        body: 'Se usan en gastos, transferencias entre cuentas, pagos y cierres. Sin cuenta, no hay dónde anotar la plata.',
        items: [
          'Saldo inicial: se suma al saldo de movimientos. Si la cuenta ya tiene plata y después le ponés un inicial, ese monto se agrega (no reemplaza). Solo lo carga un super admin.',
          'Arriba hay pestañas por tipo: Todas, Canales, Socios y Sistema. Abajo filtrás por estado (activas/inactivas) y por retiro (visible/oculta).',
          'En cada cuenta tildá dónde se lista: Gastos, Ingresos, Movimientos entre cuentas y Cierres (quién se lo lleva).',
        ],
      },
    ],
  },
  {
    id: 'admin-concepts',
    title: 'Conceptos',
    summary: 'Las etiquetas de cada movimiento o pago (alquiler, mercadería, sueldo…).',
    blocks: [
      {
        title: 'El catálogo',
        icon: 'sell',
        tone: 'do',
        anyOf: ['concepts.manage'],
        body: 'Tipo ingreso, egreso o transferencia, y categorías (incluida Cierre, para los egresos del cierre de caja). Descargá la plantilla y subila con Importar Excel.',
      },
      {
        title: 'Borrar varios',
        icon: 'delete_sweep',
        tone: 'do',
        anyOf: ['concepts.manage'],
        body: 'Marcá los conceptos con el tilde (o el de la cabecera de la página). Aparece Eliminar seleccionados arriba de la tabla.',
        tip: 'También podés borrar de a uno desde Acciones en cada fila.',
      },
    ],
  },
  {
    id: 'admin-messages',
    title: 'Mensajes',
    summary: 'Cómo suenan los mails del local.',
    blocks: [
      {
        title: 'Plantillas',
        icon: 'mail',
        tone: 'do',
        anyOf: ['shops.manage'],
        body: 'Primero Al comensal y después Al equipo. Tocá un mensaje para editarlo en el diálogo: Asunto, Cuerpo y Guardar.',
        tip: 'Reiniciar en el diálogo vuelve al texto original. El chip Editado marca los que ya personalizaste.',
        items: [
          'Placeholders: {shop} {guest} {name} {detail} {title} {body}.',
        ],
      },
    ],
  },
  {
    id: 'admin-menu',
    title: 'Carta',
    summary: 'El menú que ve el cliente en /m: ítems, archivo físico y PDF con la misma cara.',
    blocks: [
      {
        title: 'Publicar',
        icon: 'restaurant_menu',
        tone: 'do',
        anyOf: ['shops.manage'],
        body: 'Podés tener varias cartas (comida, vinos…). La página pública existe si el módulo está activo en Local.',
        items: [
          'Cargar carta física: el PDF o la foto que se abre en la web.',
          'PDF para imprimir: misma cara que la web (logo, tipografía, precios), sin buscar, filtros ni botones.',
        ],
      },
    ],
  },
  {
    id: 'admin-qr',
    title: 'QR',
    summary: 'Un código para abrir reservas, presentismo, normas o la carta.',
    blocks: [
      {
        title: 'Armarlo',
        icon: 'qr_code_2',
        tone: 'do',
        anyOf: ['shops.manage'],
        body: 'Pegá el link (o un Wi‑Fi / texto). En Descripción del cartel escribí la frase que va debajo del QR. El PNG es solo el código; el PDF es una hoja con logo, nombre del local, QR centrado y esa descripción. No imprime el link ni la pantalla de armado.',
      },
    ],
  },
  {
    id: 'admin-sales-systems',
    title: 'Sistemas de ventas',
    summary: 'Cómo se lee el reporte del POS (Restosoft, WeMenu, etc.).',
    blocks: [
      {
        title: 'El conector',
        icon: 'dns',
        tone: 'do',
        anyOf: ['shops.manage'],
        body: 'Sin esto, Ventas POS no sabe interpretar el archivo que subís.',
      },
    ],
  },
  {
    id: 'admin-pos-products',
    title: 'Platos y rubros POS',
    summary: 'Nombres del sistema de ventas mapeados a lo que quieren ver en el reporte.',
    blocks: [
      {
        title: 'El mapeo',
        icon: 'restaurant_menu',
        tone: 'do',
        anyOf: ['shops.manage'],
        body: 'Para que el reporte de ventas agrupe platos y rubros como en el local, no como salen crudos del POS.',
      },
    ],
  },
  {
    id: 'admin-help',
    title: 'Instrucciones',
    summary: 'El manual de la app: un tema por módulo, como este mismo recuadro.',
    blocks: [
      {
        title: 'Cómo usarlo',
        icon: 'help_outline',
        tone: 'read',
        anyOf: ['shops.manage'],
        body: 'Buscá un módulo o andá al índice. El PDF es esta guía completa, sin buscador ni botones.',
        tip: 'En cada pantalla, el ícono i del título abre solo el tema de esa pantalla.',
      },
    ],
  },
];

const PATH_HELP: Array<{ test: (path: string) => boolean; id: string }> = [
  { test: (p) => p === '/' || p === '', id: 'home' },
  { test: (p) => p.startsWith('/profile'), id: 'profile' },
  { test: (p) => p.startsWith('/closings/new') || /\/closings\/[^/]+$/.test(p), id: 'closings-new' },
  { test: (p) => p.startsWith('/closings'), id: 'closings' },
  { test: (p) => p.startsWith('/cash-withdrawals'), id: 'cash-withdrawals' },
  { test: (p) => p.startsWith('/settlements'), id: 'settlements' },
  { test: (p) => p.startsWith('/expenses'), id: 'expenses' },
  { test: (p) => p.startsWith('/incomes'), id: 'incomes' },
  { test: (p) => p.startsWith('/account-transfers'), id: 'account-transfers' },
  { test: (p) => p.startsWith('/partner-splits') || p.startsWith('/splits'), id: 'partner-splits' },
  { test: (p) => p.startsWith('/transactions'), id: 'expenses' },
  { test: (p) => p.startsWith('/movements'), id: 'expenses' },
  { test: (p) => p.startsWith('/payments'), id: 'payments' },
  { test: (p) => p.startsWith('/suppliers'), id: 'suppliers' },
  { test: (p) => p.startsWith('/services'), id: 'services' },
  { test: (p) => p.startsWith('/reports/concepts'), id: 'reports-concepts' },
  { test: (p) => p.startsWith('/reports/products'), id: 'reports-products' },
  { test: (p) => p.startsWith('/reports/stats'), id: 'reports-stats' },
  { test: (p) => p.startsWith('/reports'), id: 'reports' },
  { test: (p) => p.startsWith('/reservations'), id: 'reservations' },
  { test: (p) => p.startsWith('/waiting-list'), id: 'waiting-list' },
  { test: (p) => p.startsWith('/salon'), id: 'salon' },
  { test: (p) => p.startsWith('/beverage-stock'), id: 'beverage-stock' },
  { test: (p) => p.startsWith('/stock'), id: 'stock' },
  { test: (p) => p.startsWith('/shortages'), id: 'shortages' },
  { test: (p) => p.startsWith('/orders'), id: 'orders' },
  { test: (p) => p.startsWith('/my-production'), id: 'my-production' },
  { test: (p) => p.startsWith('/production-attendance'), id: 'production-attendance' },
  { test: (p) => p.startsWith('/attendance'), id: 'attendance' },
  { test: (p) => p.startsWith('/employees'), id: 'employees' },
  { test: (p) => p.startsWith('/candidates'), id: 'candidates' },
  { test: (p) => p.startsWith('/payroll'), id: 'payroll' },
  { test: (p) => p.startsWith('/commissions'), id: 'commissions' },
  { test: (p) => p.startsWith('/reimbursements'), id: 'reimbursements' },
  { test: (p) => p.startsWith('/service-rules'), id: 'service-rules' },
  { test: (p) => p.startsWith('/tips'), id: 'tips' },
  { test: (p) => p.startsWith('/admin/shops'), id: 'admin-shops' },
  { test: (p) => p.startsWith('/admin/shop'), id: 'admin-shop' },
  { test: (p) => p.startsWith('/admin/users'), id: 'admin-users' },
  { test: (p) => p.startsWith('/admin/accounts'), id: 'admin-accounts' },
  { test: (p) => p.startsWith('/admin/concepts'), id: 'admin-concepts' },
  { test: (p) => p.startsWith('/admin/messages'), id: 'admin-messages' },
  { test: (p) => p.startsWith('/admin/menu'), id: 'admin-menu' },
  { test: (p) => p.startsWith('/admin/qr'), id: 'admin-qr' },
  { test: (p) => p.startsWith('/admin/sales-systems'), id: 'admin-sales-systems' },
  { test: (p) => p.startsWith('/admin/pos-products'), id: 'admin-pos-products' },
  { test: (p) => p.startsWith('/admin/instrucciones'), id: 'admin-help' },
];

export function helpIdFromPath(url: string): string | null {
  const path = url.split('?')[0];
  const hit = PATH_HELP.find((r) => r.test(path));
  return hit?.id ?? null;
}

export function topicById(id: string | null | undefined): HelpTopic | null {
  if (!id) return null;
  return HELP_TOPICS.find((t) => t.id === id) ?? null;
}

const TOPIC_ICONS: Record<string, string> = {
  home: 'home',
  profile: 'manage_accounts',
  closings: 'point_of_sale',
  'closings-new': 'point_of_sale',
  'cash-withdrawals': 'payments',
  settlements: 'account_balance_wallet',
  expenses: 'payments',
  'account-transfers': 'swap_horiz',
  payments: 'payments',
  suppliers: 'inventory_2',
  services: 'home_repair_service',
  reports: 'insights',
  'reports-concepts': 'category',
  'reports-products': 'restaurant_menu',
  'reports-stats': 'analytics',
  reservations: 'table_restaurant',
  'waiting-list': 'hourglass_top',
  salon: 'grid_view',
  stock: 'inventory',
  'beverage-stock': 'local_bar',
  shortages: 'report',
  orders: 'local_shipping',
  attendance: 'storefront',
  'production-attendance': 'restaurant',
  'my-production': 'restaurant',
  employees: 'badge',
  candidates: 'person_search',
  payroll: 'request_quote',
  commissions: 'percent',
  reimbursements: 'receipt_long',
  'service-rules': 'menu_book',
  tips: 'volunteer_activism',
  'admin-shop': 'storefront',
  'admin-shops': 'store',
  'admin-users': 'group',
  'admin-accounts': 'account_balance',
  'admin-concepts': 'sell',
  'admin-messages': 'mail',
  'admin-menu': 'menu_book',
  'admin-qr': 'qr_code_2',
  'admin-sales-systems': 'dns',
  'admin-pos-products': 'restaurant_menu',
  'admin-help': 'help_outline',
};

const BLOCK_ICONS: Record<string, string> = {
  'Qué ves': 'visibility',
  Ver: 'visibility',
  'Ver todos': 'visibility',
  Gestionar: 'tune',
  'Crear y editar': 'edit_note',
  Bloquear: 'lock',
  Uso: 'touch_app',
  Marcar: 'check_circle',
  'Costo extra': 'schedule',
  Exportar: 'download',
  Excel: 'table_view',
  Diagrama: 'grid_view',
  'Reglas de mesas': 'tune',
  Productor: 'restaurant',
  'Mis gastos': 'receipt_long',
  Pagar: 'paid',
  Cargar: 'add_card',
  'Super admin': 'admin_panel_settings',
  Alcance: 'list_alt',
};

export function helpTopicIcon(id: string): string {
  return TOPIC_ICONS[id] ?? 'info';
}

export function helpBlockIcon(block: HelpBlock | string): string {
  if (typeof block !== 'string' && block.icon) return block.icon;
  const title = typeof block === 'string' ? block : block.title;
  return BLOCK_ICONS[title] ?? 'info';
}

export function helpBlockTone(block: HelpBlock | string): HelpBlockTone {
  if (typeof block !== 'string' && block.tone) return block.tone;
  const t = (typeof block === 'string' ? block : block.title).toLowerCase();
  if (/(bloquear|pagar|super admin)/.test(t)) return 'lock';
  if (/(gestionar|crear|marcar|cargar|exportar|excel|productor)/.test(t)) return 'do';
  if (/(ver|qué ves|alcance|diagrama|uso)/.test(t)) return 'read';
  return 'info';
}

export type HelpBodyPart = { kind: 'text' | 'code'; value: string };

export function helpBodyParts(body: string): HelpBodyPart[] {
  const parts: HelpBodyPart[] = [];
  const re = /(\/[a-zA-Z][\w/-]*|\{[a-zA-Z]+\})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push({ kind: 'text', value: body.slice(last, m.index) });
    parts.push({ kind: 'code', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ kind: 'text', value: body.slice(last) });
  return parts.length ? parts : [{ kind: 'text', value: body }];
}
