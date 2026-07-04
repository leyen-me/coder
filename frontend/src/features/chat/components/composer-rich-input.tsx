import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CompositionEvent,
  type MutableRefObject,
} from "react";

import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { isImeProcessingEnter, registerImeEnterSuppression } from "@/lib/ime-enter";
import { cn } from "@/lib/utils";

import { useComposerInsert } from "../hooks/use-composer-insert";
import { useWorkspacePathSearch } from "../hooks/use-workspace-path-search";
import type { ComposerInsertPayload } from "../lib/composer-insert-store";
import {
  getActiveComposerMention,
  type ActiveComposerMention,
} from "../lib/composer-mention-state";
import {
  deserializeAgentTextToDoc,
  editorHasInlineReferences,
  looksLikeFilePath,
  resolveSkillReferenceAttrs,
  resolveWorkspaceReferenceAttrs,
  serializeEditorToAgentText,
} from "../lib/composer-serialize";
import type { WorkspacePathMatch } from "../lib/search-workspace-paths";
import { SkillReferenceExtension } from "../lib/skill-reference-extension";
import { WorkspaceReferenceExtension } from "../lib/workspace-reference-extension";
import {
  getActiveComposerSkill,
  type ActiveComposerSkill,
} from "../lib/composer-skill-state";
import {
  filterEnabledSkills,
  useEnabledSkills,
} from "../hooks/use-enabled-skills";
import type { SkillListItem } from "@/features/skills/types";

import { ComposerMentionPopover } from "./composer-mention-popover";
import { ComposerSkillPopover } from "./composer-skill-popover";

export type ComposerRichInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onCancelEdit?: () => void;
  workspaceDir?: string | null;
  editorRef?: MutableRefObject<Editor | null>;
};

function clampSelectionPosition(position: number, maxPosition: number): number {
  return Math.min(Math.max(position, 1), Math.max(maxPosition, 1));
}

