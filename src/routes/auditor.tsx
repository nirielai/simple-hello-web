import { createFileRoute } from "@tanstack/react-router";
import PyOsLayout from "@/components/layout/PyOsLayout";
import AuditorView from "@/components/auditor/AuditorView";

export const Route = createFileRoute("/auditor")({
  head: () => ({
    meta: [
      { title: "Auditor público · PY-OS" },
      { name: "description", content: "Auditoría en vivo de PDFs públicos paraguayos con extracción real, detección de riesgo e informe IA streaming." },
    ],
  }),
  component: () => <PyOsLayout><AuditorView /></PyOsLayout>,
});
