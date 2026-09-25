import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileView } from "@social/components/ProfileView";

export const metadata: Metadata = { title: "Profile" };

export default async function HandleProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  // A dot means a file, not a person: /robots.txt is nobody's profile.
  if (handle.includes(".")) notFound();
  return <ProfileView />;
}
