"use client";

import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";

const DEBOUNCE_MS = 500;

export interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: (value: string) => void;
  onSelectionChange?: () => void;
  placeholder?: string;
  className?: string;
  /** Dynamic editor height in px, forwarded to MDEditor */
  editorHeight?: number;
}

export interface NoteEditorHandle {
  getSelectionRange: () => { start: number; end: number } | null;
}

type RefMDEditor = { textarea?: HTMLTextAreaElement } | null;

/**
 * Markdown editor (MDEditor) for note content. Calls onSave on blur or after debounce.
 * Exposes getSelectionRange() via ref for AI process selection.
 */
export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  {
    value,
    onChange,
    onSave,
    onSelectionChange,
    placeholder = "写点什么…",
    className = "",
    editorHeight,
  },
  ref
) {
  const [localValue, setLocalValue] = useState(value);
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mdEditorRef = useRef<RefMDEditor>(null);

  useImperativeHandle(ref, () => ({
    getSelectionRange() {
      const el = mdEditorRef.current?.textarea;
      if (!el) return null;
      const { selectionStart, selectionEnd } = el;
      if (selectionStart === selectionEnd) return null;
      return { start: selectionStart, end: selectionEnd };
    },
  }), []);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setColorMode(isDark ? "dark" : "light");
    const observer = new MutationObserver(() => {
      setColorMode(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const flushSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (onSave && localValue !== value) {
      onSave(localValue);
    }
  }, [onSave, localValue, value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (val?: string) => {
      const next = val ?? "";
      setLocalValue(next);
      onChange(next);
      if (onSave) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          if (next !== value) onSave(next);
        }, DEBOUNCE_MS);
      }
    },
    [onChange, onSave, value]
  );

  const notifySelection = useCallback(() => {
    onSelectionChange?.();
  }, [onSelectionChange]);

  return (
    <div className={`note-editor-md ${className}`.trim()} data-color-mode={colorMode}>
      <MDEditor
        ref={mdEditorRef as React.RefObject<{ textarea?: HTMLTextAreaElement }>}
        value={localValue}
        onChange={handleChange}
        height={editorHeight ?? 400}
        preview="edit"
        visibleDragbar={false}
        textareaProps={{
          placeholder,
          onMouseUp: notifySelection,
          onKeyUp: notifySelection,
          onBlur: flushSave,
        }}
        hideToolbar={false}
        enableScroll={true}
        className="note-editor-md__inner w-full"
      />
    </div>
  );
});
