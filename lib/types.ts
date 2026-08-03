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

export interface Database {
  public: {
    Tables: {
      expenses: {
        Row: Expense;
        Insert: Partial<Expense> & Pick<Expense, "fecha" | "monto" | "categoria" | "user_id">;
        Update: Partial<Expense>;
      };
      settings: {
        Row: Settings;
        Insert: Partial<Settings> & Pick<Settings, "user_id">;
        Update: Partial<Settings>;
      };
      categories: {
        Row: Category;
        Insert: Partial<Category> & Pick<Category, "id" | "nombre" | "color" | "orden">;
        Update: Partial<Category>;
      };
    };
  };
}
