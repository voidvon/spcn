import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi } from '@/api/products'
import { productCategoriesApi } from '@/api/product-categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import RichTextEditor from '@/components/RichTextEditor'
import ImageUploadField from '@/components/ImageUploadField'
import { toast } from 'sonner'
import type { Product } from '@/types'

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product
  mode: 'create' | 'edit'
}

export default function ProductFormDialog({ open, onOpenChange, product, mode }: ProductFormDialogProps) {
  const queryClient = useQueryClient()
  const {
    data: categoriesData,
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useQuery({
    queryKey: ['product-categories-options'],
    queryFn: () => productCategoriesApi.listOptions(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category_id: 0,
    summary: '',
    content_html: '',
    small_image: '',
    large_image: '',
    keywords: '',
    is_featured_home: 0,
    is_visible: 1,
    sort_order: 0,
  })

  useEffect(() => {
    if (product && mode === 'edit') {
      setFormData({
        name: product.name || '',
        code: product.code || '',
        category_id: product.category_id || 0,
        summary: product.summary || '',
        content_html: product.content_html || '',
        small_image: product.small_image || '',
        large_image: product.large_image || '',
        keywords: product.keywords || '',
        is_featured_home: product.is_featured_home || 0,
        is_visible: product.is_visible || 1,
        sort_order: product.sort_order || 0,
      })
    } else if (mode === 'create') {
      setFormData({
        name: '',
        code: '',
        category_id: 0,
        summary: '',
        content_html: '',
        small_image: '',
        large_image: '',
        keywords: '',
        is_featured_home: 0,
        is_visible: 1,
        sort_order: 0,
      })
    }
  }, [product, mode])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return productsApi.create(formData)
      } else {
        return productsApi.update(product!.id, formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('请输入产品名称')
      return
    }
    if (!formData.category_id) {
      toast.error('请选择产品分类')
      return
    }
    mutation.mutate()
  }

  const categoryOptions = categoriesData?.data || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:w-4/5 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加产品' : '编辑产品'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写产品信息' : '修改产品信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">产品名称 *</Label>
              <Input
                id="name"
                className="w-auto"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入产品名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">产品编号</Label>
              <Input
                id="code"
                className="w-auto"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="请输入产品编号"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <div className="space-y-2">
              <Label htmlFor="category_id">产品分类 *</Label>
              <Select
                value={formData.category_id ? formData.category_id.toString() : undefined}
                disabled={categoriesLoading || categoriesError || categoryOptions.length === 0}
                onValueChange={(value) => setFormData({ ...formData, category_id: parseInt(value ?? '0', 10) })}
              >
                <SelectTrigger id="category_id">
                  <SelectValue placeholder="请选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      <span style={{ paddingLeft: `${(category.depth || 0) * 12}px` }}>
                        {category.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoriesLoading && <p className="text-xs text-muted-foreground">正在加载分类...</p>}
              {categoriesError && <p className="text-xs text-destructive">分类加载失败，请稍后重试</p>}
              {!categoriesLoading && !categoriesError && categoryOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无可用分类</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_visible">显示状态</Label>
              <Select
                value={formData.is_visible.toString()}
                onValueChange={(value) => setFormData({ ...formData, is_visible: parseInt(value ?? '0', 10) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">显示</SelectItem>
                  <SelectItem value="0">隐藏</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_featured_home">推荐</Label>
              <Select
                value={formData.is_featured_home.toString()}
                onValueChange={(value) => setFormData({ ...formData, is_featured_home: parseInt(value ?? '0', 10) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">是</SelectItem>
                  <SelectItem value="0">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">排序</Label>
              <Input
                id="sort_order"
                className="w-auto"
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">摘要</Label>
            <Textarea
              id="summary"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              placeholder="请输入摘要"
              rows={3}
            />
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <ImageUploadField
              id="small_image"
              label="小图"
              value={formData.small_image}
              onChange={(small_image) => setFormData((previous) => ({ ...previous, small_image }))}
            />
            <ImageUploadField
              id="large_image"
              label="大图"
              value={formData.large_image}
              onChange={(large_image) => setFormData((previous) => ({ ...previous, large_image }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">关键词</Label>
            <Input
              id="keywords"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              placeholder="请输入关键词"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content_html">详细内容</Label>
            <RichTextEditor
              value={formData.content_html}
              onChange={(content_html) => setFormData((previous) => ({ ...previous, content_html }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '提交中...' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
