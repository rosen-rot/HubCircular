/**
 * Glosario único de HubCircular: lo usan los iconos (i) de cada pantalla y la página /ayuda.
 * Mantener el lenguaje simple: primero qué es, después un ejemplo. Los nombres técnicos se conservan entre paréntesis
 * porque aparecen en documentos y exportaciones.
 */
export interface GlossaryEntry {
  /** Nombre que se muestra (claro, con el término técnico entre paréntesis si hace falta). */
  name: string;
  /** Una o dos frases: qué es. Es lo que muestra el icono (i). */
  short: string;
  /** Detalle y ejemplo para la página de ayuda. */
  detail: string;
  group: GlossaryGroup;
}

export type GlossaryGroup = "pesaje" | "lugares" | "lotes" | "comprobantes" | "tablero" | "sensores" | "cuentas";

export const GLOSSARY_GROUPS: { id: GlossaryGroup; title: string; intro: string }[] = [
  { id: "pesaje", title: "Al pesar", intro: "Los datos que se anotan cada vez que se pesa un contenedor." },
  { id: "lugares", title: "Lugares y contenedores", intro: "Dónde está el material y cómo se identifica." },
  { id: "lotes", title: "Lotes y movimientos", intro: "Qué pasa con el material después de pesarlo." },
  { id: "comprobantes", title: "Comprobantes y confirmaciones", intro: "Cómo se respalda que el material fue retirado y aprovechado." },
  { id: "tablero", title: "Tablero de indicadores", intro: "Qué significa cada cifra y cada estado del tablero." },
  { id: "sensores", title: "Sensores y dispositivos", intro: "Los equipos que miden por su cuenta y cómo se distinguen de un pesaje confirmado." },
  { id: "cuentas", title: "Cuentas y permisos", intro: "Quién puede hacer qué." },
];

