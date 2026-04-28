import { createFileRoute } from "@tanstack/react-router";
import PyOsLayout from "@/components/layout/PyOsLayout";
import EconomyView from "@/components/economy/EconomyView";

export const Route = createFileRoute("/economia")({
  head: () => ({
    meta: [
      { title: "Economía Paraguay · BCP en vivo · PY-OS" },
      { name: "description", content: "Cotización referencial del BCP en vivo desde el PDF oficial + asesor IA económico personalizado." },
    ],
  }),
  component: () => <PyOsLayout><EconomyView /></PyOsLayout>,
});
