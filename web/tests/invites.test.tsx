import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InviteButton } from "@social/components/InviteButton";
import { GateForm } from "@social/components/GateForm";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), status: vi.fn(), confirm: vi.fn(), replace: vi.fn(), refresh: vi.fn(), copy: vi.fn(),
}));
vi.mock("@social/lib/viewer", () => ({ useViewer: () => "0x1111111111111111111111111111111111111111" }));
vi.mock("@social/lib/invites", () => ({ loadInvitations: mocks.load, gateStatus: mocks.status, confirmInviteAccount: mocks.confirm }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ enabled: true });
  mocks.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.copy } });
  window.history.replaceState({}, "", "/");
});
afterEach(() => cleanup());

test("shows remaining invitations, copies unused codes and links, and identifies the friend who joined", async () => {
  mocks.load.mockResolvedValue({ allowance: 3, remaining: 1, joined: 1, codes: [
    { code: "mochi-unused", usedAt: null, usedBy: null, handle: null },
    { code: "mochi-pending", usedAt: 123, usedBy: null, handle: null },
    { code: "mochi-joined", usedAt: 123, usedBy: "0x2222222222222222222222222222222222222222", handle: "alice" },
  ] });
  render(<InviteButton />);
  fireEvent.click(await screen.findByText("Invite friends"));
  expect(await screen.findByText("1 friend joined")).toBeVisible();
  expect(screen.getByRole("link", { name: "@alice" })).toHaveAttribute("href", "/alice");
  expect(screen.getAllByRole("button", { name: "Copy code" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
  await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("mochi-unused"));
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith(`${window.location.origin}/gate?code=mochi-unused`));
});

test("shows a retry after account confirmation fails without exposing stale codes", async () => {
  mocks.load.mockRejectedValue(new Error("This account needs an invitation."));
  render(<InviteButton />);
  fireEvent.click(await screen.findByText("Invite friends"));
  expect(await screen.findByRole("alert")).toHaveTextContent("This account needs an invitation.");
  expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("invite links prefill the native form without consuming the code", async () => {
  window.history.replaceState({}, "", "/gate?code=mochi-from-friend&next=%2Fpopular");
  render(<GateForm />);
  const input = await screen.findByTestId("gate-code");
  expect(input).toHaveValue("mochi-from-friend");
  expect(screen.getByTestId("gate-submit")).toBeEnabled();
  expect(document.querySelector('input[name="next"]')).toHaveValue("/popular");
  expect(mocks.confirm).not.toHaveBeenCalled();
});

test("offers following X as a way to get a code", async () => {
  render(<GateForm />);
  const follow = await screen.findByTestId("gate-follow");
  expect(follow).toHaveAttribute("href", "https://x.com/mochidotmeme");
  expect(follow).toHaveAttribute("target", "_blank");
  expect(follow).toHaveAttribute("rel", "noreferrer");
});

test("a returning account proves ownership before returning to the requested page", async () => {
  window.history.replaceState({}, "", "/gate?next=%2Fpopular");
  mocks.confirm.mockResolvedValue(true);
  render(<GateForm />);
  fireEvent.click(await screen.findByTestId("gate-sign-in"));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/popular"));
});

test("a bad invite preserves a safe destination and explains that codes are single-use", async () => {
  window.history.replaceState({}, "", "/gate?bad=1&next=%2F%2Fevil.example");
  render(<GateForm />);
  expect(await screen.findByRole("alert")).toHaveTextContent("already been used");
  expect(document.querySelector('input[name="next"]')).toHaveValue("/");
});
