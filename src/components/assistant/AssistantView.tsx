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
      title="Asistente ciudadano"
      subtitle="Trámites, IPS, MEC, SET, cédula, formalización. En español, guaraní o jopara. Consulto webs `.gov.py` y medios cuando hace falta."
      starters={STARTERS}
      emptyIcon={<Bot className="h-6 w-6 text-primary" />}
    />
  );
}
