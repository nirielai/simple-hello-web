import { useState } from "react";
import { Header } from "@/components/Header";
import { AsistenteChat } from "@/components/AsistenteChat";
import { Auditor } from "@/components/Auditor";
import { Economia } from "@/components/Economia";

const Index = () => {
  const [mode, setMode] = useState<"asistente" | "auditor" | "economia">("asistente");

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header active={mode} onChange={setMode} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {mode === "asistente" && <AsistenteChat />}
        {mode === "auditor" && <Auditor />}
        {mode === "economia" && <Economia />}
      </main>
    </div>
  );
};

export default Index;
