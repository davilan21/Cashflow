export type CategoryId =
  | "mercado"
  | "restaurantes"
  | "transporte"
  | "vivienda"
  | "salud"
  | "ocio"
  | "compras"
  | "suscripciones"
  | "otros";

export interface Category {
  id: string;
  nombre: string;
  color: string;
  orden: number;
  user_id: string | null;
}

export interface Settings {
  user_id: string;
  tope_ciclo: number;
  tope_quincena: number;
  dia_corte: number;
  dia_pago: number;
  updated_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  fecha: string; // 'YYYY-MM-DD'
  monto: number;
  categoria: string;
  nota: string | null;
  created_at: string;
  updated_at: string;
}

/** Un gasto recién creado, antes de tener id/timestamps del servidor. */
export interface NuevoGasto {
  fecha: string;
  monto: number;
  categoria: string;
  nota: string;
}

/**
 * Nota: Insert/Update van como literales de objeto inline (no como referencia
 * a un `interface` aparte). Con @supabase/postgrest-js 2.x, cuando Insert/Update
 * son una referencia a un tipo con nombre, la inferencia genérica de
 * `.insert()/.update()` colapsa a `never`. Un literal inline es exactamente
 * el formato que produce `supabase gen types typescript`.
 */
export interface Database {
  public: {
    Tables: {
      expenses: {
        Row: Expense;
        Insert: {
          id?: string;
          user_id: string;
          fecha: string;
          monto: number;
          categoria: string;
          nota?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          fecha?: string;
          monto?: number;
          categoria?: string;
          nota?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: Settings;
        Insert: {
          user_id: string;
          tope_ciclo?: number;
          tope_quincena?: number;
          dia_corte?: number;
          dia_pago?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          tope_ciclo?: number;
          tope_quincena?: number;
          dia_corte?: number;
          dia_pago?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: {
          id: string;
          nombre: string;
          color: string;
          orden: number;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          nombre?: string;
          color?: string;
          orden?: number;
          user_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
