import { createFileRoute } from "@tanstack/react-router";
import PyOsShell from "@/components/PyOsShell";

export const Route = createFileRoute("/economia")({
  head: () => ({
    meta: [
      { title: "Economía Paraguay · BCP en vivo" },
      { name: "description", content: "Cotización referencial del Banco Central del Paraguay actualizada en tiempo real desde el PDF oficial: USD, EUR, BRL, ARS y más." },
      { property: "og:title", content: "Economía Paraguay · BCP en vivo" },
      { property: "og:description", content: "Tipo de cambio oficial, refrescado automáticamente desde el PDF del BCP." },
    ],
  }),
  component: () => <PyOsShell mode="economy" />,
});
