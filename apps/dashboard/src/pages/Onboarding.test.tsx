// @vitest-environment jsdom
import "../test/setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LanguageProvider } from "../ui/language";
import { Onboarding } from "./Onboarding";

it("shows the four-scene explainer before the Founder Vision form", async () => {
  const user = userEvent.setup();
  render(<LanguageProvider><Onboarding onCreate={vi.fn()} /></LanguageProvider>);

  expect(screen.getByRole("heading", { name: "Turn a vision into a company plan." })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Plan/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Delegate/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Progress/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Decide/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Founder vision")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Create directly" }));
  expect(screen.getByLabelText("Founder vision")).toBeInTheDocument();
});

it("asks for the company name and Founder Vision but no execution settings", async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<LanguageProvider><Onboarding onCreate={submit} /></LanguageProvider>);

  await user.click(screen.getByRole("button", { name: "Create directly" }));
  expect(screen.getByLabelText("Company name")).toBeInTheDocument();
  expect(screen.getByLabelText("Founder vision")).toBeInTheDocument();
  expect(screen.queryByLabelText("CEO agent")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("MAH project root")).not.toBeInTheDocument();
  expect(screen.queryByText("Execution mode")).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Company name"), "Creator Studio");
  await user.type(screen.getByLabelText("Founder vision"), "Help creators crop video faster.");
  await user.click(screen.getByRole("button", { name: "Create Company" }));
  expect(submit).toHaveBeenCalledWith({ companyName: "Creator Studio", founderVision: "Help creators crop video faster." });
});

it("locks the Vision while company creation starts", () => {
  render(<LanguageProvider><Onboarding isCreating onCreate={vi.fn()} /></LanguageProvider>);
  expect(screen.getByLabelText("Founder vision")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
});
