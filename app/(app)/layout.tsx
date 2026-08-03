import { NavTabs } from "@/components/NavTabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24">
        <NavTabs />
        {children}
      </div>
    </main>
  );
}
