// @vitest-environment jsdom
import "../../test/setup";
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { StoryScene } from "./StoryScene";
import { storyCopy } from "./storyCopy";

it.each(["en", "zh"] as const)("runs independent Assignments and reports them to the CEO (%s)", language => {
  const c = storyCopy[language];
  const scene = (elapsed: number, reduced = false) => <StoryScene scene={2} elapsed={elapsed} reduced={reduced} c={c} />;
  const view = render(scene(1));
  expect(screen.getAllByRole("progressbar")).toHaveLength(3);
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  view.rerender(scene(4));
  expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  view.rerender(scene(10));
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  const inbox = screen.getByRole("region", { name: language === "zh" ? "CEO 收到的汇报" : "Reports to CEO" });
  expect(within(inbox).getAllByRole("listitem")).toHaveLength(3);
  expect(within(inbox).getByText(/T01/)).toBeInTheDocument();
  expect(within(inbox).getByText(/T02/)).toBeInTheDocument();
  expect(within(inbox).getByText(/T03/)).toBeInTheDocument();
  view.rerender(scene(0, true));
  expect(within(screen.getByRole("region", { name: language === "zh" ? "CEO 收到的汇报" : "Reports to CEO" })).getAllByRole("listitem")).toHaveLength(3);
});
