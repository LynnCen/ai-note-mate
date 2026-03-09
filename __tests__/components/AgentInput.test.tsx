/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentInput } from "@client/components/agent/AgentInput";
import { describe, it, expect, vi } from "vitest";

describe("AgentInput", () => {
  it("shows Send button when not streaming", () => {
    render(<AgentInput onSend={vi.fn()} onStop={vi.fn()} streaming={false} />);
    expect(screen.getByRole("button", { name: /发送/i })).toBeInTheDocument();
  });

  it("shows Stop button when streaming", () => {
    render(<AgentInput onSend={vi.fn()} onStop={vi.fn()} streaming={true} />);
    expect(screen.getByRole("button", { name: /停止/i })).toBeInTheDocument();
  });

  it("shows default context chip '全文'", () => {
    render(<AgentInput onSend={vi.fn()} onStop={vi.fn()} streaming={false} />);
    expect(screen.getByText(/全文/)).toBeInTheDocument();
  });

  it("calls onStop when Stop button clicked", () => {
    const onStop = vi.fn();
    render(<AgentInput onSend={vi.fn()} onStop={onStop} streaming={true} />);
    fireEvent.click(screen.getByRole("button", { name: /停止/i }));
    expect(onStop).toHaveBeenCalled();
  });
});
