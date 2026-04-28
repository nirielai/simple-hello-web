import { createFileRoute } from "@tanstack/react-router";
import PyOsShell from "@/components/PyOsShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PY-OS · Asistente · Auditor · Economía 🇵🇾" },
      { name: "description", content: "Inteligencia soberana para Paraguay: chat ciudadano, auditor de PDFs públicos y panel económico en vivo desde el BCP." },
      { property: "og:title", content: "PY-OS · Inteligencia Soberana 🇵🇾" },
      { property: "og:description", content: "Trámites, auditoría de licitaciones y cotizaciones del BCP en tiempo real." },
    ],
  }),
  component: () => <PyOsShell mode="assistant" />,
});
