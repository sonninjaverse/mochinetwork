import Image from "next/image";

/**
 * A mascot, chosen deterministically from the address, on a tinted ground.
 *
 * A feed without avatars reads as a table of rows rather than as people
 * talking. Generic identicons would have done the job, but the brand already
 * ships six mascots, and using them means every account looks like it belongs
 * to this product rather than to any wallet UI.
 *
 * Two hashes, not one: the same address would otherwise always pair a given
 * mascot with a given tint, which makes the set look smaller than it is.
 */
const MASCOTS = ["hello", "happy", "curious", "thinking", "oops", "celebrate"] as const;

const TINTS = [
  "#F3B5C7", // Blush
  "#CAD8AE", // Matcha
  "#F9E5BC", // Vanilla
  "#F1C5D3", // accent-mid
  "#F5EAE4", // panel
  "#FBE9EF", // accent-soft
] as const;

function hash(value: string, seed: number): number {
  let h = seed;
  for (const ch of value) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ address, size = 40 }: { address: string; size?: number }) {
  const key = address.toLowerCase();
  const mascot = MASCOTS[hash(key, 5381) % MASCOTS.length];
  const tint = TINTS[hash(key, 7919) % TINTS.length];

  return (
    <span className="avatar" style={{ width: size, height: size, background: tint }} aria-hidden>
      <Image
        src={`/brand/mascots/mochi-${mascot}.svg`}
        alt=""
        width={size}
        height={size}
        unoptimized
      />
    </span>
  );
}
