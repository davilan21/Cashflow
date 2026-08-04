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
  cuenta_id: string | null;
}

export interface Settings {
  cuenta_id: string;
  tope_ciclo: number;
  tope_quincena: number;
  dia_corte: number;
  dia_pago: number;
  updated_at: string;
}

export interface Expense {
  id: string;
  cuenta_id: string;
  fecha: string; // 'YYYY-MM-DD'
  monto: number;
  categoria: string;
  nota: string | null;
  created_by: string | null; // quién lo registró (atribución)
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

/** Una cuenta compartida (hogar). */
export interface Cuenta {
  id: string;
  join_code: string | null;
  join_expira: string | null;
  created_at: string;
}

/** Un miembro de una cuenta. */
export interface Miembro {
  cuenta_id: string;
  user_id: string;
  apodo: string | null;
  joined_at: string;
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
          cuenta_id: string;
          fecha: string;
          monto: number;
          categoria: string;
          nota?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cuenta_id?: string;
          fecha?: string;
          monto?: number;
          categoria?: string;
          nota?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: Settings;
        Insert: {
          cuenta_id: string;
          tope_ciclo?: number;
          tope_quincena?: number;
          dia_corte?: number;
          dia_pago?: number;
          updated_at?: string;
        };
        Update: {
          cuenta_id?: string;
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
          cuenta_id?: string | null;
        };
        Update: {
          id?: string;
          nombre?: string;
          color?: string;
          orden?: number;
          cuenta_id?: string | null;
        };
        Relationships: [];
      };
      cuentas: {
        Row: Cuenta;
        Insert: {
          id?: string;
          join_code?: string | null;
          join_expira?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          join_code?: string | null;
          join_expira?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cuenta_miembros: {
        Row: Miembro;
        Insert: {
          cuenta_id: string;
          user_id: string;
          apodo?: string | null;
          joined_at?: string;
        };
        Update: {
          cuenta_id?: string;
          user_id?: string;
          apodo?: string | null;
          joined_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      mi_cuenta: { Args: Record<string, never>; Returns: string };
      generar_codigo: { Args: Record<string, never>; Returns: string };
      unirse_a_cuenta: { Args: { codigo: string }; Returns: string };
      set_apodo: { Args: { nombre: string }; Returns: undefined };
    };
  };
}
