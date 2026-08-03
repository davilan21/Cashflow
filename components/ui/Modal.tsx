"use client";

export function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-ink/45 flex items-center justify-center p-5 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
