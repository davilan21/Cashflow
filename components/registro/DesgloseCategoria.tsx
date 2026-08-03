import { pesosCorto } from "@/lib/money";
import { BarraDelgada } from "@/components/ui/BarraTope";
import type { Category } from "@/lib/types";

export function DesgloseCategoria({
  porCategoria,
  totalVisible,
  catById,
}: {
  porCategoria: [string, number][];
  totalVisible: number;
  catById: (id: string) => Category;
}) {
  return (
    <>
      {porCategoria.map(([id, monto]) => {
        const cat = catById(id);
        return (
          <div key={id} className="flex items-center gap-2.5 mb-2.5">
            <span className="text-[13px] w-[34%] shrink-0 truncate">{cat.nombre}</span>
            <BarraDelgada pct={(monto / totalVisible) * 100} color={cat.color} />
            <span className="text-[13px] w-[74px] text-right num">{pesosCorto(monto)}</span>
          </div>
        );
      })}
    </>
  );
}
