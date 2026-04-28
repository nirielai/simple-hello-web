import { createFileRoute } from "@tanstack/react-router";
import PyOsShell from "@/components/PyOsShell";

export const Route = createFileRoute("/asistente")({
  head: () => ({
    meta: [
      { title: "Asistente ciudadano · PY-OS" },
      { name: "description", content: "Consultas sobre trámites de Paraguay: IPS, MEC, SET, cédula, formalización de empresas, en español, guaraní y jopara." },
      { property: "og:title", content: "Asistente ciudadano · PY-OS" },
      { property: "og:description", content: "Chat propio para trámites y vida diaria en Paraguay." },
    ],
  }),
  component: () => <PyOsShell mode="assistant" />,
});
