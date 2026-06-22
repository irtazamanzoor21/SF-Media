import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon } from "lucide-react";
import { useCallback, useEffect } from "react";
import { Toggle } from "@/components/ui/toggle";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

function ToolbarButton({
  editor,
  action,
  isActive,
  icon: Icon,
  label,
}: {
  editor: Editor;
  action: () => void;
  isActive: boolean;
  icon: typeof Bold;
  label: string;
}) {
  return (
    <Toggle
      size="sm"
      pressed={isActive}
      onPressedChange={() => action()}
      aria-label={label}
      className="h-7 w-7 p-0 data-[state=on]:bg-accent"
      data-testid={`toggle-${label.toLowerCase()}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </Toggle>
  );
}

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  className,
  "data-testid": testId,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[120px] px-3 py-2 text-sm",
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`border rounded-md bg-background overflow-hidden ${className || ""}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30">
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          icon={Bold}
          label="Bold"
        />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          icon={Italic}
          label="Italic"
        />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          icon={UnderlineIcon}
          label="Underline"
        />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          editor={editor}
          action={setLink}
          isActive={editor.isActive("link")}
          icon={LinkIcon}
          label="Link"
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

function isHtmlContent(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function highlightHashtags(text: string): (string | JSX.Element)[] {
  const parts = text.split(/(#\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("#")) {
      return (
        <span key={i} className="text-primary font-medium">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function RichTextContent({ html, className }: { html: string; className?: string }) {
  if (!isHtmlContent(html)) {
    return (
      <div className={`text-sm whitespace-pre-wrap ${className || ""}`}>
        {highlightHashtags(html)}
      </div>
    );
  }

  const coloredHtml = html.replace(
    /(#\w+)/g,
    '<span style="color: hsl(var(--primary)); font-weight: 500;">$1</span>'
  );

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: coloredHtml }}
    />
  );
}
