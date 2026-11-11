// @vitest-environment jsdom
import "../test/setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LanguageProvider } from "../ui/language";
import { Onboarding } from "./Onboarding";

it("asks only for the Founder Vision and submits no execution settings", async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<LanguageProvider><Onboarding onCreate={submit} /></LanguageProvider>);

  expect(screen.getByLabelText("Founder vision")).toBeInTheDocument();
  expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("CEO agent")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("MAH project root")).not.toBeInTheDocument();
  expect(screen.queryByText("Execution mode")).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Founder vision"), "Help creators crop video faster.");
  await user.click(screen.getByRole("button", { name: "Create Company" }));
  expect(submit).toHaveBeenCalledWith({ founderVision: "Help creators crop video faster." });
});

it("locks the Vision while company creation starts", () => {
  render(<LanguageProvider><Onboarding isCreating onCreate={vi.fn()} /></LanguageProvider>);
  expect(screen.getByLabelText("Founder vision")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
});
