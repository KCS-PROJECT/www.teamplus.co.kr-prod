"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Link2Off,
  ImagePlus,
  Undo2,
  Redo2,
} from "lucide-react";
import { uploadFile, toAbsoluteUrl } from "@/services/upload.service";

interface RichTextEditorProps {
  /** 현재 HTML 값 (수정 모드 초기값 · 외부 리셋 반영) */
  value: string;
  /** 편집 시 HTML 을 상위로 전달 */
  onChange: (html: string) => void;
  placeholder?: string;
}

/** 툴바 버튼 — 활성 상태 표시 + WCAG 터치 타겟(40px). */
function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md transition-colors motion-reduce:transition-none ${
        active
          ? "bg-primary/10 text-primary dark:bg-primary/20"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "본문을 입력해주세요.",
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    // Next.js App Router SSR 하이드레이션 불일치 방지
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({ inline: false }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-slate dark:prose-invert max-w-none min-h-[320px] px-4 py-3 focus:outline-none",
        "aria-label": placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // 외부 value 변경(수정 모드 로드/폼 리셋)을 에디터에 반영 — 현재값과 다를 때만.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const handleSetLink = useCallback(
    (ed: Editor) => {
      const prev = ed.getAttributes("link").href as string | undefined;
      const url = window.prompt("링크 URL 을 입력해주세요.", prev ?? "https://");
      if (url === null) return; // 취소
      if (url === "") {
        ed.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      ed.chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    },
    [],
  );

  const handlePickImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // 동일 파일 재선택 허용
      if (!file || !editor) return;
      try {
        const uploaded = await uploadFile(file, {
          category: "IMAGE",
          refType: "blog",
        });
        // 환경 간 포터블하도록 절대 URL 로 삽입(home 이 그대로 렌더).
        editor
          .chain()
          .focus()
          .setImage({ src: toAbsoluteUrl(uploaded.url), alt: file.name })
          .run();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.";
        window.alert(message);
      }
    },
    [editor],
  );

  if (!editor) {
    return (
      <div className="min-h-[380px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700" />
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 overflow-hidden">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 dark:border-slate-600 px-2 py-1.5 bg-slate-50 dark:bg-slate-800">
        <ToolbarButton
          label="굵게"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="기울임"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="취소선"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-600" aria-hidden="true" />

        <ToolbarButton
          label="제목 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="제목 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="글머리 목록"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="번호 목록"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="인용구"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-600" aria-hidden="true" />

        <ToolbarButton
          label="링크 삽입"
          active={editor.isActive("link")}
          onClick={() => handleSetLink(editor)}
        >
          <Link2 className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="링크 제거"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Link2Off className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="이미지 삽입" onClick={handlePickImage}>
          <ImagePlus className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-600" aria-hidden="true" />

        <ToolbarButton
          label="실행 취소"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="다시 실행"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="w-4 h-4" aria-hidden="true" />
        </ToolbarButton>
      </div>

      {/* 편집 영역 */}
      <EditorContent editor={editor} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleImageSelected}
      />
    </div>
  );
}

export default RichTextEditor;
