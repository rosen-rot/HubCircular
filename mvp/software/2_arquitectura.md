# 2. Arquitectura y Red Local

## 2.1 Componentes

| Componente | Tecnología | Función |
| :-- | :-- | :-- |
| API | **FastAPI** + Uvicorn | Recibe lecturas y entrega datos al dashboard. |
| Validación | Pydantic (incluido en FastAPI) | Rechaza lecturas incompletas o con valores imposibles. |
| Base de datos | **SQLite** (un solo archivo) | Guarda lecturas y eventos. No requiere instalar un motor de base de datos. |
| Dashboard | HTML + JavaScript + **Chart.js**, servido por FastAPI | Muestra los datos y consulta la API cada 2 segundos. |
| Simulador | Script Python con `httpx` | Envía lecturas falsas por la misma API. |
| Pruebas | `pytest` | Verifica las reglas de medición con secuencias conocidas. |

```
┌────────────── Red Wi-Fi propia (hotspot o router) ──────────────┐
│                                                                  │
│  ESP32 ──HTTP POST /api/lecturas──▶ Notebook (servidor local)    │
│                                     ├─ FastAPI + reglas          │
│  Simulador ──── misma API ────────▶ ├─ SQLite                    │
│                                     └─ Dashboard (navegador)     │
└──────────────────────────────────────────────────────────────────┘
```

## 2.2 Red en la feria: mostrar que los datos llegan por Wi-Fi

El servidor corre en un notebook y el ESP32 le envía las lecturas por la red. Para que funcione en la feria:

| Punto | Decisión |
| :-- | :-- |
| **Red** | Usar una **red propia en la banda de 2,4 GHz** (hotspot de un celular o un router pequeño), no la del campus. El ESP32 no se conecta a redes de 5 GHz. Las redes institucionales suelen tener portal de inicio de sesión o bloquear la comunicación entre equipos. Hay que verificarlo, pero no depender de ella. |
| **Dirección del servidor** | El notebook debe tener siempre la **misma IP** en esa red, configurada en el ESP32. Ejemplo: `http://192.168.43.10:8000/api/lecturas`. |
| **Servidor visible en la red** | Iniciar con `uvicorn app.main:app --host 0.0.0.0 --port 8000`. |
| **Firewall** | Permitir el puerto 8000 en el firewall de Windows del notebook. Si no se hace, el ESP32 no logra conectarse aunque esté en la misma red. |
| **Hacer visible el Wi-Fi** | El dashboard muestra un panel de **conexión del sensor**: lecturas en vivo, segundos desde la última lectura y la señal Wi-Fi (RSSI) del ESP32. |
| **Latido** | El ESP32 envía una lectura cada 30 segundos aunque no cambie el peso, para que se vea que la conexión está activa. |

## 2.3 Estructura sugerida del código

```
software/
  app/
    main.py          ← FastAPI: rutas de la API y del dashboard
    reglas.py        ← reglas de medición (sin dependencia de FastAPI)
    db.py            ← conexión y tablas SQLite
    config.py        ← umbrales y claves de dispositivos
    static/          ← dashboard: index.html, app.js, estilos
  simulador/
    simulador.py     ← escenarios de lecturas simuladas
  tests/
    test_reglas.py   ← pruebas de las reglas con secuencias conocidas
  requirements.txt
```

Las reglas van en un archivo propio para poder probarlas con `pytest` sin levantar el servidor.

---

[← Volver al índice del MVP del software](README.md)
