"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useCallback, useMemo, useRef } from "react";

import { defineMonacoTheme } from "@/lib/monaco/get-monaco-theme";
import "@/lib/monaco/setup-monaco-environment";
import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";

loader.config({ monaco });

type MonacoPreviewEditorProps = {
  value: string;
  language: string;
  path: string;
  onChange: (value: string) => void;
  onSave: () => void;
  className?: string;
};

export function MonacoPreviewEditor({
  value,
  language,
  path,
  onChange,
  onSave,
  className,
}: MonacoPreviewEditorProps) {
  const { resolved } = useTheme();
  const theme = useMemo(() => defineMonacoTheme(monaco, resolved), [resolved]);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleMount: OnMount = useCallback(
    (editor, monacoApi) => {
      defineMonacoTheme(monacoApi, resolved);
      editor.addCommand(
        monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS,
        () => {
          onSaveRef.current();
        }
      );
    },
    [resolved]
  );

  return (
    <Editor
      beforeMount={(monacoApi) => {
        defineMonacoTheme(monacoApi, resolved);
      }}
      className={cn("min-h-0", className)}
      height="100%"
      key={path}
      language={language}
      loading={null}
      onChange={(nextValue) => {
        onChange(nextValue ?? "");
      }}
      onMount={handleMount}
      options={{
        automaticLayout: true,
        folding: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        hideCursorInOverviewRuler: true,
        lineNumbers: "on",
        minimap: { enabled: false },
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        padding: { top: 8, bottom: 8 },
        renderLineHighlight: "line",
        scrollBeyondLastLine: false,
        scrollbar: {
          horizontalScrollbarSize: 10,
          verticalScrollbarSize: 10,
        },
        wordWrap: "off",
      }}
      theme={theme}
      value={value}
    />
  );
}
