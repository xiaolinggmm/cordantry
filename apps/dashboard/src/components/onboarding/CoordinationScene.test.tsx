// @vitest-environment jsdom
import "../../test/setup";
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { CoordinationScene } from "./CoordinationScene";
import { storyCopy } from "./storyCopy";

it.each(["en", "zh"] as const)("shows MAH delegating all 13 Assignments (%s)", language => {
  const c = storyCopy[language];
  const { rerender } = render(<CoordinationScene elapsed={0} reduced={false} c={c} />);
  expect(screen.queryByRole("list", { name: c.roles[1] })).not.toBeInTheDocument();
  rerender(<CoordinationScene elapsed={12} reduced={false} c={c} />);
  for (const [role, ids] of [[1, [1,3,5,14]], [2, [7,8,10,11]], [3, [2,6,9,12,13]]] as const) {
    const list = screen.getByRole("list", { name: c.roles[role] });
    expect(within(list).getAllByRole("listitem")).toHaveLength(ids.length);
    for (const id of ids) expect(within(list).getByText(`T${String(id).padStart(2, "0")}`)).toBeInTheDocument();
  }
  expect(screen.getByText(c.assignment.decision)).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: "Claude Code" })).toHaveLength(2);
  expect(screen.getByRole("img", { name: "Codex" })).toBeInTheDocument();
});
it("shows every assignment immediately with reduced motion", () => {
  render(<CoordinationScene elapsed={0} reduced c={storyCopy.en} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(13);
});
