import type { Address } from "viem";

export const CONTRACTS = {
  identityRegistry: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY as Address,
  postRegistry: process.env.NEXT_PUBLIC_POST_REGISTRY as Address,
  algorithmRegistry: process.env.NEXT_PUBLIC_ALGORITHM_REGISTRY as Address,
  communityRegistry: process.env.NEXT_PUBLIC_COMMUNITY_REGISTRY as Address | undefined,
} as const;

/// Hand-written rather than generated: these are all the app calls, and a
/// generated bundle would drag in the whole ABI surface.
export const feedAlgorithmAbi = [
  {
    type: "function",
    name: "rank",
    stateMutability: "view",
    inputs: [
      { name: "viewer", type: "address" },
      { name: "candidateIds", type: "uint256[]" },
    ],
    outputs: [
      { name: "orderedIds", type: "uint256[]" },
      { name: "scores", type: "uint256[]" },
    ],
  },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "description",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export const communityRegistryAbi = [
  { type: "function", name: "create", stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "bytes32" }, { name: "metadataURI", type: "string" }], outputs: [] },
  { type: "function", name: "setMetadata", stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "bytes32" }, { name: "metadataURI", type: "string" }], outputs: [] },
  { type: "function", name: "join", stateMutability: "nonpayable", inputs: [{ name: "name", type: "bytes32" }], outputs: [] },
  { type: "function", name: "leave", stateMutability: "nonpayable", inputs: [{ name: "name", type: "bytes32" }], outputs: [] },
  { type: "function", name: "creatorOf", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] },
  { type: "function", name: "joinedAt", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "uint64" }] },
  ...["NameTaken", "BadName", "NoSuchCommunity", "NotCreator"].map(name => ({ type: "error" as const, name, inputs: [] as const })),
] as const;

export const postRegistryAbi = [
  {
    type: "function",
    name: "post",
    stateMutability: "nonpayable",
    inputs: [
      { name: "text", type: "string" },
      { name: "mediaURI", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    // Posting into a community; the contract refuses it unless the author
    // has joined. `post` remains for a post with no community.
    type: "function",
    name: "postToCommunity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "community", type: "bytes32" },
      { name: "text", type: "string" },
      { name: "mediaURI", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "like",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "dislike",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    /// Signed reputation: weighted likes received minus dislikes, in points
    /// where 100 is one whole vote. The whole ledger, on chain.
    type: "function",
    name: "karmaOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "int256" }],
  },
  {
    /// How much this account's vote counts, derived from its karma.
    type: "function",
    name: "weightOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "event",
    name: "PostCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "createdAt", type: "uint48", indexed: false },
      { name: "parentId", type: "uint48", indexed: false },
      { name: "text", type: "string", indexed: false },
      { name: "mediaURI", type: "string", indexed: false },
    ],
  },
] as const;

export const identityRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "handle", type: "bytes32" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "handleOwner",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "handleOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const postReplyAbi = [
  {
    type: "function",
    name: "reply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentId", type: "uint48" },
      { name: "text", type: "string" },
      { name: "mediaURI", type: "string" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const algorithmRegistryAbi = [
  {
    type: "function",
    name: "algorithmOf",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "slot", type: "uint8" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "setMyAlgorithm",
    stateMutability: "nonpayable",
    inputs: [
      { name: "slot", type: "uint8" },
      { name: "algorithmId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "algorithmCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "algorithmAt",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const SLOT_FEED = 0;
export const SLOT_EXPLORE = 1;

