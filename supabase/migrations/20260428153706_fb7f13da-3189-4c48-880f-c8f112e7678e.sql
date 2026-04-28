
CREATE TABLE public.canasta_basica (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  unidad TEXT NOT NULL,
  precio_actual NUMERIC NOT NULL,
  precio_anterior NUMERIC NOT NULL,
  variacion_pct NUMERIC GENERATED ALWAYS AS (((precio_actual - precio_anterior) / NULLIF(precio_anterior,0)) * 100) STORED,
  fuente TEXT DEFAULT 'INE Paraguay (estimado)',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.canasta_basica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública canasta básica"
  ON public.canasta_basica FOR SELECT
  USING (true);

INSERT INTO public.canasta_basica (producto, categoria, unidad, precio_actual, precio_anterior) VALUES
('Carne vacuna (puchero)', 'Carnes', 'kg', 32000, 29000),
('Pollo entero', 'Carnes', 'kg', 18500, 17800),
('Arroz', 'Almacén', 'kg', 6500, 6200),
('Aceite de soja', 'Almacén', 'litro', 14000, 12500),
('Pan francés', 'Panadería', 'kg', 12000, 11500),
('Leche entera', 'Lácteos', 'litro', 7800, 7500),
('Huevos', 'Lácteos', 'docena', 18000, 16500),
('Mandioca', 'Verduras', 'kg', 3500, 3200),
('Tomate', 'Verduras', 'kg', 9500, 8000),
('Cebolla', 'Verduras', 'kg', 7000, 6500),
('Locote', 'Verduras', 'kg', 11000, 9800),
('Banana', 'Frutas', 'kg', 5500, 5200),
('Naranja', 'Frutas', 'kg', 4500, 4800),
('Yerba mate', 'Almacén', 'kg', 28000, 26000),
('Azúcar', 'Almacén', 'kg', 5800, 5500),
('Fideos', 'Almacén', 'paquete 500g', 6200, 5900),
('Poroto', 'Almacén', 'kg', 13500, 12800),
('Sal', 'Almacén', 'kg', 3500, 3500),
('Gas (garrafa 10kg)', 'Energía', 'unidad', 95000, 92000),
('Nafta Súper', 'Combustible', 'litro', 8090, 7990);
