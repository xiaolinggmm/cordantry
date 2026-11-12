// @vitest-environment jsdom
import "./test/setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import App from "./App";
import type { ApiClient, CompanyCreationReceipt, CompanyStateResponse } from "./api/client";

it("creates a company from Founder Vision without asking for an Agent or execution mode", async () => {
  const state = companyState();
  const client = mockClient(state);
  const user = userEvent.setup();
  render(<App apiClient={client} />);

  await user.click(await screen.findByRole("button", { name: "Create directly" }));
  await user.type(await screen.findByLabelText("Company name"), "Creator Studio");
  await user.type(await screen.findByLabelText("Founder vision"), "Help creators crop video faster.");
  await user.click(screen.getByRole("button", { name: "Create Company" }));

  expect(client.createCompany).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Creator Studio", founderVision: "Help creators crop video faster." }));
  expect(screen.queryByText(/Codex|Claude|execution mode/i)).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Creator Studio" })).toBeInTheDocument();
});

it("renders Assignments returned by MAH planning", async () => {
  const state = companyState();
  localStorage.setItem("cordantry.currentCompanyId", state.company.id);
  render(<App apiClient={mockClient(state)} />);

  expect(await screen.findByRole("article", { name: "Interview creators" })).toHaveTextContent("Ready to start");
});

function mockClient(state: CompanyStateResponse): ApiClient {
  const receipt: CompanyCreationReceipt = { schemaVersion: 1, kind: "company_creation_receipt", company: state.company, createdAt: state.company.createdAt };
  return {
    listCompanies: vi.fn(async () => ({ companies: [] })),
    createCompany: vi.fn(async () => receipt),
    retryCompanyCreation: vi.fn(async () => receipt),
    getCompanyState: vi.fn(async () => state),
    pauseCompany: vi.fn(async () => ({ ...state, company: { ...state.company, status: "paused" as const } })),
    resumeCompany: vi.fn(async () => state),
    stopCompany: vi.fn(async () => ({ ...state, company: { ...state.company, status: "stopped" as const } })),
    subscribeEvents: vi.fn(() => () => undefined),
  };
}

function companyState(): CompanyStateResponse {
  const at = "2026-11-12T00:00:00.000Z";
  return {
    schemaVersion: 1, kind: "company_state", lastEventSequence: 6,
    company: { id: "company_1", name: "Creator Studio", founderVision: "Help creators.", status: "active", createdAt: at, updatedAt: at },
    problem: null,
    objectives: [{ id: "objective_1", title: "Validate demand", status: "active", priority: 0 }],
    departments: [{ id: "department_1", name: "Research", responsibility: "Learn what creators need." }],
    assignments: [{ id: "assignment_1", departmentId: "department_1", objectiveId: "objective_1", title: "Interview creators", expectedOutcome: "Ranked problems.", dependsOnAssignmentIds: [], route: { kind: "ordinary_task", rationale: "Business research." }, order: 0, stage: "research", status: "ready", result: null }],
  };
}
