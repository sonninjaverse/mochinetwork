import { beforeEach, expect, test } from "vitest";
import { recallFeed, recallScroll, rememberFeed, rememberScroll } from "./nav-state";

const KEY = "joined|0|||0x0";

beforeEach(() => {
  window.sessionStorage.clear();
});

test("a remembered feed comes back with its place", () => {
  rememberFeed(KEY, { items: [{ id: "1" }, { id: "2" }], shown: 25 });
  expect(recallFeed(KEY)).toEqual({ items: [{ id: "1" }, { id: "2" }], shown: 25 });
});

test("an empty feed is not remembered", () => {
  rememberFeed("empty|0|||0x0", { items: [], shown: 25 });
  expect(recallFeed("empty|0|||0x0")).toBeNull();
});

test("a feed survived in session storage still comes back after a reload", () => {
  const key = "joined|0|||0x99";
  window.sessionStorage.setItem(
    `mochi-feed:${key}`,
    JSON.stringify({ at: Date.now(), items: [{ id: "9" }], shown: 25 }),
  );
  expect(recallFeed(key)).toEqual({ items: [{ id: "9" }], shown: 25 });
});

test("a stored feed past its use-by date is left alone", () => {
  const key = "joined|0|||0x98";
  window.sessionStorage.setItem(
    `mochi-feed:${key}`,
    JSON.stringify({ at: Date.now() - 31 * 60 * 1000, items: [{ id: "9" }], shown: 25 }),
  );
  expect(recallFeed(key)).toBeNull();
});

test("a different key is a different feed", () => {
  rememberFeed(KEY, { items: [{ id: "1" }], shown: 25 });
  expect(recallFeed("popular|1|||0x0")).toBeNull();
});

test("scroll positions round-trip, and an absent one is the top", () => {
  expect(recallScroll("/")).toBe(0);
  rememberScroll("/", 1234.6);
  expect(recallScroll("/")).toBe(1235);
  expect(window.sessionStorage.getItem("mochi-scroll:/")).toBe("1235");
});

test("a scroll of zero is the top, not a flash to nowhere", () => {
  rememberScroll("/", 0);
  expect(recallScroll("/")).toBe(0);
});
