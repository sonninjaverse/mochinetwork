import type { Metadata } from "next";
import { PostView } from "@social/components/PostView";

export const metadata: Metadata = { title: "Post" };

export default function PostPage() {
  return <PostView />;
}
