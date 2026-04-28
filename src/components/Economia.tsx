import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { Markdown } from "./Markdown";

type Producto = {
  id: string;
  producto: string;
  categoria: string;
  unidad: string;
  precio_actual: number;
  precio_anterior: number;
  variacion_pct: number | null;
};

const PERFILES = [
  { id: "estudiante", label: "Estudiante" },
  { id: "comerciante", label: "Comerciante" },
  { id: "productor", label: "Productor agrícola" },
  { id: "emprendedor", label: "Emprendedor digital" },
  { id: "familia", label: "Jefe/a de hogar" },
];

export function Economia() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [perfil, setPerfil] = useState("emprendedor");
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [consultando, setConsultando] = useState(false);

  useEffect(() => {
    supabase.from("canasta_basica").select("*").order("categoria").then(({ data }) => {
      if (data) setProductos(data as any);
    });
  }, []);

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    if (!pregunta.trim() || consultando) return;
    setConsultando(true);
    setRespuesta("");
    try {
      const { data, error } = await supabase.functions.invoke("asesor-economico", {
        body: { perfil, pregunta, canasta: productos },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRespuesta(data.respuesta);
    } catch (err) {
      setRespuesta(`⚠️ ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setConsultando(false);
    }
  }

  const inflacionPromedio = productos.length
    ? productos.reduce((s, p) => s + (p.variacion_pct || 0), 0) / productos.length
    : 0;

  const subiendoMas = [...productos].sort((a, b) => (b.variacion_pct || 0) - (a.variacion_pct || 0)).slice(0, 8);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-10">
          <h1 className="serif text-4xl mb-2 text-balance">Inteligencia económica</h1>
          <p className="text-muted-foreground">
            Microtendencias del mercado paraguayo, canasta básica y asesoramiento estratégico con IA.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="py-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Inflación canasta (mensual est.)</div>
            <div className={`serif text-3xl mt-2 ${inflacionPromedio >= 0 ? "text-danger" : "text-success"}`}>
              {inflacionPromedio >= 0 ? "+" : ""}{inflacionPromedio.toFixed(2)}%
            </div>
          </div>
          <div className="py-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Productos monitoreados</div>
            <div className="serif text-3xl mt-2">{productos.length}</div>
          </div>
          <div className="py-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Tipo de cambio (ref.)</div>
            <div className="serif text-3xl mt-2">7.250 <span className="text-base text-muted-foreground">Gs/USD</span></div>
          </div>
        </div>

        <div className="py-card p-5 mb-8">
          <h2 className="serif text-xl mb-4">Productos con mayor variación</h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={subiendoMas} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                <XAxis
                  dataKey="producto"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  angle={-25} textAnchor="end" interval={0} height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                  formatter={(v: number) => `${v.toFixed(2)}%`}
                />
                <Bar dataKey="variacion_pct" radius={[6, 6, 0, 0]}>
                  {subiendoMas.map((p) => (
                    <Cell key={p.id} fill={(p.variacion_pct || 0) >= 0 ? "hsl(var(--danger))" : "hsl(var(--success))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="py-card p-5 mb-8">
          <h2 className="serif text-xl mb-3">Canasta básica detallada</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2">Producto</th>
                  <th className="py-2">Categoría</th>
                  <th className="py-2 text-right">Precio actual</th>
                  <th className="py-2 text-right">Variación</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2.5">{p.producto} <span className="text-muted-foreground">({p.unidad})</span></td>
                    <td className="py-2.5 text-muted-foreground">{p.categoria}</td>
                    <td className="py-2.5 text-right font-medium">Gs. {Number(p.precio_actual).toLocaleString("es-PY")}</td>
                    <td className={`py-2.5 text-right font-medium ${(p.variacion_pct || 0) > 0 ? "text-danger" : (p.variacion_pct || 0) < 0 ? "text-success" : "text-muted-foreground"}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {(p.variacion_pct || 0) > 0 ? <TrendingUp className="w-3 h-3" /> : (p.variacion_pct || 0) < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                        {(p.variacion_pct || 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="py-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="serif text-xl">Asesor económico IA</h2>
          </div>
          <form onSubmit={consultar} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PERFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPerfil(p.id)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                    perfil === p.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="Ej: ¿Conviene comprar dólares hoy? ¿Qué rubro tiene mejor margen este trimestre?"
              rows={3}
              className="py-input w-full resize-none"
            />
            <button
              type="submit"
              disabled={consultando || !pregunta.trim()}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
            >
              {consultando && <Loader2 className="w-4 h-4 animate-spin" />}
              Consultar
            </button>
          </form>
          {respuesta && (
            <div className="mt-6 pt-6 border-t border-border/60">
              <Markdown>{respuesta}</Markdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
