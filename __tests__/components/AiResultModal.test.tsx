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

  it("consumes stream, shows content, and onAccept is called with accumulated text when clicking 接受", async () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    const stream = createMockStream([
      'data: {"content":"hello"}\n\n',
      'data: {"content":" world"}\n\n',
    ]);

    render(
      <AiResultModal stream={stream} onAccept={onAccept} onDiscard={onDiscard} />
    );

    await waitFor(() => {
      expect(screen.getByText("hello world")).toBeInTheDocument();
    });

    const acceptButton = screen.getByRole("button", { name: /接受/ });
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
