import { createFileRoute } from "@tanstack/react-router";
import PyOsLayout from "@/components/layout/PyOsLayout";
import AssistantView from "@/components/assistant/AssistantView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PY-OS · Asistente · Auditor · Economía 🇵🇾" },
      { name: "description", content: "Inteligencia soberana para Paraguay: chat ciudadano, auditor de PDFs públicos y panel económico en vivo desde el BCP." },
    ],
  }),
  component: () => <PyOsLayout><AssistantView /></PyOsLayout>,
});
