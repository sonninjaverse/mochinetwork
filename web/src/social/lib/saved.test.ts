import { beforeEach, expect, it } from "vitest";
import { isSaved, savedIds, toggleSaved } from "./saved";

beforeEach(() => localStorage.clear());

it("toggles a post in and out of saved", () => {
  expect(isSaved("1")).toBe(false);
  toggleSaved("1");
  expect(isSaved("1")).toBe(true);
  expect(savedIds()).toEqual(["1"]);
  toggleSaved("1");
  expect(isSaved("1")).toBe(false);
  expect(savedIds()).toEqual([]);
});

it("keeps the newest save first", () => {
  toggleSaved("1");
  toggleSaved("2");
  expect(savedIds()).toEqual(["2", "1"]);
});

it("survives a corrupt value rather than throwing", () => {
  localStorage.setItem("mochi-saved", "not json");
  expect(savedIds()).toEqual([]);
  toggleSaved("3");
  expect(savedIds()).toEqual(["3"]);
});
