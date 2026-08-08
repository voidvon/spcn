import { useEffect, useRef, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Code,
  CodeXml,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

interface ToolbarButtonProps {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}

function normalizeHtml(value: string) {
  const trimmed = value.trim()
  return trimmed === '<p></p>' || trimmed === '<p><br></p>' ? '' : trimmed
}

function ToolbarButton({ active, disabled, label, onClick, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '请输入详细内容',
  className,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: normalizeHtml(value),
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
        'aria-label': '详细内容编辑区',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(normalizeHtml(currentEditor.getHTML()))
    },
  }, [placeholder])

  useEffect(() => {
    if (!editor) {
      return
    }

    const nextValue = normalizeHtml(value)
    const currentValue = normalizeHtml(editor.getHTML())
    if (nextValue !== currentValue) {
      editor.commands.setContent(nextValue, { emitUpdate: false })
    }
  }, [editor, value])

  const disabled = !editor

  return (
    <div className={cn('rich-text-editor', className)}>
      <div className="rich-text-editor-toolbar">
        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton
            disabled={disabled || !editor?.can().undo()}
            label="撤销"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton
            disabled={disabled || !editor?.can().redo()}
            label="重做"
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton
            active={editor?.isActive('heading', { level: 1 })}
            disabled={disabled}
            label="一级标题"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive('heading', { level: 2 })}
            disabled={disabled}
            label="二级标题"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton
            active={editor?.isActive('bold')}
            disabled={disabled}
            label="加粗"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive('italic')}
            disabled={disabled}
            label="斜体"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive('strike')}
            disabled={disabled}
            label="删除线"
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton
            active={editor?.isActive('bulletList')}
            disabled={disabled}
            label="无序列表"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive('orderedList')}
            disabled={disabled}
            label="有序列表"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive('blockquote')}
            disabled={disabled}
            label="引用"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton
            active={editor?.isActive('code')}
            disabled={disabled}
            label="行内代码"
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <Code />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive('codeBlock')}
            disabled={disabled}
            label="代码块"
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          >
            <CodeXml />
          </ToolbarButton>
          <ToolbarButton
            disabled={disabled}
            label="清除格式"
            onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            <RemoveFormatting />
          </ToolbarButton>
        </div>
      </div>
      <EditorContent editor={editor} className="rich-text-editor-body" />
    </div>
  )
}
