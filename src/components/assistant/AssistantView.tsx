import { Bot } from "lucide-react";
import ChatShell from "@/components/chat/ChatShell";

const STARTERS = [
  "¿Cómo formalizo una empresa unipersonal en Paraguay?",
  "Mba'éichapa ajapo cédula pyahu?",
  "¿Qué necesito para inscribirme en el IPS?",
  "Calcular el IRP si gano 8M ₲ al mes",
];

export default function AssistantView() {
  return (
    <ChatShell
      module="asistente"
      team="asistente"
      title="Asistente ciudadano"
      subtitle="Equipo de 20+ agentes especializados — investigación web, redes sociales oficiales, verificación cruzada y respuesta premium estilo Claude / Gemini / Grok."
      starters={STARTERS}
      emptyIcon={<Bot className="h-6 w-6 text-primary" />}
    />
  );
}
