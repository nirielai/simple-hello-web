
# PY-OS · Separación de secciones + IA real estilo Claude

Hoy las tres rutas (`/asistente`, `/auditor`, `/economia`) renderizan el **mismo** componente `PyOsShell` con condicionales `mode === ...`. Eso hace que todo se sienta igual y el diseño no respeta el rol único de cada módulo. Vamos a separar cada sección en su propio componente con su propio diseño, y a conectar todo a IA real (Lovable AI Gateway) + scraping en vivo.

## 1. Activar Lovable Cloud + Lovable AI

Necesario para:
- Edge functions (`chat`, `scrape-web`, `audit-pdf`, `economy-live`)
- `LOVABLE_API_KEY` para llamar al gateway con `google/gemini-3-flash-preview` (default) y `gemini-2.5-pro` (auditor)

## 2. Refactor de arquitectura

Borrar el monolito `PyOsShell.tsx`. Crear:

```text
src/components/
├── layout/
│   ├── PyOsLayout.tsx        ← shell común (header + nav lateral Claude-style)
│   └── ModeNav.tsx           ← navegación entre /asistente /auditor /economia
├── assistant/
│   ├── AssistantView.tsx     ← chat streaming bilingüe
│   ├── ChatMessage.tsx       ← markdown + voz
│   └── VoiceInput.tsx        ← STT (Web Speech API)
├── auditor/
│   ├── AuditorView.tsx       ← upload + URL + análisis IA streaming
│   ├── RiskBadge.tsx
│   └── AuditReport.tsx       ← reporte estructurado exportable
└── economy/
    ├── EconomyView.tsx       ← dashboard + chat económico
    ├── RatesPanel.tsx        ← BCP en vivo
    ├── BasketPanel.tsx       ← canasta básica scraping
    └── ProfileAdvisor.tsx    ← recomendaciones por perfil
```

Cada `*View` es **autocontenido**: layout propio, hero propio, panel propio. Solo el header/nav superior se comparte.

## 3. Estilo visual Claude/Anthropic (refinar `styles.css`)

Ya tenés la paleta crema + terracota. Ajustes:
- Fondo `#FAF9F5` (más cálido que el actual)
- Acento `#CC785C` exacto Claude
- Tipografía: títulos en **Fraunces** (ya cargada), cuerpo en **Inter**
- Bordes `1px solid rgba(0,0,0,0.06)` muy sutiles
- Cards sin sombra fuerte, solo `border` y `bg-card`
- Composición centrada, max-width 760px en chat (como Claude)

## 4. Sección 1 · Asistente Ciudadano (`/asistente`)

**Rol único:** chat puro estilo Claude.

- Edge function `chat` con streaming SSE (Lovable AI Gateway, modelo `google/gemini-3-flash-preview`)
- System prompt: experto en trámites paraguayos (IPS, MEC, SET, cédula, formalización), responde en español/guaraní/jopara según el idioma del usuario
- **Tool call `web_search`**: la IA decide cuándo scrapear webs `.gov.py` (ips.gov.py, set.gov.py, mec.gov.py). Edge function `scrape-web` hace fetch + limpieza HTML → texto → lo pasa de vuelta al modelo
- UI: lista de mensajes con `react-markdown` + `remark-gfm`, burbujas estilo Claude, indicador "PY-OS está pensando..." y "consultando ips.gov.py..." mientras la tool corre (visible al usuario, como Anthropic)
- Voz: Web Speech API para STT (mic) + `speechSynthesis` para TTS (botón altavoz por mensaje). Indicadores visuales "escuchando" y "hablando"
- Chips de prompts iniciales: Formalizar empresa, IPS, Cédula, IRP, MEC

## 5. Sección 2 · Auditor Público (`/auditor`)

**Rol único:** análisis de documentos, NO chat libre.

