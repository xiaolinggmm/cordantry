// @vitest-environment jsdom
import "../test/setup";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../ui/language";
import { Onboarding } from "./Onboarding";

function mount() {
  return render(
    <LanguageProvider>
      <Onboarding />
    </LanguageProvider>,
  );
}
afterEach(() => vi.useRealTimers());

it("skips to a combined blank form and retains input through replay and remount", async () => {
  const user = userEvent.setup();
  const view = mount();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create directly" }));
  expect(screen.getByLabelText("Company name")).toHaveValue("");
  expect(screen.getByLabelText("Founder vision")).toHaveValue("");
  await user.type(screen.getByLabelText("Company name"), "My studio");
  await user.type(screen.getByLabelText("Founder vision"), "A real goal");
  expect(
    screen.getByRole("button", { name: "Generate team and plan" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Watch the demo" }));
  await user.click(screen.getByRole("button", { name: "Create directly" }));
  expect(screen.getByLabelText("Company name")).toHaveValue("My studio");
  view.unmount();
  mount();
  expect(screen.getByLabelText("Founder vision")).toHaveValue("A real goal");
});

it("returns a scrolled modal to the start when changing scene or opening the form", () => {
  mount();
  const dialog = screen.getByRole("dialog");
  dialog.scrollTop = 240;
  fireEvent.click(screen.getByRole("button", { name: "1 · Plan" }));
  expect(dialog.scrollTop).toBe(0);
  dialog.scrollTop = 240;
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(dialog.scrollTop).toBe(0);
  dialog.scrollTop = 200;
  fireEvent.click(screen.getByRole("button", { name: "Create directly" }));
  expect(dialog.scrollTop).toBe(0);
});

it("omits playback controls, stops at the result and restarts from a chapter", () => {
  vi.useFakeTimers();
  const view = mount();
  expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Replay" })).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(12500));
  expect(screen.getByText("14 tasks planned by CEO")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Make complex goals clear." }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Demo complete")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "1 · Plan" }));
  expect(screen.queryByText("14 tasks planned by CEO")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  act(() => vi.advanceTimersByTime(12000));
  expect(screen.getByText("Assigned by task requirements")).toBeInTheDocument();
  view.unmount();
  // Radix schedules focus restoration on unmount; flush that one-shot callback.
  act(() => vi.runOnlyPendingTimers());
  expect(vi.getTimerCount()).toBe(0);
});

it("shows complete static scenes with reduced motion and supports direct navigation", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  mount();
  expect(screen.getByText("14 tasks planned by CEO")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "2 · Assign" }));
  expect(screen.getByText("CEO assigns tasks")).toBeInTheDocument();
  expect(screen.getByText("Codex")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "4 · Decide" }));
  expect(screen.getByText("Delivery verified")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create my company" }),
  ).toBeInTheDocument();
  vi.unstubAllGlobals();
});


it("preserves all choices when switching execution modes and submits MAH configuration", async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<LanguageProvider><Onboarding agents={[{id: "codex", name: "Codex", detected: true, capabilities: []}]} onCreate={submit} /></LanguageProvider>);
  await user.click(screen.getByRole("button", {name: "Create directly"}));
  expect(screen.getByRole("radio", {name: "Direct dispatch (default)"})).toBeChecked();
  await user.type(screen.getByLabelText("Company name"), "Studio");
  await user.type(screen.getByLabelText("Founder vision"), "Build something");
  await user.selectOptions(screen.getByLabelText("CEO agent"), "codex");
  await user.click(screen.getByRole("radio", {name: "MAH coordination (advanced)"}));
  await user.type(screen.getByLabelText("MAH project root"), "/projects/demo");
  await user.type(screen.getByLabelText("MAH executable"), "/tools/mah");
  await user.click(screen.getByRole("radio", {name: "Direct dispatch (default)"}));
  await user.click(screen.getByRole("radio", {name: "MAH coordination (advanced)"}));
  expect(screen.getByLabelText("MAH project root")).toHaveValue("/projects/demo");
  await user.click(screen.getByRole("button", {name: "Generate team and plan"}));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({executionMode: "mah", companyName: "Studio", selectedCeoAgentId: "codex", mahConfig: {projectRoot: "/projects/demo", cliPath: "/tools/mah", slotClass: "background"}}));
});


it("accepts Windows absolute project paths and explicitly selected interactive slots", async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<LanguageProvider><Onboarding agents={[{id: "codex", name: "Codex", detected: true, capabilities: []}]} onCreate={submit} /></LanguageProvider>);
  await user.click(screen.getByRole("button", {name: "Create directly"}));
  await user.type(screen.getByLabelText("Company name"), "Studio");
  await user.type(screen.getByLabelText("Founder vision"), "Build");
  await user.selectOptions(screen.getByLabelText("CEO agent"), "codex");
  await user.click(screen.getByRole("radio", {name: "MAH coordination (advanced)"}));
  fireEvent.change(screen.getByLabelText("MAH project root"), {target: {value: "C:\\work\\project"}});
  await user.click(screen.getByText("Advanced"));
  await user.selectOptions(screen.getByLabelText("Slot class"), "interactive");
  await user.click(screen.getByRole("button", {name: "Generate team and plan"}));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({mahConfig: {projectRoot: "C:\\work\\project", cliPath: "mah", slotClass: "interactive"}}));
});

it("blocks both modes when no agent is detected", async () => {
  const user = userEvent.setup();
  render(<LanguageProvider><Onboarding agents={[{id: "codex", name: "Codex", detected: false, capabilities: []}]} onCreate={vi.fn()} /></LanguageProvider>);
  await user.click(screen.getByRole("button", {name: "Create directly"}));
  await user.type(screen.getByLabelText("Company name"), "Studio");
  await user.type(screen.getByLabelText("Founder vision"), "Build");
  expect(screen.queryByRole("option", {name: "Codex"})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Generate team and plan"})).toBeDisabled();
  await user.click(screen.getByRole("radio", {name: "MAH coordination (advanced)"}));
  await user.type(screen.getByLabelText("MAH project root"), "/project");
  expect(screen.getByRole("button", {name: "Generate team and plan"})).toBeDisabled();
});

it("locks the draft while a creation request is being validated", async () => {
  const user = userEvent.setup();
  render(<LanguageProvider><Onboarding isCreating agents={[{id: "codex", name: "Codex", detected: true, capabilities: []}]} onCreate={vi.fn()} /></LanguageProvider>);
  await user.click(screen.getByRole("button", {name: "Create directly"}));
  expect(screen.getByLabelText("Company name")).toBeDisabled();
  expect(screen.getByLabelText("CEO agent")).toBeDisabled();
  expect(screen.getByRole("button", {name: "Validating and creating…"})).toBeDisabled();
});

it("shows unavailable agents with recovery guidance and keeps them unselectable", async () => {
  render(<LanguageProvider><Onboarding agents={[{id: "codex", name: "Codex", detected: false, capabilities: [], availability: {state: "quota_exhausted", installed: true, checkedAt: "2026-11-02T00:00:00Z", retryAt: "2026-11-03T00:00:00Z"}}]} onCreate={vi.fn()} /></LanguageProvider>);
  await userEvent.click(screen.getByRole("button", {name: "Create directly"}));
  expect(screen.getByText(/Codex: Quota exhausted/)).toBeInTheDocument();
  expect(screen.queryByRole("option", {name: "Codex"})).not.toBeInTheDocument();
  expect(screen.getByText(/automatically use another available agent/)).toBeInTheDocument();
});
