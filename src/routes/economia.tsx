import { createFileRoute } from "@tanstack/react-router";
import EconomyView from "@/components/economy/EconomyView";

export const Route = createFileRoute("/economia")({
  head: () => ({
    meta: [
      { title: "Economía Paraguay · BCP en vivo · PY-OS" },
      { name: "description", content: "Cotización referencial del BCP en vivo + asesor IA económico personalizado." },
    ],
  }),
  component: EconomyView,
});
