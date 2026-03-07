"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 500;

export interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Controlled textarea for note content. Calls onSave on blur or after debounce (500ms).
 */
export function NoteEditor({
  value,
  onChange,
  onSave,
  placeholder = "写点什么…",
  className = "",
}: NoteEditorProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when external value changes (e.g. after load)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    onChange(next);
    if (onSave) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        if (next !== value) onSave(next);
      }, DEBOUNCE_MS);
    }
  };

  const handleBlur = () => {
    flushSave();
  };

  return (
    <textarea
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={`min-h-[200px] w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-foreground placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500 ${className}`}
    />
  );
}
