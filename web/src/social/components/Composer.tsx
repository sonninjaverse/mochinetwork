"use client";

import { useEffect, useRef, useState } from "react";
import { stringToHex, type Address } from "viem";
import { replyToPost } from "@social/lib/actions";
import { CONTRACTS, postRegistryAbi } from "@social/lib/contracts";
import { IMAGE_TYPES, uploadImage } from "@social/lib/media";
import { getWallet } from "@/lib/wallet";
import { isUserCancelled } from "@/lib/wallet/errors";
import { Avatar } from "./Avatar";

const MAX_LENGTH = 280;
const LOW_WATER = 40;

/**
 * Writes a post, or a reply when given a parent.
 *
 * One component for both because they differ in a single argument on chain,
 * and a second copy would be a second place to fix an image upload or a
 * character count.
 */
export function Composer({
  onPosted,
  parentId,
  placeholder,
  author,
  community,
  defaultOpen = false,
}: {
  onPosted: (text: string) => void;
  parentId?: bigint;
  placeholder?: string;
  /**
   * Whose avatar sits beside the box. Supplying it also puts the box in its
   * folded form, which is what a reply wants and a feed does not: on a feed
   * the composer is the reason you are there, under a post it is not.
   */
  author?: Address | null;
  community?: string;
  /**
   * Start unfolded even when it could fold. A reply box that opened because a
   * Reply button was pressed should already be an open box; making the reader
   * click once more to reach the field they just asked for is a wasted click.
   */
  defaultOpen?: boolean;
}) {
  // A community post carries its tag as a fixed prefix rather than as the
  // first characters of editable text. Deleting it posted the thing into no
  // community at all, where no feed would show it. The box holds the body; the
  // tag is added back on submit.
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unfolded, setUnfolded] = useState(defaultOpen);
  const box = useRef<HTMLTextAreaElement | null>(null);

  // The pinned address and a local preview. The preview is a blob URL so the
  // image appears before the gateway has ever heard of it.
  const [media, setMedia] = useState<{ uri: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement | null>(null);

  /**
   * Folded away until asked for.
   *
   * An empty 74px box was the largest thing on a permalink page — taller than
   * the post it answers, and it pushed the conversation below the fold. It
   * stays open once there is anything in it, so a draft is never folded away
   * mid-sentence.
   */
  const folds = Boolean(author) && parentId !== undefined;
  const open = !folds || unfolded || text.length > 0 || media !== null || busy;

  useEffect(() => {
    if (unfolded) box.current?.focus();
  }, [unfolded]);

  /**
   * One line, until there is more than one line.
   *
   * It stood open at three empty rows — a hundred and forty pixels of nothing
   * between the tabs and the first post, which is a lot of room to ask for
   * before anyone has decided to write. Height is cleared first because
   * scrollHeight only ever grows while the element is holding it.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open]);

  /// The community the post is addressed to, as the chain holds it. Null for a
  /// reply (which inherits) or a post with no community.
  const toCommunity =
    parentId === undefined && community ? stringToHex(community, { size: 32 }) : null;
  const budget = MAX_LENGTH;
  const left = budget - text.length;
  // An image on its own is a post; the contract agrees.
  const canSend = !busy && !uploading && left >= 0 && (text.trim().length > 0 || media !== null);

  async function attach(file: File) {
    setError(null);
    setUploading(true);
    try {
      const uri = await uploadImage(file);
      setMedia({ uri, preview: URL.createObjectURL(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    if (media) URL.revokeObjectURL(media.preview);
    setMedia(null);
    if (picker.current) picker.current.value = "";
  }

  async function submit() {
    if (!canSend) return;
    const body = text.trim();

    setBusy(true);
    setError(null);
    try {
      if (parentId !== undefined) {
        await replyToPost(parentId, body, media?.uri ?? "");
      } else if (toCommunity) {
        // The chain is told the community directly; membership is checked
        // there, so the text no longer has to carry a tag.
        await getWallet().write({
          address: CONTRACTS.postRegistry,
          abi: postRegistryAbi,
          functionName: "postToCommunity",
          args: [toCommunity, body, media?.uri ?? ""],
        });
      } else {
        await getWallet().write({
          address: CONTRACTS.postRegistry,
          abi: postRegistryAbi,
          functionName: "post",
          args: [body, media?.uri ?? ""],
        });
      }
      setText("");
      removeImage();
      setUnfolded(false);
      // Hand the text back so the feed can show it immediately. The indexer
      // catches up on its own schedule and the author should not wait for it.
      onPosted(body);
    } catch (e) {
      // Deciding not to sign leaves the draft where it is and says nothing.
      if (!isUserCancelled(e)) {
        setError(e instanceof Error ? e.message.split("\n")[0] : "Post failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`composer${author ? " has-avatar" : ""}${folds && !open ? " is-folded" : ""}`}
    >
      {author && <Avatar address={author} size={40} />}

      {folds && !open ? (
        /* Looks like the field it becomes, so the click that opens it is the
           click you were going to make anyway. */
        <button className="composer-invite" onClick={() => setUnfolded(true)}>
          {placeholder ?? "Write a reply"}
        </button>
      ) : (
        <div className="composer-main">
          {community && parentId === undefined && (
            <div className="composer-community" data-testid="composer-community">m/{community}</div>
          )}

          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, budget))}
            placeholder={placeholder ?? "What's happening on chain?"}
            rows={1}
            data-testid="composer-input"
          />

          {media && (
            <div className="composer-media">
              {/* Local preview, so it shows before any gateway has the bytes. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media.preview} alt="" />
              <button className="btn btn-quiet btn-sm" onClick={removeImage} disabled={busy}>
                Remove
              </button>
            </div>
          )}

          <div className="composer-foot">
            <input
              ref={picker}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void attach(file);
              }}
              data-testid="image-input"
            />
            <button
              className="act"
              onClick={() => picker.current?.click()}
              disabled={busy || uploading || media !== null}
              title="Attach an image"
              data-testid="image-button"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="9" cy="9" r="1.6" />
                <path d="M21 15l-5-5-6 6-3-3-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {uploading ? "Pinning…" : media ? "Attached" : "Image"}
            </button>

            {/* Only once it means something. A permanent "280" beside an empty
                box is a number nobody asked for. */}
            {text.length > 0 && (
              <span className={`counter${left <= LOW_WATER ? " is-low" : ""}`}>{left}</span>
            )}
            {/* btn-sm, to sit level with the Image button rather than
                towering over it. */}
            <button className="btn btn-sm" onClick={submit} disabled={!canSend} data-testid="composer-submit">
              {busy ? (parentId === undefined ? "Posting…" : "Replying…") : parentId === undefined ? "Post" : "Reply"}
            </button>
          </div>

          {error && <p className="error-note">{error}</p>}
        </div>
      )}
    </div>
  );
}
