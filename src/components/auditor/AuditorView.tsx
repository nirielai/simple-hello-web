import { FileSearch } from "lucide-react";
import ChatShell from "@/components/chat/ChatShell";

const STARTERS = [
  "Auditá el último contrato del MOPC publicado en la DNCP",
  "Buscá adjudicaciones directas recientes en contrataciones.gov.py",
  "Analizá este PDF: https://www.contrataciones.gov.py/...",
  "¿Qué dice la última licitación de Itaipú?",
];

export default function AuditorView() {
  return (
    <ChatShell
      module="auditor"
      team="auditor"
      title="Auditor público"
      subtitle="Equipo de 20+ agentes especializados — auditoría profunda con datos 2026, redes sociales oficiales y verificación cruzada."
      starters={STARTERS}
      emptyIcon={<FileSearch className="h-6 w-6 text-primary" />}
    />
  );
}
