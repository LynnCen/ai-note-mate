/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AiResultModal } from "@client/components/notes/AiResultModal";

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("AiResultModal", () => {
  it("renders null when stream is null", () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    const { container } = render(
      <AiResultModal stream={null} onAccept={onAccept} onDiscard={onDiscard} />
    );
    expect(container.firstChild).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("detects data: [DONE] as stream completion", async () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    const stream = createMockStream([
      'data: {"content":"hello"}\n\n',
      "data: [DONE]\n\n",
      // TCP may stay open after [DONE] — stream does NOT close here
    ]);

    render(
      <AiResultModal stream={stream} onAccept={onAccept} onDiscard={onDiscard} />
    );

    await waitFor(() => {
      const acceptButton = screen.getByRole("button", { name: /^接受$/ });
      expect(acceptButton).not.toBeDisabled();
    });
  });

  it("Accept button is disabled while streaming, enabled after done; calls onAccept with full text", async () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    const stream = createMockStream([
      'data: {"content":"hello"}\n\n',
      'data: {"content":" world"}\n\n',
    ]);

    render(
      <AiResultModal stream={stream} onAccept={onAccept} onDiscard={onDiscard} />
    );

    // Initially disabled while stream is in progress
    const acceptButton = screen.getByRole("button", { name: /接受/ });
    expect(acceptButton).toBeDisabled();

    // Wait for stream to complete and content to appear
    await waitFor(() => {
      expect(screen.getByText("hello world")).toBeInTheDocument();
    });

    // Enabled after stream done
    expect(acceptButton).not.toBeDisabled();

    fireEvent.click(acceptButton);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith("hello world");
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("calls onDiscard when clicking 丢弃", async () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    const stream = createMockStream(['data: {"content":"x"}\n\n']);

    render(
      <AiResultModal stream={stream} onAccept={onAccept} onDiscard={onDiscard} />
    );

    const discardButton = screen.getByRole("button", { name: /丢弃/ });
    await act(async () => {
      fireEvent.click(discardButton);
    });

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
