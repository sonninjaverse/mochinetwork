"use client";

import { useState } from "react";
import type { Address } from "viem";
import { Composer } from "./Composer";
import { Modal } from "./Modal";

/**
 * A button, and the composer behind it.
 *
 * A composer sitting open on every feed is a box most readers never use taking
 * the top of every page — Reddit puts a Create Post button there instead, and
 * the box appears when someone means to write. On a community it opens already
 * addressed to that community.
 */
export function CreatePost({
  viewer,
  community,
  onPosted,
  label = "Create post",
}: {
  viewer: Address | null;
  community?: string;
  onPosted: (text: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!viewer) return null;

  return (
    <>
      <button className="btn create-post" onClick={() => setOpen(true)} data-testid="create-post">
        {label}
      </button>
      {open && (
        <Modal
          title={community ? `Post to m/${community}` : "Create a post"}
          onClose={() => setOpen(false)}
        >
          <Composer
            community={community}
            onPosted={(text) => {
              setOpen(false);
              onPosted(text);
            }}
          />
        </Modal>
      )}
    </>
  );
}
