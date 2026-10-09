import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PullToRefresh } from "@social/components/PullToRefresh";

afterEach(cleanup);

function pull(node: HTMLElement, distance: number) {
  fireEvent.touchStart(node, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(node, { touches: [{ clientY: distance }] });
  fireEvent.touchEnd(node);
}

test("a pull past the threshold refreshes", async () => {
  const onRefresh = vi.fn(() => Promise.resolve());
  render(
    <PullToRefresh onRefresh={onRefresh}>
      <p>the feed</p>
    </PullToRefresh>,
  );

  pull(screen.getByTestId("ptr"), 300);
  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
});

test("a short pull is a wobble, not a refresh", () => {
  const onRefresh = vi.fn(() => Promise.resolve());
  render(
    <PullToRefresh onRefresh={onRefresh}>
      <p>the feed</p>
    </PullToRefresh>,
  );

  pull(screen.getByTestId("ptr"), 40);
  expect(onRefresh).not.toHaveBeenCalled();
});

test("scrolling upward is left to the page", () => {
  const onRefresh = vi.fn(() => Promise.resolve());
  render(
    <PullToRefresh onRefresh={onRefresh}>
      <p>the feed</p>
    </PullToRefresh>,
  );

  pull(screen.getByTestId("ptr"), -200);
  expect(onRefresh).not.toHaveBeenCalled();
});

test("the indicator stays busy until the work it asked for is done", async () => {
  let finish: () => void = () => {};
  const onRefresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <PullToRefresh onRefresh={onRefresh}>
      <p>the feed</p>
    </PullToRefresh>,
  );

  pull(screen.getByTestId("ptr"), 300);
  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

  const indicator = () => document.querySelector(".ptr-indicator")!;
  await waitFor(() => expect(indicator().className).toContain("is-busy"));

  finish();
  await waitFor(() => expect(indicator().className).not.toContain("is-busy"));
});

test("a second pull while one is running is ignored", async () => {
  let finish: () => void = () => {};
  const onRefresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <PullToRefresh onRefresh={onRefresh}>
      <p>the feed</p>
    </PullToRefresh>,
  );

  const node = screen.getByTestId("ptr");
  pull(node, 300);
  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

  pull(node, 300);
  await Promise.resolve();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  finish();
});