export const GLOSSARY = {
  // --- Al pesar ---
  pesaje: {
    group: "pesaje",
    name: "Pesaje",
    short: "El registro de haber pesado un contenedor: cuánto material había y cuándo.",
    detail: "Cada pesaje válido crea automáticamente un lote. Un pesaje no se edita ni se borra: si hubo un error se registra otro movimiento que lo corrige.",
  },
  bruto: {
    group: "pesaje",
    name: "Peso bruto",
    short: "Lo que marca la balanza con todo junto: el recipiente más el material.",
    detail: "Ejemplo: si pone un balde con botellas en la balanza y marca 6,40 kg, ese es el peso bruto.",
  },
  tara: {
    group: "pesaje",
    name: "Tara (peso del recipiente vacío)",
    short: "Lo que pesa el recipiente solo, sin material. Se resta del peso bruto para saber cuánto material hay.",
    detail: "Ejemplo: el balde vacío pesa 1,20 kg; esa es su tara. Si con las botellas marca 6,40 kg, el material pesa 6,40 − 1,20 = 5,20 kg. La tara debe ser menor que el peso bruto.",
  },
  tara_ref: {
    group: "pesaje",
    name: "Tara de referencia",
    short: "El peso habitual del recipiente vacío de ese contenedor; se propone automáticamente al pesar.",
    detail: "Sirve para no tener que escribir la tara cada vez. Si el recipiente cambió o la tara real es otra, puede corregirla en el formulario. Algunos contenedores no tienen tara de referencia y hay que ingresarla siempre.",
  },
  neto: {
    group: "pesaje",
    name: "Peso neto (solo el material)",
    short: "El peso del material sin el recipiente: bruto menos tara. Es lo que cuenta como reciclable captado.",
    detail: "El sistema siempre recalcula el neto en el servidor al confirmar; la cifra que ve mientras escribe es solo una vista previa.",
  },
  contaminacion: {
    group: "pesaje",
    name: "Contaminación observada",
    short: "Marca que se vio basura u otro material que no corresponde mezclado con lo reciclable.",
    detail: "No cambia los kilos: solo deja constancia. Sirve para ver en qué zonas hay más mezcla y mejorar la señalética.",
  },
  hora_chile: {
    group: "pesaje",
    name: "Hora de Chile",
    short: "Todas las fechas y horas se muestran y se ingresan en hora de Chile (America/Santiago).",
    detail: "Internamente se guardan en UTC, pero usted siempre ve y escribe la hora local. El «día» de un pesaje o de un calendario es el día calendario de Chile.",
  },

  // --- Lugares y contenedores ---
  contenedor: {
    group: "lugares",
    name: "Contenedor",
    short: "El recipiente físico donde se junta un tipo de material, identificado por un código.",
    detail: "Cada contenedor tiene un material asignado, una estación y una zona. Ejemplo de código: DEMO-Z01-EST01-CARTON.",
  },
  material: {
    group: "lugares",
    name: "Material",
    short: "El tipo de residuo reciclable del contenedor: cartón, PET, aluminio, etc.",
    detail: "El material del pesaje es siempre el del contenedor. El material «mixto» (todo junto) no se suma con los materiales separados.",
  },
  estacion: {
    group: "lugares",
    name: "Estación",
    short: "Un punto del edificio donde hay uno o más contenedores.",
    detail: "Ejemplo: «Estación 01 · Cowork» agrupa los contenedores de cartón y PET de esa zona.",
  },
  zona: {
    group: "lugares",
    name: "Zona (ubicación)",
    short: "Un espacio del edificio, por ejemplo Cowork o Laboratorio. En esta versión, «ubicación» y «zona» son lo mismo.",
    detail: "El inventario se lleva por zona. Esta definición es provisional (decisión H-01, pendiente con el Hub).",
  },
  qr: {
    group: "lugares",
    name: "Código QR del contenedor",
    short: "Un QR pegado al contenedor que abre el formulario de pesaje con el contenedor ya elegido.",
    detail: "El QR solo identifica el contenedor: para registrar igual hay que iniciar sesión y tener permiso.",
  },
  ambito: {
    group: "cuentas",
    name: "Ámbito (zonas que puede ver)",
    short: "Las zonas a las que su cuenta tiene acceso. Solo ve y registra datos de esas zonas.",
    detail: "Un operador asignado a Cowork no ve los datos del Laboratorio. Un administrador con «todas las zonas» ve todo.",
  },

  // --- Sensores y dispositivos ---
  dispositivo: {
    group: "sensores",
    name: "Dispositivo (sensor)",
    short: "Un equipo (por ejemplo, un ESP32 con balanza) instalado en un contenedor que envía lecturas por su cuenta.",
    detail: "Cada dispositivo tiene su propia credencial. Si se pierde o se sospecha de ella, se revoca o se rota sin afectar a los demás.",
  },
  lectura_sensor: {
    group: "sensores",
    name: "Lectura de sensor (telemetría)",
    short: "Un dato que mandó el equipo: peso, distancia y nivel de llenado estimados. Es informativo y NO suma captación.",
    detail: "La captación solo cambia cuando una persona confirma un pesaje. Un peso que baja puede sugerir un retiro, pero no dice quién retiró, cuánto ni a qué destino: eso se registra como movimiento.",
  },
  estado_dispositivo: {
    group: "sensores",
    name: "Estado del dispositivo",
    short: "«En línea» si envió datos dentro del tiempo de tolerancia; «dato desactualizado» si pasó ese tiempo sin recibir nada.",
    detail: "Un dispositivo desactualizado puede tener la batería agotada, haber perdido el Wi-Fi o estar apagado. «Sin datos aún» significa que todavía no ha enviado ninguna lectura. «Revocado» significa que su credencial ya no sirve.",
  },
  token_dispositivo: {
    group: "sensores",
    name: "Credencial del dispositivo",
    short: "Una clave larga y única que el equipo envía para identificarse. Se muestra una sola vez al crearla o rotarla.",
    detail: "HubCircular solo guarda una huella de la clave, no la clave. Si se pierde, se rota: se genera una nueva y la anterior deja de funcionar al instante.",
  },

  // --- Lotes y movimientos ---
  lote: {
    group: "lotes",
    name: "Lote",
    short: "El material de un pesaje, que se sigue como una unidad hasta que sale o se usa.",
    detail: "Ejemplo: un pesaje de 12 kg crea un lote de 12 kg. Si se despachan 9 kg, el lote queda con 3 kg de saldo; sigue siendo el mismo lote.",
  },
  captacion: {
    group: "lotes",
    name: "Captación inicial",
    short: "Los kilos con que nació el lote al pesar. Nunca cambia, aunque después se mueva o se retire material.",
    detail: "Los movimientos posteriores cambian el saldo, no la captación inicial.",
  },
  saldo: {
    group: "lotes",
    name: "Saldo disponible",
    short: "Cuánto material del lote sigue guardado y en qué ubicación. Nunca puede quedar negativo.",
    detail: "Saldo = captación inicial − lo que salió (despachos, reutilización, rechazos) ± ajustes. Un traslado solo cambia dónde está el saldo, no cuánto hay.",
  },
  movimiento: {
    group: "lotes",
    name: "Movimiento",
    short: "Un cambio sobre un lote ya pesado: trasladarlo, despacharlo, reutilizarlo, rechazarlo o ajustarlo.",
    detail: "Los movimientos no se borran ni se editan. Si hay un error se registra una corrección.",
  },
  traslado: {
    group: "lotes",
    name: "Traslado",
    short: "Mover material de una zona a otra. La cantidad total no cambia y no cuenta como captación nueva.",
    detail: "Ejemplo: llevar 12 kg de Cowork al Laboratorio. El total sigue siendo 12 kg, ahora repartido en otra ubicación.",
  },
  despacho: {
    group: "lotes",
    name: "Despacho a gestor",
    short: "Entregar material a una empresa o persona que lo retira para tratarlo (el gestor de residuos).",
    detail: "Queda «sin decisión» hasta que se registre una evidencia y un administrador confirme el aprovechamiento (valorización). Despachar no significa que el material ya fue reciclado.",
  },
  gestor: {
    group: "lotes",
    name: "Gestor de residuos",
    short: "La empresa o persona que retira el material y lo lleva a su tratamiento o reciclaje.",
    detail: "En esta versión los destinos de prueba son ficticios; el gestor real todavía no está definido.",
  },
  reutilizacion: {
    group: "lotes",
    name: "Reutilización",
    short: "Material que se vuelve a usar dentro del edificio, sin enviarlo a un gestor.",
    detail: "Descuenta saldo. Puede tener evidencia (por ejemplo una foto o un correo); se distingue «respaldada» de «solo registrada».",
  },
  rechazo: {
    group: "lotes",
    name: "Rechazo",
    short: "Material que no se puede aceptar (por ejemplo mojado o contaminado). Se descuenta del saldo y exige un motivo.",
    detail: "Es una salida del inventario: ese material no se recicla por este flujo.",
  },
  ajuste: {
    group: "lotes",
    name: "Ajuste de inventario",
    short: "Corregir el saldo cuando lo registrado no coincide con lo real (solo administradores, con motivo).",
    detail: "Ejemplo: se descubrió una merma por humedad. Puede sumar o restar saldo, y queda auditado.",
  },
  correccion: {
    group: "lotes",
    name: "Corrección",
    short: "Deshacer un movimiento mal registrado creando uno nuevo de efecto contrario; el original se conserva.",
    detail: "Solo administradores, con motivo. Un movimiento solo se corrige una vez, y una corrección no se corrige.",
  },
  destino: {
    group: "lotes",
    name: "Destino",
    short: "A dónde va el material en un despacho o una reutilización (por ejemplo, un gestor autorizado).",
    detail: "Los administradores crean y desactivan destinos. Un destino de demostración solo sirve con lotes de demostración.",
  },

  // --- Comprobantes ---
  evidencia: {
    group: "comprobantes",
    name: "Evidencia",
    short: "Una referencia que respalda un despacho o una reutilización: número de guía, folio, certificado, correo o foto.",
    detail: "Por ahora solo se guarda el texto de la referencia (no se suben archivos). Ejemplo: «Guía de despacho N.º 4521».",
  },
  valorizacion: {
    group: "comprobantes",
    name: "Valorización confirmada (aprovechamiento comprobado)",
    short: "Un administrador confirma, con evidencia, que el material despachado fue efectivamente aprovechado.",
    detail: "Confirmar no mueve inventario ni crea otra salida: solo deja constancia de quién verificó y cuándo. Sin evidencia no se puede confirmar. Puede rechazarse con un motivo.",
  },
  sin_decision: {
    group: "comprobantes",
    name: "Sin decisión (pendiente de verificar)",
    short: "Despachos que todavía no se confirman ni se rechazan.",
    detail: "Si además no tienen evidencia, el tablero lo indica: hay que registrar la evidencia antes de poder confirmarlos.",
  },

  // --- Tablero ---
  reciclable_captado: {
    group: "tablero",
    name: "Reciclable captado",
    short: "Los kilos de material pesados en el período (suma de los pesos netos).",
    detail: "No incluye traslados ni ajustes, y la telemetría automática nunca suma aquí.",
  },
  inventario: {
    group: "tablero",
    name: "Inventario (al inicio, al cierre, actual)",
    short: "Lo que queda guardado: al comenzar el período, al terminarlo y hoy.",
    detail: "Se reconstruye desde todos los lotes y movimientos, y coincide con los saldos de cada lote.",
  },
  cierre_contable: {
    group: "tablero",
    name: "Cierre contable del inventario",
    short: "La cuenta que muestra cómo se pasa del inventario inicial al final: lo que entró menos lo que salió.",
    detail: "Inicio + captación + ajustes de entrada − ajustes de salida − despachos − reutilización − rechazos ± traslados = cierre. Si no cuadra, el tablero avisa.",
  },
  calendario: {
    group: "tablero",
    name: "Calendario de medición",
    short: "Los días de la semana en que se espera pesar o revisar un contenedor.",
    detail: "Ejemplo: lunes, miércoles y viernes. Lo crea un administrador desde una fecha (hoy o posterior) y no se edita hacia atrás; para cambiarlo se termina y se crea otro.",
  },
  medicion_esperada: {
    group: "tablero",
    name: "Medición esperada",
    short: "Un día en que, según el calendario, ese contenedor debía pesarse o revisarse.",
    detail: "Cada medición esperada termina en uno de estos estados: con pesaje, cero confirmado, omitida o pendiente de hoy.",
  },
  cero: {
    group: "tablero",
    name: "Cero confirmado (revisado, sin residuos)",
    short: "Marca que hoy se revisó el contenedor y estaba vacío, así que no había nada que pesar.",
    detail: "No es un pesaje y no suma kilos. Sirve para distinguir «estaba vacío» de «nadie lo revisó»: un día sin pesaje ni cero queda como omitido. Solo se puede confirmar hoy, si hoy se esperaba medir y aún no hay pesaje del contenedor.",
  },
  con_pesaje: {
    group: "tablero",
    name: "Con pesaje",
    short: "La medición esperada se cumplió porque ese día hubo al menos un pesaje del contenedor.",
    detail: "Si ese día hay pesaje y además un «cero», prevalece el pesaje.",
  },
  omitida: {
    group: "tablero",
    name: "Omitida (sin revisar)",
    short: "El día ya pasó y no hubo pesaje ni cero confirmado. No se asume que el contenedor estaba vacío.",
    detail: "Las omitidas bajan el porcentaje de cobertura.",
  },
  pendiente: {
    group: "tablero",
    name: "Pendiente de hoy",
    short: "La medición de hoy todavía puede hacerse; el día no termina.",
    detail: "Las pendientes no cuentan como omitidas ni entran al cálculo de cobertura hasta que pase el día.",
  },
  cobertura: {
    group: "tablero",
    name: "Cobertura de medición",
    short: "Qué porcentaje de las revisiones esperadas sí se hicieron (con pesaje o con cero confirmado).",
    detail: "Cobertura = (con pesaje + cero confirmado) ÷ (con pesaje + cero confirmado + omitidas). Si no hay mediciones esperadas, muestra «Sin datos» en lugar de 0 % o 100 %.",
  },
  semana_parcial: {
    group: "tablero",
    name: "Semana parcial",
    short: "Una semana del gráfico que el período elegido no cubre completa (de lunes a domingo).",
    detail: "Por eso sus kilos pueden verse menores. Se marca con un asterisco (*).",
  },
  origen_datos: {
    group: "tablero",
    name: "Datos reales / DEMO",
    short: "«Reales» son mediciones verdaderas del piloto; «DEMO» son datos de prueba para practicar. Nunca se suman.",
    detail: "El tablero muestra datos reales por defecto. Los DEMO llevan una insignia amarilla y no deben usarse para informar resultados.",
  },
  corte_hoy: {
    group: "tablero",
    name: "Período incompleto (incluye hoy)",
    short: "Si el período termina hoy, las cifras todavía pueden subir durante el día.",
    detail: "Para resultados cerrados use un período que termine ayer o antes.",
  },

  // --- Cuentas ---
  administrador: {
    group: "cuentas",
    name: "Rol Administrador",
    short: "Puede registrar y corregir todo, administrar usuarios, destinos y calendarios, y confirmar valorizaciones.",
    detail: "Un administrador con «todas las zonas» ve todos los datos.",
  },
  operador: {
    group: "cuentas",
    name: "Rol Operador",
    short: "Registra pesajes y movimientos, agrega evidencias y confirma «cero» en las zonas que tiene asignadas.",
    detail: "No puede hacer ajustes, correcciones, verificaciones ni administrar usuarios.",
  },
  lector: {
    group: "cuentas",
    name: "Rol Lector",
    short: "Solo puede consultar (historial, lotes, tablero y descargas), sin registrar ni cambiar nada.",
    detail: "Útil para revisar resultados sin riesgo de modificar datos.",
  },
  clave_temporal: {
    group: "cuentas",
    name: "Clave temporal",
    short: "Una contraseña de un solo uso que el administrador entrega a una persona nueva; debe cambiarla al entrar.",
    detail: "Se muestra una sola vez al crearla. Si se pierde, el administrador puede generar otra.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export function glossaryEntry(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY[key];
}

/** Término del glosario para cada tipo de movimiento (los tipos son los de src/modules/movements/schema.ts). */
export const MOVEMENT_TIP: Record<"traslado" | "despacho" | "reutilizacion" | "rechazo" | "ajuste" | "correccion", GlossaryKey> = {
  traslado: "traslado",
  despacho: "despacho",
  reutilizacion: "reutilizacion",
  rechazo: "rechazo",
  ajuste: "ajuste",
  correccion: "correccion",
};
