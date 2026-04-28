import { createFileRoute } from "@tanstack/react-router";
import PyOsLayout from "@/components/layout/PyOsLayout";
import AssistantView from "@/components/assistant/AssistantView";

export const Route = createFileRoute("/asistente")({
  head: () => ({
    meta: [
      { title: "Asistente ciudadano · PY-OS" },
      { name: "description", content: "Chat propio para trámites en Paraguay: IPS, MEC, SET, cédula, formalización. En español, guaraní y jopara." },
    ],
  }),
  component: () => <PyOsLayout><AssistantView /></PyOsLayout>,
});
