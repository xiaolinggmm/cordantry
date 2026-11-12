// @vitest-environment jsdom
import "../../test/setup";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StoryScene } from "./StoryScene";
import { storyCopy } from "./storyCopy";

it.each(["en", "zh"] as const)("shows MAH preparing the Company Plan in %s", (language) => {
  const c = storyCopy[language];
  const scene = (elapsed: number, reduced = false) => <StoryScene scene={0} elapsed={elapsed} reduced={reduced} c={c} />;
  const view = render(scene(1));
  expect(screen.getByRole("textbox").textContent!.length).toBeLessThan(c.foundingVision.length);
  expect(screen.getByTestId("typing-caret")).toBeInTheDocument();
  expect(screen.queryByText("T01")).not.toBeInTheDocument();
  view.rerender(scene(3.9));
  expect(screen.getByRole("textbox")).toHaveTextContent(c.foundingVision);
  expect(screen.queryByTestId("typing-caret")).not.toBeInTheDocument();
  expect(screen.getByText(language === "zh" ? "提交愿景" : "Send vision")).toBeInTheDocument();
  view.rerender(scene(5.2));
  expect(screen.getByText(language === "zh" ? "MAH 已收到愿景" : "MAH received your vision")).toBeInTheDocument();
  expect(screen.queryByText("T01")).not.toBeInTheDocument();
  view.rerender(scene(10));
  expect(screen.getByText(language === "zh" ? "Company Plan 已就绪 · 14 项 Assignment" : "Company Plan ready · 14 Assignments")).toBeInTheDocument();
  expect(screen.getByText(language === "zh" ? "调研完成后" : "After research")).toBeInTheDocument();
  expect(screen.getByText(language === "zh" ? "+ 10 项 Assignment · 开发、上线与验证" : "+ 10 Assignments · Build, launch & validate")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  view.rerender(scene(0, true));
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.queryByTestId("typing-caret")).not.toBeInTheDocument();
});
