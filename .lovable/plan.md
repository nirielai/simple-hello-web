# PY-OS — Plan del MVP

**Visión:** Un sistema operativo de inteligencia soberana para Paraguay. Una sola interfaz tipo Claude (Anthropic) donde el ciudadano puede conversar por voz o texto en español/guaraní, auditar documentos públicos, y consultar inteligencia económica.

---

## Diseño visual (estilo Claude / Anthropic)

- Fondo crema cálido (`#F5F1EB` / `#FAF9F5`) en lugar de blanco puro
- Tipografía serif elegante para títulos (Tiempos / Fraunces / Source Serif) + sans-serif limpia para UI
- Naranja terracota como acento principal (`#CC785C` estilo Claude)
- Bordes muy sutiles, mucho aire, esquinas suavemente redondeadas
- Composición centrada y minimalista, sin sidebars ruidosas
- Modo claro por defecto; modo oscuro opcional
- Pequeño branding "PY-OS" arriba con bandera 🇵🇾 sutil

---

## Estructura de la app

Una sola página principal con un **chat central** estilo Claude y tres "modos" que el usuario puede activar como pestañas/chips arriba del input:

```text
┌─────────────────────────────────────────────┐
│  PY-OS  ·  Inteligencia Soberana 🇵🇾        │
├─────────────────────────────────────────────┤
│                                             │
│         (conversación con la IA)            │
│                                             │
├─────────────────────────────────────────────┤
│ [Asistente] [Auditor] [Economía]            │
│ ┌─────────────────────────────────────────┐ │
│ │ Mba'éichapa, ¿en qué te ayudo?     🎙️📎│ │
│ └─────────────────────────────────────────┘ │
│            Español · Guaraní · Jopara       │
└─────────────────────────────────────────────┘
```

### Módulo 1 — Asistente Ciudadano Multimodal
- Chat bilingüe (español / guaraní / jopara) con streaming token a token
- Renderizado markdown completo en respuestas
- **Voz completa**: micrófono para hablar (STT) + reproducción de respuesta hablada (TTS)
- Indicador visual cuando la IA "escucha" y cuando "habla"
- Casos de uso sugeridos en chips: trámites, salud, formalizar empresa, MEC, IPS, SET

### Módulo 2 — Auditor de Documentos Públicos
- Subir PDF (licitación, decreto, contrato) → extracción automática de texto
- Acceso a URLs gubernamentales paraguayas vía HTTPS para descargar y analizar documentos enlazados
- 3-5 documentos de demostración precargados (ejemplos de licitaciones reales) para mostrar el sistema sin necesidad de subir nada
- Análisis estructurado por la IA: resumen ejecutivo, partes involucradas, montos, plazos, posibles sobrecostos / irregularidades / cláusulas inusuales, semáforo de riesgo (verde/amarillo/rojo)
- Resultado exportable y compartible

### Módulo 3 — Inteligencia Económica
- Dashboard simple con:
  - Canasta básica paraguaya (precios simulados/seed con tendencia)
  - Indicadores macro (inflación, tipo de cambio guaraní/USD)
  - Gráficos de microtendencias con proyección a 30/90 días generada por IA
- Consejos personalizados: el usuario describe su perfil (estudiante, comerciante, productor) y recibe recomendaciones estratégicas accionables
- Consulta libre: "¿Conviene comprar dólares hoy?", "¿Qué rubro tiene mejor margen este trimestre?"

---

## Capacidades técnicas (sección técnica)

- **Frontend**: React + Tailwind, una sola página principal con tabs entre los tres módulos, chat compartido
- **Backend**: Lovable Cloud (Supabase) con edge functions
- **IA**: Lovable AI Gateway con `google/gemini-3-flash-preview` por defecto (multilingüe, soporta guaraní razonablemente; se puede subir a `gemini-2.5-pro` para análisis profundo de documentos)
- **Streaming** SSE para respuestas token a token en el chat
- **Voz**:
  - STT: ElevenLabs Scribe (`scribe_v2` o realtime) — soporta español; guaraní limitado, fallback a español
  - TTS: ElevenLabs multilingüe v2 — voz natural en español
  - Requiere conectar **ElevenLabs** (te pediré la API key cuando pasemos a construir)
- **Auditor**:
  - Parseo de PDF subidos en el cliente (pdfjs) + envío del texto extraído al edge function
  - Para descargar documentos desde webs gubernamentales: edge function que hace `fetch` HTTPS al URL provisto por el usuario y procesa el PDF/HTML
  - Prompt especializado de análisis con esquema JSON estructurado (tool calling) para devolver: resumen, riesgos, semáforo, hallazgos
- **Economía**: tabla en la base de datos con datos seed de canasta básica + edge function que combina datos + IA para generar análisis y proyecciones
- **Persistencia**: conversaciones, documentos analizados e historial guardados por usuario (auth opcional con email mágico, o anónimo en sessionStorage para el MVP)
- **Sin scraping automatizado** de portales por ahora — el usuario pega la URL del documento y el sistema lo descarga y analiza bajo demanda

---

## Lo que NO incluye este MVP (futuras iteraciones)

- Scraping recurrente y monitoreo automático de DNCP/portales
- Visión artificial sobre escaneos (OCR) — solo PDFs con texto seleccionable inicialmente
- App móvil nativa
- Integraciones oficiales con APIs estatales (requiere acuerdos)
- Datos económicos en tiempo real desde fuentes oficiales (usaremos datos seed realistas para el MVP)

---

## Orden de construcción

1. Layout base con estilo Anthropic/Claude (crema, serif, naranja terracota) y navegación entre los 3 módulos
2. Módulo Asistente: chat con streaming + markdown
3. Voz: STT y TTS con ElevenLabs
4. Módulo Auditor: subida de PDF + análisis estructurado + descarga desde URL
5. Documentos de demo precargados
6. Módulo Economía: dashboard + datos seed + asesor IA
7. Persistencia e historial
