/** Public identity shared by the social app and its page metadata. */
export const BRAND = {
  name: "Mochi Network",
  url: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
  tagline: "Your feed. Your algorithm.",
  feedDescription:
    "A social network where the feed ranking algorithm is a public smart contract. Read it, fork it, or swap it for your own. Built on Monad.",
  shortDescription: "The feed algorithm is a contract you can read, fork and swap.",
  feedSocialImage: "/brand/icons/mochi-512.png",
  markSmall: "/brand/mochi-mark-small.svg",
} as const;
