import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostView } from "@social/components/PostView";

export const metadata: Metadata = { title: "Post" };

export default async function HandlePost({ params }: { params: Promise<{ handle: string; n: string }> }) {
  const { handle, n } = await params;
  if (handle.includes(".") || n.includes(".")) notFound();
  return <PostView />;
}
