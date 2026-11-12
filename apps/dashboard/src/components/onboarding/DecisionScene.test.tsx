// @vitest-environment jsdom
import "../../test/setup";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StoryScene } from "./StoryScene";
import { storyCopy } from "./storyCopy";

it.each(["en", "zh"] as const)("approves a selected direction before resuming and verifying (%s)", language => {
  const c = storyCopy[language];
  const scene = (elapsed: number, reduced = false) => <StoryScene scene={3} elapsed={elapsed} reduced={reduced} c={c} />;
  const view = render(scene(0));
  expect(screen.getByText(/T04/)).toBeInTheDocument();
  expect(screen.queryByText("Approve")).not.toBeInTheDocument();
  view.rerender(scene(3));
  expect(screen.getByText("Approve")).toBeInTheDocument();
  expect(view.container.querySelector('[data-selected="true"]')).toBeNull();
  view.rerender(scene(4.5));
  expect(view.container.querySelector('[data-selected="true"]')).not.toBeNull();
  expect(screen.queryByText(language === "zh" ? "任务继续" : "Work resumes")).not.toBeInTheDocument();
  view.rerender(scene(6.5));
  expect(screen.getByText(language === "zh" ? "任务继续" : "Work resumes")).toBeInTheDocument();
  view.rerender(scene(8.5));
  expect(screen.getByText(language === "zh" ? "验证交付结果" : "Verifying delivery")).toBeInTheDocument();
  view.rerender(scene(10));
  expect(screen.getByText(language === "zh" ? "交付已验证" : "Delivery verified")).toBeInTheDocument();
  view.rerender(scene(0, true));
  expect(screen.getByText(language === "zh" ? "交付已验证" : "Delivery verified")).toBeInTheDocument();
});
