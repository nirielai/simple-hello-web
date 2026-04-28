import { createServerFn } from "@tanstack/react-start";
import { extractText, getDocumentProxy } from "unpdf";

export type CurrencyRate = {
  code: string;
  name: string;
  buy: number | null;
  sell: number | null;
};

export type EconomyData = {
  source: string;
  fetchedAt: string;
  pdfUrl: string;
  rates: CurrencyRate[];
  usdPyg: { buy: number | null; sell: number | null; midpoint: number | null };
  raw: string;
  error?: string;
};

// Banco Central del Paraguay — cotización oficial diaria (PDF público).
const BCP_PDF_URL =
  "https://www.bcp.gov.py/cotizacion-referencial-en-guaranies-i365";

// Sitio mirror estable: Calculadora del BCP devuelve tabla en PDF /
// alternativa: webservice JSON (público, sin auth).
const BCP_JSON_URL =
  "https://www.bcp.gov.py/webapps/web/cotizacion/referencial-spot";

const KNOWN_CURRENCIES: Record<string, string> = {
  USD: "Dólar EE.UU.",
  EUR: "Euro",
  BRL: "Real",
  ARS: "Peso argentino",
  GBP: "Libra esterlina",
  JPY: "Yen",
  CHF: "Franco suizo",
  CLP: "Peso chileno",
  UYU: "Peso uruguayo",
};

function parseNumber(s: string): number | null {
  if (!s) return null;
  // BCP usa formato "7.430,25" o "7430.25"
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseRatesFromText(text: string): CurrencyRate[] {
  const rates: CurrencyRate[] = [];
  const lines = text.split(/\r?\n+/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    for (const [code, name] of Object.entries(KNOWN_CURRENCIES)) {
      const pattern = new RegExp(
        `\\b${code}\\b.*?([0-9][0-9\\.,]{2,})\\s+([0-9][0-9\\.,]{2,})`,
        "i",
      );
      const m = line.match(pattern);
      if (m) {
        const buy = parseNumber(m[1]);
        const sell = parseNumber(m[2]);
        if (buy && sell && !rates.find((r) => r.code === code)) {
          rates.push({ code, name, buy, sell });
        }
      }
    }
  }
  return rates;
}

async function fetchBCPJson(): Promise<CurrencyRate[]> {
  try {
    const res = await fetch(BCP_JSON_URL, {
      headers: { Accept: "application/json, text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    // El endpoint puede devolver HTML con tabla o JSON. Intentamos JSON primero.
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        const rates: CurrencyRate[] = [];
        for (const item of data) {
          const code = (item.codIsoMoneda || item.codigo || "").toUpperCase();
          if (KNOWN_CURRENCIES[code]) {
            rates.push({
              code,
              name: KNOWN_CURRENCIES[code],
              buy: parseNumber(String(item.compra ?? item.cotCompra ?? "")),
              sell: parseNumber(String(item.venta ?? item.cotVenta ?? "")),
            });
          }
        }
        if (rates.length > 0) return rates;
      }
    } catch {
      /* not JSON, try HTML table */
    }
    // HTML fallback: buscar filas con código de moneda y dos números.
    return parseRatesFromText(text.replace(/<[^>]+>/g, " "));
  } catch {
    return [];
  }
}

async function fetchBCPPdf(): Promise<{ rates: CurrencyRate[]; raw: string; pdfUrl: string }> {
  // El BCP publica diariamente "Cotización Referencial en Guaraníes". Buscamos
  // el PDF más reciente desde la página índice.
  const indexRes = await fetch(BCP_PDF_URL, {
    headers: { "User-Agent": "Mozilla/5.0 PY-OS Auditor" },
    signal: AbortSignal.timeout(10000),
  });
  const html = await indexRes.text();
  const pdfMatch = html.match(/href="([^"]+\.pdf)"/i);
  const pdfHref = pdfMatch ? pdfMatch[1] : null;
  const pdfUrl = pdfHref
    ? pdfHref.startsWith("http")
      ? pdfHref
      : `https://www.bcp.gov.py${pdfHref.startsWith("/") ? "" : "/"}${pdfHref}`
    : BCP_PDF_URL;

  if (!pdfHref) return { rates: [], raw: "", pdfUrl };

  const pdfRes = await fetch(pdfUrl, {
    headers: { "User-Agent": "Mozilla/5.0 PY-OS Auditor" },
    signal: AbortSignal.timeout(15000),
  });
  const buf = new Uint8Array(await pdfRes.arrayBuffer());
  const doc = await getDocumentProxy(buf);
  const { text } = await extractText(doc, { mergePages: true });
  const raw = Array.isArray(text) ? text.join("\n") : text;
  return { rates: parseRatesFromText(raw), raw: raw.slice(0, 4000), pdfUrl };
}

export const getEconomyData = createServerFn({ method: "GET" }).handler(
  async (): Promise<EconomyData> => {
    const fetchedAt = new Date().toISOString();
    let rates: CurrencyRate[] = [];
    let raw = "";
    let pdfUrl = BCP_PDF_URL;
    let error: string | undefined;

    try {
      const fromPdf = await fetchBCPPdf();
      rates = fromPdf.rates;
      raw = fromPdf.raw;
      pdfUrl = fromPdf.pdfUrl;
      if (rates.length === 0) {
        const fromJson = await fetchBCPJson();
        if (fromJson.length > 0) rates = fromJson;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Error al obtener datos del BCP";
      try {
        rates = await fetchBCPJson();
      } catch {
        /* ignore */
      }
    }

    const usd = rates.find((r) => r.code === "USD");
    const usdPyg = {
      buy: usd?.buy ?? null,
      sell: usd?.sell ?? null,
      midpoint:
        usd?.buy && usd?.sell
          ? Math.round(((usd.buy + usd.sell) / 2) * 100) / 100
          : null,
    };

    return {
      source: "Banco Central del Paraguay",
      fetchedAt,
      pdfUrl,
      rates,
      usdPyg,
      raw,
      error,
    };
  },
);