- Mantiene `audit-pdf` actual (extracción con `unpdf`)
- **Nuevo**: tras extraer texto, llama a edge function `audit-analyze` que envía el texto a `gemini-2.5-pro` con prompt estructurado → devuelve via streaming:
  - Resumen ejecutivo
  - Partes involucradas
  - Montos y plazos
  - Cláusulas inusuales / sobrecostos
  - Semáforo Verde/Amarillo/Rojo con justificación
- UI tipo "informe": no chat, sino reporte que se va llenando token a token mientras la IA analiza (visible el "razonamiento" en vivo)
- Input: dropzone grande + campo URL
- Acepta URLs `.gov.py` y descarga el PDF en el server
- Botón "Exportar reporte" → genera markdown descargable
- **Sin documentos demo precargados** — el usuario quiere todo real

## 6. Sección 3 · Inteligencia Económica (`/economia`)

**Rol único:** dashboard + asesor económico, NO chat genérico.

- Mantiene `getEconomyData` (BCP en vivo)
- **Nuevo edge function `economy-scrape`**: scrapea en vivo:
  - Precios canasta básica desde portales paraguayos (ej: dgeec.gov.py, supermercados)
  - Inflación: BCP/INE
  - Cotizaciones: BCP (ya existe)
- UI con 3 paneles arriba (cards Claude-style):
  1. **Cotizaciones BCP** (USD/EUR/BRL/ARS) refresco cada 5 min
  2. **Canasta básica** con tendencia (sparkline recharts)
  3. **Indicadores macro** (inflación, riesgo)
- Abajo: **Asesor económico IA** (mini-chat dedicado)
  - Selector de perfil: Estudiante / Comerciante / Productor / Asalariado
  - Pregunta libre: "¿Conviene comprar dólares?" → la IA recibe los datos del BCP **en vivo** como contexto + el perfil + la pregunta → responde streaming con recomendación accionable
  - Visible el proceso: "consultando BCP... analizando tendencia... generando consejo..."

## 7. Edge functions (Lovable Cloud, Deno)

```text
supabase/functions/
├── chat/index.ts          ← SSE streaming, tool-calling con web_search
├── scrape-web/index.ts    ← fetch URL pública + limpieza HTML → texto
├── audit-pdf/index.ts     ← (migrar lógica actual de unpdf)
├── audit-analyze/index.ts ← SSE streaming análisis con gemini-2.5-pro
└── economy-live/index.ts  ← scraping BCP + canasta, devuelve JSON
```

Las funciones `audit-pdf` y `economy.functions.ts` actuales (TanStack server functions) se reemplazan por edge functions Supabase, llamadas con `supabase.functions.invoke()` o fetch SSE directo para streaming.

## 8. Detalles técnicos

- Streaming SSE línea-a-línea (no buffer completo) — patrón estándar de la guía AI Gateway
- Tool-calling para `web_search`: el modelo emite tool_call → el cliente ve el evento "buscando en X" → backend ejecuta `scrape-web` → resultado vuelve al modelo → respuesta final
- Persistencia: **no** guardamos historial en DB en este MVP (memoria solo en cliente, como pidió la guía AI). Se puede agregar después.
- Rate limit: catch 429 / 402 → toast amigable

## 9. Limpieza

- Borrar `PyOsShell.tsx` (monolito)
- Borrar `src/server/economy.functions.ts` y `src/routes/api/audit-pdf.ts` una vez migradas a edge functions
- Las rutas `index.tsx`, `asistente.tsx`, `auditor.tsx`, `economia.tsx` siguen existiendo pero cada una renderiza su propio componente

## Resultado

Tres secciones con personalidad propia:
- **Asistente** → chat puro Claude-style con voz y scraping bajo demanda
- **Auditor** → reporte estructurado en vivo, no chat
- **Economía** → dashboard + asesor con datos reales del BCP

Todo con IA real (Lovable AI), scraping en vivo de webs `.gov.py`, y proceso visible al usuario como hace Anthropic.