export function ComposerRichInput({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  onCancelEdit,
  workspaceDir,
  editorRef: externalEditorRef,
}: ComposerRichInputProps) {
  const attachments = usePromptInputAttachments();
  const isComposingRef = useRef(false);
  const keydownSuppressedRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mentionRef = useRef<ActiveComposerMention | null>(null);
  const skillRef = useRef<ActiveComposerSkill | null>(null);
  const selectedIndexRef = useRef(0);
  const resultsRef = useRef<WorkspacePathMatch[]>([]);
  const skillResultsRef = useRef<SkillListItem[]>([]);
  const [mention, setMention] = useState<ActiveComposerMention | null>(null);
  const [skillMention, setSkillMention] = useState<ActiveComposerSkill | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchorWidth, setAnchorWidth] = useState<number | undefined>();

  const trimmedWorkspaceDir = workspaceDir?.trim() ?? "";
  const hasWorkspace = trimmedWorkspaceDir.length > 0;
  const { results, loading } = useWorkspacePathSearch(
    trimmedWorkspaceDir,
    mention?.query ?? "",
    Boolean(mention)
  );
  const { skills: enabledSkills, loading: skillsLoading } = useEnabledSkills(true);
  const skillResults = filterEnabledSkills(
    enabledSkills,
    skillMention?.query ?? ""
  );
  const enabledSkillSlugs = useMemo(
    () => new Set(enabledSkills.map((s) => s.slug)),
    // Stringify to produce a stable reference when the skill list hasn't changed.
    // `new Set(...)` creates a new object every render, breaking referential
    // equality and causing downstream memo / useEffect to fire unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(enabledSkills.map((s) => s.slug).sort())]
  );
  const deserializeOptions = useMemo(
    () => ({
      isEnabledSkill: (slug: string) => enabledSkillSlugs.has(slug),
      isValidWorkspacePath: hasWorkspace ? looksLikeFilePath : undefined,
    }),
    [enabledSkillSlugs, hasWorkspace]
  );

  const updateSelectedIndex = useCallback((nextIndex: number) => {
    selectedIndexRef.current = nextIndex;
    setSelectedIndex(nextIndex);
  }, []);

  const syncMentionState = useCallback(
    (editor: Editor) => {
      const nextMention = getActiveComposerMention(editor.state);
      mentionRef.current = nextMention;
      setMention(nextMention);

      if (nextMention) {
        skillRef.current = null;
        setSkillMention(null);
      } else {
        const nextSkill = getActiveComposerSkill(editor.state);
        skillRef.current = nextSkill;
        setSkillMention(nextSkill);
      }

      updateSelectedIndex(0);
    },
    [updateSelectedIndex]
  );

  const handleSelectSkill = useCallback(
    (item: SkillListItem) => {
      const editor = editorRef.current;
      const activeSkill = skillRef.current;
      if (!editor || !activeSkill) {
        return;
      }

      const attrs = resolveSkillReferenceAttrs(item.slug, { name: item.name });

      editor
        .chain()
        .focus()
        .deleteRange({
          from: activeSkill.range.from,
          to: activeSkill.range.to,
        })
        .insertSkillReference(attrs)
        .insertContent(" ")
        .run();

      skillRef.current = null;
      setSkillMention(null);
      updateSelectedIndex(0);
    },
    [updateSelectedIndex]
  );

  const handleSelectMention = useCallback(
    (item: WorkspacePathMatch) => {
      const editor = editorRef.current;
      const activeMention = mentionRef.current;
      if (!editor || !activeMention) {
        return;
      }

      const attrs = resolveWorkspaceReferenceAttrs(item.path, {
        isDir: item.isDir,
        name: item.name,
      });

      editor
        .chain()
        .focus()
        .deleteRange({
          from: activeMention.range.from,
          to: activeMention.range.to,
        })
        .insertWorkspaceReference(attrs)
        .insertContent(" ")
        .run();

      mentionRef.current = null;
      setMention(null);
      updateSelectedIndex(0);
    },
    [updateSelectedIndex]
  );

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
        bold: false,
        code: false,
        italic: false,
        strike: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
      WorkspaceReferenceExtension,
      SkillReferenceExtension,
    ],
    content: deserializeAgentTextToDoc(value, deserializeOptions),
    editorProps: {
      attributes: {
        class: cn(
          "outline-none",
          "max-h-48 min-h-16 w-full flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0"
        ),
        "data-composer-input": "true",
        "data-slot": "input-group-control",
      },
      handleKeyDown: (view, event) => {
        const activeMention = mentionRef.current;
        const activeSkill = skillRef.current;

        if (activeMention) {
          if (event.key === "Escape") {
            event.preventDefault();
            mentionRef.current = null;
            setMention(null);
            updateSelectedIndex(0);
            return true;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            const nextResults = resultsRef.current;
            const nextIndex =
              nextResults.length === 0
                ? 0
                : Math.min(selectedIndexRef.current + 1, nextResults.length - 1);
            updateSelectedIndex(nextIndex);
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            updateSelectedIndex(Math.max(selectedIndexRef.current - 1, 0));
            return true;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            const selected = resultsRef.current[selectedIndexRef.current];
            if (selected) {
              event.preventDefault();
              handleSelectMention(selected);
              return true;
            }
          }
        }

        if (activeSkill) {
          if (event.key === "Escape") {
            event.preventDefault();
            skillRef.current = null;
            setSkillMention(null);
            updateSelectedIndex(0);
            return true;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            const nextResults = skillResultsRef.current;
            const nextIndex =
              nextResults.length === 0
                ? 0
                : Math.min(selectedIndexRef.current + 1, nextResults.length - 1);
            updateSelectedIndex(nextIndex);
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            updateSelectedIndex(Math.max(selectedIndexRef.current - 1, 0));
            return true;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            const selected = skillResultsRef.current[selectedIndexRef.current];
            if (selected) {
              event.preventDefault();
              handleSelectSkill(selected);
              return true;
            }
          }
        }

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
              !editorHasInlineReferences(currentEditor));

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
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) {
          return false;
        }

        // File paste — delegate to attachment handling.
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

        // Text paste — insert as plain text to strip all HTML formatting
        // (bold, italic, code, etc.) that ProseMirror's default paste
        // handler would otherwise preserve from the rich clipboard.
        const plainText = event.clipboardData?.getData("text/plain");
        if (plainText) {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText(plainText));
          return true;
        }

        return false;
      },
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      syncMentionState(currentEditor);
    },
    onUpdate: ({ editor: currentEditor }) => {
      syncMentionState(currentEditor);
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
    if (externalEditorRef) {
      externalEditorRef.current = editor ?? null;
    }
  }, [editor, externalEditorRef]);

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

    const previousSelection = editor.state.selection;
    const shouldPreserveSelection = editor.isFocused;

    editor.commands.setContent(
      deserializeAgentTextToDoc(value, deserializeOptions),
      {
        emitUpdate: false,
      }
    );
    if (shouldPreserveSelection) {
      const maxPosition = editor.state.doc.content.size;
      editor.commands.setTextSelection({
        from: clampSelectionPosition(previousSelection.from, maxPosition),
        to: clampSelectionPosition(previousSelection.to, maxPosition),
      });
    } else {
      // Move cursor to the end when loading content into the editor (e.g.
      // when entering edit mode), so the user can continue typing immediately.
      editor.commands.focus("end");
    }
    syncMentionState(editor);
  }, [editor, syncMentionState, value, enabledSkillSlugs, deserializeOptions]);

  // Re-process editor content once enabled skills become available, so
  // patterns matching real skills are upgraded to skillReference nodes.
  const processedWithSkillsRef = useRef(false);
  useEffect(() => {
    if (!editor || enabledSkillSlugs.size === 0 || processedWithSkillsRef.current) {
      return;
    }
    processedWithSkillsRef.current = true;

    const previousSelection = editor.state.selection;
    const shouldPreserveSelection = editor.isFocused;

    editor.commands.setContent(
      deserializeAgentTextToDoc(value, deserializeOptions),
      { emitUpdate: false }
    );
    if (shouldPreserveSelection) {
      const maxPosition = editor.state.doc.content.size;
      editor.commands.setTextSelection({
        from: clampSelectionPosition(previousSelection.from, maxPosition),
        to: clampSelectionPosition(previousSelection.to, maxPosition),
      });
    } else {
      editor.commands.focus("end");
    }
    syncMentionState(editor);
  }, [editor, enabledSkillSlugs, value, syncMentionState]);

  // Auto-focus the editor when the component mounts.
  // Move cursor to the end so editing an existing message puts the
  // cursor at the end of the text, ready to continue typing.
  const hasFocused = useRef(false);
  useEffect(() => {
    if (editor && !hasFocused.current) {
      hasFocused.current = true;
      editor.commands.focus("end");
    }
  }, [editor]);

  useEffect(() => {
    skillResultsRef.current = skillResults;
  }, [skillResults]);

  useEffect(() => {
    if (!skillMention) {
      return;
    }

    if (skillResults.length === 0) {
      updateSelectedIndex(0);
      return;
    }

    updateSelectedIndex(Math.min(selectedIndexRef.current, skillResults.length - 1));
  }, [skillMention, skillResults.length, updateSelectedIndex]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    if (!mention) {
      return;
    }

    if (results.length === 0) {
      updateSelectedIndex(0);
      return;
    }

    updateSelectedIndex(Math.min(selectedIndexRef.current, results.length - 1));
  }, [mention, results.length, updateSelectedIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setAnchorWidth(container.offsetWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

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

  return (
    <>
      <input name="message" type="hidden" value={value} readOnly />
      <div className="relative w-full" ref={containerRef}>
        <ComposerMentionPopover
          anchorWidth={anchorWidth}
          hasWorkspace={hasWorkspace}
          loading={loading}
          onSelect={handleSelectMention}
          onSelectedIndexChange={updateSelectedIndex}
          open={Boolean(mention)}
          results={results}
          selectedIndex={selectedIndex}
        />
        <ComposerSkillPopover
          anchorWidth={anchorWidth}
          loading={skillsLoading}
          onSelect={handleSelectSkill}
          onSelectedIndexChange={updateSelectedIndex}
          open={Boolean(skillMention)}
          results={skillResults}
          selectedIndex={selectedIndex}
        />
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
        />
      </div>
    </>
  );
}
