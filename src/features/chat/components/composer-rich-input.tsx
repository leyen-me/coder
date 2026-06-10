import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type CompositionEvent,
} from "react";

import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { isImeProcessingEnter, registerImeEnterSuppression } from "@/lib/ime-enter";
import { cn } from "@/lib/utils";

import { useComposerInsert } from "../hooks/use-composer-insert";
import type { ComposerInsertPayload } from "../lib/composer-insert-store";
import {
  deserializeAgentTextToDoc,
  editorHasWorkspaceReferences,
  resolveWorkspaceReferenceAttrs,
  serializeEditorToAgentText,
} from "../lib/composer-serialize";
import { WorkspaceReferenceExtension } from "../lib/workspace-reference-extension";

export type ComposerRichInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onCancelEdit?: () => void;
};

export function ComposerRichInput({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  onCancelEdit,
}: ComposerRichInputProps) {
  const attachments = usePromptInputAttachments();
  const isComposingRef = useRef(false);
  const keydownSuppressedRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  const handleUpdate = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
    },
    [onChange]
  );

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        orderedList: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
      WorkspaceReferenceExtension,
    ],
    content: deserializeAgentTextToDoc(value),
    editorProps: {
      attributes: {
        class: cn(
          "outline-none",
          "max-h-48 min-h-16 w-full flex-1 resize-none rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0"
        ),
        "data-composer-input": "true",
        "data-slot": "input-group-control",
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Escape" && onCancelEdit) {
          event.preventDefault();
          onCancelEdit();
          return true;
        }

        if (event.key === "Enter") {
          if (isImeProcessingEnter(event, isComposingRef.current)) {
            keydownSuppressedRef.current = true;
            isComposingRef.current = false;
            event.preventDefault();
            return true;
          }

          if (event.shiftKey) {
            return false;
          }

          event.preventDefault();

          const form = view.dom.closest("form");
          const submitButton = form?.querySelector(
            'button[type="submit"]'
          ) as HTMLButtonElement | null;

          if (submitButton?.disabled) {
            return true;
          }

          form?.requestSubmit();
          return true;
        }

        if (event.key === "Backspace") {
          const currentEditor = editorRef.current;
          if (!currentEditor) {
            return false;
          }

          const serialized = serializeEditorToAgentText(currentEditor);
          const isEmpty =
            currentEditor.isEmpty ||
            (serialized.length === 0 &&
              !editorHasWorkspaceReferences(currentEditor));

          if (isEmpty && attachments.files.length > 0) {
            event.preventDefault();
            const lastAttachment = attachments.files.at(-1);
            if (lastAttachment) {
              attachments.remove(lastAttachment.id);
            }
            return true;
          }
        }

        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) {
          return false;
        }

        const files: File[] = [];
        for (const item of items) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              files.push(file);
            }
          }
        }

        if (files.length > 0) {
          event.preventDefault();
          attachments.add(files);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      handleUpdate(serializeEditorToAgentText(currentEditor));
    },
  });

  const handleInsert = useCallback(
    (payload: ComposerInsertPayload) => {
      if (!editor) {
        return;
      }

      const attrs = resolveWorkspaceReferenceAttrs(payload.path, {
        isDir: payload.isDir,
        name: payload.name,
      });

      const { from, to } = editor.state.selection;
      const insertAtCursor = editor.isFocused && from === to;
      const chain = editor.chain().focus();

      if (!insertAtCursor) {
        chain.setTextSelection(editor.state.doc.content.size);
      }

      chain.insertWorkspaceReference(attrs).insertContent(" ").run();
    },
    [editor]
  );

  useComposerInsert(handleInsert);

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || placeholder === undefined) {
      return;
    }

    const extension = editor.extensionManager.extensions.find(
      (item) => item.name === "placeholder"
    );

    if (!extension) {
      return;
    }

    extension.options.placeholder = placeholder;
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholder]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const serialized = serializeEditorToAgentText(editor);
    if (value === serialized) {
      return;
    }

    editor.commands.setContent(deserializeAgentTextToDoc(value), {
      emitUpdate: false,
    });
  }, [editor, value]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (event: CompositionEvent<HTMLDivElement>) => {
      isComposingRef.current = false;

      if (keydownSuppressedRef.current) {
        keydownSuppressedRef.current = false;
        return;
      }

      registerImeEnterSuppression(event.currentTarget);
    },
    []
  );

  const handleClipboardPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        event.preventDefault();
        attachments.add(files);
      }
    },
    [attachments]
  );

  return (
    <>
      <input name="message" type="hidden" value={value} readOnly />
      <EditorContent
        className={cn(
          "field-sizing-content w-full",
          "[&_.ProseMirror_p.is-empty::before]:pointer-events-none",
          "[&_.ProseMirror_p.is-empty::before]:float-left",
          "[&_.ProseMirror_p.is-empty::before]:h-0",
          "[&_.ProseMirror_p.is-empty::before]:text-muted-foreground",
          "[&_.ProseMirror_p.is-empty::before]:content-[attr(data-placeholder)]",
          className
        )}
        editor={editor}
        onCompositionEnd={handleCompositionEnd}
        onCompositionStart={handleCompositionStart}
        onPaste={handleClipboardPaste}
      />
    </>
  );
}
