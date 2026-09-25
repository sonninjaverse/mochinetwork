import { defineConfig } from "vitepress";

/** Standalone handbook; configure the app link for your deployment. */
export default defineConfig({
  base: "/",
  lang: "en-US",
  title: "Mochi Network",
  description:
    "Mochi Network documentation: karma and vote weight, how the feed ranks, the on-chain contracts, and the infrastructure.",
  cleanUrls: true,
  ignoreDeadLinks: false,
  head: [
    ["meta", { name: "theme-color", content: "#fff9f2", media: "(prefers-color-scheme: light)" }],
    ["meta", { name: "theme-color", content: "#201a1e", media: "(prefers-color-scheme: dark)" }],
    // Same assets the app uses, copied into the handbook's public dir.
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    ["link", { rel: "icon", href: "/favicon.ico", sizes: "32x32" }],
    ["link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }],
  ],

  themeConfig: {
    siteTitle: "Mochi Network",

    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "/guide/" },
      { text: "Algorithms", link: "/algorithms/", activeMatch: "/algorithms/" },
      { text: "Reference", link: "/reference/contracts", activeMatch: "/reference/" },
      { text: "Open app", link: process.env.DOCS_APP_URL || "https://mochi.meme" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Getting started",
          items: [
            { text: "What is Mochi", link: "/guide/" },
            { text: "Enter the app and create a wallet", link: "/guide/getting-started" },
          ],
        },
        {
          text: "Core",
          items: [
            { text: "Karma and weight", link: "/guide/karma" },
            { text: "Voting", link: "/guide/voting" },
            { text: "Posts and replies", link: "/guide/posts" },
            { text: "Communities", link: "/guide/communities" },
            { text: "Notifications", link: "/guide/notifications" },
          ],
        },
        {
          text: "Feed",
          items: [{ text: "How the feed works", link: "/guide/feed" }],
        },
      ],
      "/algorithms/": [
        {
          text: "Algorithms",
          items: [
            { text: "Overview", link: "/algorithms/" },
            { text: "Hot", link: "/algorithms/hot" },
            { text: "Best", link: "/algorithms/best" },
            { text: "Controversial", link: "/algorithms/controversial" },
            { text: "Chrono", link: "/algorithms/chrono" },
            { text: "Write your own", link: "/algorithms/writing" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Contracts and addresses", link: "/reference/contracts" },
            { text: "Architecture", link: "/reference/architecture" },
            { text: "Indexer API", link: "/reference/indexer-api" },
            { text: "Deploying", link: "/reference/deploy" },
            { text: "FAQ", link: "/reference/faq" },
            { text: "Glossary", link: "/reference/glossary" },
          ],
        },
      ],
    },

    outline: { level: [2, 3], label: "On this page" },
    docFooter: { prev: "Previous", next: "Next" },
    returnToTopLabel: "Return to top",
    sidebarMenuLabel: "Menu",
    darkModeSwitchLabel: "Appearance",
    lightModeSwitchTitle: "Switch to light theme",
    darkModeSwitchTitle: "Switch to dark theme",

    search: { provider: "local" },

    socialLinks: [
      { icon: "github", link: "https://github.com/sonninjaverse/mochinetwork" },
    ],

    footer: {
      message: "Documentation for Monad testnet. It describes what is actually running.",
      copyright: "Mochi Network",
    },
  },
});
