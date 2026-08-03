"use client";

export function Toast({ mensaje }: { mensaje: string }) {
  if (!mensaje) return null;
  return (
    <div className="fixed left-1/2 bottom-6 -translate-x-1/2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm z-[60]">
      {mensaje}
    </div>
  );
}
