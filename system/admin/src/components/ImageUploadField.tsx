import { useId, useRef, useState } from 'react'
import axios from 'axios'
import { ImageIcon, LoaderCircle, Upload } from 'lucide-react'
import { uploadsApi } from '@/api/uploads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const MAX_UPLOAD_SIZE = 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

interface ImageUploadFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

export default function ImageUploadField({ id, label, value, onChange }: ImageUploadFieldProps) {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [failedPreviewValue, setFailedPreviewValue] = useState('')

  const updateValue = (nextValue: string) => {
    setFailedPreviewValue('')
    onChange(nextValue)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.error('仅支持 JPG、PNG、GIF 和 WebP 图片')
      return
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error('图片大小不能超过 1MB')
      return
    }

    setIsUploading(true)
    try {
      const result = await uploadsApi.image(file)
      updateValue(result.relativePath)
      toast.success('图片上传成功')
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined
      toast.error(message || '图片上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="w-80 max-w-full space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex aspect-[4/3] w-full max-w-80 items-center justify-center overflow-hidden rounded-md border bg-muted/30 p-3">
        {value && failedPreviewValue !== value ? (
          <img
            src={value}
            alt={`${label}预览`}
            className="size-full object-contain"
            onError={() => setFailedPreviewValue(value)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8" aria-hidden="true" />
            <span className="text-sm">{value ? '图片无法加载' : '暂无图片'}</span>
          </div>
        )}
      </div>
      <div className="flex w-full max-w-80 gap-2">
        <Input
          id={id}
          className="min-w-0 flex-1"
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          placeholder="图片路径或上传图片"
        />
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="sr-only"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {isUploading ? '上传中' : '上传'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">支持 JPG、PNG、GIF、WebP，最大 1MB</p>
    </div>
  )
}
