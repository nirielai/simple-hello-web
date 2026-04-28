import { createFileRoute } from "@tanstack/react-router";
import PyOsShell from "@/components/PyOsShell";

export const Route = createFileRoute("/auditor")({
  head: () => ({
    meta: [
      { title: "Auditor público · PY-OS" },
      { name: "description", content: "Auditoría en vivo de PDFs públicos paraguayos: extracción real de montos, fechas, partes y detección de riesgo (adjudicación directa, urgencia, único oferente)." },
      { property: "og:title", content: "Auditor público · PY-OS" },
      { property: "og:description", content: "Subí o pegá la URL de una licitación, contrato o adenda y obtené análisis en segundos." },
    ],
  }),
  component: () => <PyOsShell mode="auditor" />,
});
