import { beforeEach, expect, test } from "vitest";
import { clearDraft, readDraft, writeDraft } from "./drafts";

beforeEach(() => {
  window.sessionStorage.clear();
});

test("a draft comes back to the box that wrote it", () => {
  writeDraft("reply:7", "half a thought");
  expect(readDraft("reply:7")).toBe("half a thought");
});

test("drafts are scoped to the thing being answered", () => {
  writeDraft("reply:7", "about seven");
  writeDraft("reply:8", "about eight");
  expect(readDraft("reply:7")).toBe("about seven");
  expect(readDraft("reply:8")).toBe("about eight");
});

test("an empty write clears the draft", () => {
  writeDraft("post", "gone in a moment");
  writeDraft("post", "");
  expect(readDraft("post")).toBe("");
  expect(window.sessionStorage.getItem("mochi-draft:post")).toBeNull();
});

test("clearing is the same as writing nothing", () => {
  writeDraft("post:m/cats", "meow");
  clearDraft("post:m/cats");
  expect(readDraft("post:m/cats")).toBe("");
});

test("an absent draft is an empty box", () => {
  expect(readDraft("reply:404")).toBe("");
});
