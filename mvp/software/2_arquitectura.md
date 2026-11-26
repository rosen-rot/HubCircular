# 2. Arquitectura y Red

## 2.1 Componentes

| Componente | Tecnología | Función |
| :-- | :-- | :-- |
| Aplicación web | **Next.js** (App Router) + **TypeScript** | Interfaz y servidor en un solo proyecto: páginas, API y reglas. |
| Interfaz | Tailwind CSS, componentes accesibles e íconos `lucide-react` | Menú lateral, pantallas adaptadas a celular. |
| Validación | `zod` | Rechaza datos incompletos o con valores imposibles. |
| Base de datos | **PostgreSQL** en **Supabase** (o local para pruebas) | Usuarios, contenedores, pesajes, lotes, movimientos y lecturas. Migraciones SQL versionadas en `app/db/migrations/`. |
| Autenticación | Sesión propia o Supabase Auth | Roles de administrador, operador y lector. |
| Exportación | `write-excel-file` | Descarga en Excel o CSV. |
| Simulador | Script Node/TypeScript *(por construir)* | Envía lecturas falsas por la misma API que el ESP32. |
| Pruebas | **Vitest** (unitarias e integración) y **Playwright** (de punta a punta, con revisión de accesibilidad) | Verifican reglas, permisos y pantallas. |

```
┌────────────── Red Wi-Fi propia (hotspot del celular, 2,4 GHz) ──────────────┐
│                                                                              │
│  ESP32 ──HTTP POST /api/iot/v1/readings──▶ Notebook: Next.js (puerto 3000)   │
│                                            ├─ API + reglas de medición       │
│  Simulador ──────── misma API ───────────▶ ├─ Dashboard (navegador)          │
│                                            └──────────┬──────────────────────┘
│                                                       │ internet del hotspot
└───────────────────────────────────────────────────────┼──────────────────────┘
                                                        ▼
                                          PostgreSQL en Supabase
                                 (plan B sin internet: PostgreSQL local)
```

**Límite de seguridad:** el ESP32 **nunca** se conecta directamente a la base de datos. Solo conoce su propia clave de dispositivo, que únicamente sirve para enviar lecturas.

## 2.2 Organización del código

El código está en [`app/`](app/README.md), organizado por módulos de dominio:

```
app/
  db/migrations/        ← SQL versionado (0001 a 0010)
  db/seed/              ← datos DEMO
  src/app/              ← pantallas y rutas de la API
  src/modules/
    identity/ users/    ← sesión, roles, permisos y gestión de usuarios
    catalog/            ← zonas, materiales y contenedores
    weighing/           ← pesajes y lotes
    inventory/          ← saldos
    movements/          ← trazabilidad: movimientos y destinos
    indicators/ inicio/ ← tablero, cobertura y descarga de datos
    telemetry/          ← lecturas del ESP32 (por construir)
  tests/{unit,integration,e2e}/
  scripts/              ← migraciones, respaldos y diagnóstico de la base
```

## 2.3 Red en la feria: mostrar que los datos llegan por Wi-Fi

| Punto | Decisión |
| :-- | :-- |
| **Red** | **Red propia en 2,4 GHz** (hotspot de un celular), no la del campus. El ESP32 no se conecta a redes de 5 GHz y las redes institucionales suelen tener portal de inicio de sesión o bloquear la comunicación entre equipos. |
| **Servidor** | La plataforma corre en un notebook con `npm run build` y luego `npm run start -- -H 0.0.0.0 -p 3000`, para que sea visible en la red. |
| **Dirección del servidor** | El notebook debe tener siempre la **misma IP** en el hotspot, configurada en el ESP32. Ejemplo: `http://192.168.43.10:3000/api/iot/v1/readings`. |
| **Firewall** | Permitir el **puerto 3000** en el firewall de Windows del notebook. Si no, el ESP32 no logra conectarse aunque esté en la misma red. |
| **Base de datos** | Supabase necesita internet, que entrega el mismo hotspot. **Plan B:** PostgreSQL local en el notebook (`app/scripts/windows/postgres-local.ps1`), para no depender de internet. |
| **HTTP en la demo** | En la red cerrada de la feria se usa HTTP. Para un uso real en el Hub se requiere HTTPS. |
| **Hacer visible el Wi-Fi** | El dashboard muestra la **conexión del sensor**: en línea / sin señal, segundos desde la última lectura y señal Wi-Fi (RSSI). |
| **Latido** | El ESP32 envía una lectura cada 30 s aunque no cambie el peso, para que se vea que la conexión está activa. |

---

[← Volver al índice del MVP del software](README.md)
