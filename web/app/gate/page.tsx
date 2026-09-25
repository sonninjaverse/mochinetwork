import type { Metadata } from "next";
import { GateForm } from "@social/components/GateForm";

export const metadata: Metadata = { title: "Private beta" };

export default function Gate() {
  return (
    <main className="shell gate-shell">
      <GateForm />
    </main>
  );
}
