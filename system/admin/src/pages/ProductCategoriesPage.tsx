import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { productCategoriesApi } from '@/api/product-categories'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { ProductCategory } from '@/types'

type CategoryForm = Pick<
  ProductCategory,
  'name' | 'parent_id' | 'sort_order' | 'seo_keywords' | 'seo_description'
>

interface CategoryNode extends ProductCategory {
  children: CategoryNode[]
}

const EMPTY_FORM: CategoryForm = {
  name: '',
  parent_id: 0,
  sort_order: 0,
  seo_keywords: '',
  seo_description: '',
}

export default function ProductCategoriesPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [draftParentId, setDraftParentId] = useState<number | null>(null)
  const [formData, setFormData] = useState<CategoryForm>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null)
  const savedFormRef = useRef<CategoryForm>(EMPTY_FORM)
  const formDirtyRef = useRef(false)
  const selectedIdRef = useRef<number | null>(null)
  const initializedTreeRef = useRef(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-categories-options'],
    queryFn: () => productCategoriesApi.listOptions(),
  })
  const categories = useMemo(() => data?.data || [], [data])
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories])
  const selectedCategory = categories.find((category) => category.id === selectedId) || null

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    if (!selectedCategory) return
    const nextForm = toCategoryForm(selectedCategory)
    // The editor mirrors the category selected in the independently loaded tree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData(nextForm)
    savedFormRef.current = nextForm
    formDirtyRef.current = false
  }, [selectedCategory])

  useEffect(() => {
    if (selectedId !== null || categories.length === 0 || draftParentId !== null) return
    // Select the first server-provided category when the page initially loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(categories[0].id)
  }, [categories, draftParentId, selectedId])

  useEffect(() => {
    if (initializedTreeRef.current || categoryTree.length === 0) return
    initializedTreeRef.current = true
    // Root nodes start expanded after the asynchronous tree data arrives.
    setExpandedIds(new Set(categoryTree.map((category) => category.id)))
  }, [categoryTree])

  const updateMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: CategoryForm }) => {
      const response = await productCategoriesApi.update(id, value)
      if (!response.data) throw new Error('服务器未返回分类数据')
      return response.data
    },
    onSuccess: (category, variables) => {
      const saved = toCategoryForm(category)
      if (selectedIdRef.current === variables.id) {
        savedFormRef.current = saved
        setFormData(saved)
      }
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
      queryClient.invalidateQueries({ queryKey: ['product-categories-options'] })
      toast.success('分类已保存')
    },
    onError: (mutationError: unknown, variables) => {
      if (selectedIdRef.current === variables.id) {
        setFormData(savedFormRef.current)
        formDirtyRef.current = false
      }
      toast.error(getErrorMessage(mutationError, '保存失败'))
    },
  })

  const createMutation = useMutation({
    mutationFn: async (value: CategoryForm) => {
      const response = await productCategoriesApi.create(value)
      if (!response.data) throw new Error('服务器未返回分类数据')
      return response.data
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
      queryClient.invalidateQueries({ queryKey: ['product-categories-options'] })
      setDraftParentId(null)
      setSelectedId(created.id)
      setExpandedIds((current) => {
        const next = new Set(current)
        if (created.parent_id) next.add(created.parent_id)
        return next
      })
      toast.success('分类已创建')
    },
    onError: (mutationError: unknown) => {
      toast.error(getErrorMessage(mutationError, '创建失败'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productCategoriesApi.delete(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
      queryClient.invalidateQueries({ queryKey: ['product-categories-options'] })
      if (selectedId === deletedId) setSelectedId(null)
      setDeleteTarget(null)
      toast.success('分类已删除')
    },
    onError: (mutationError: unknown) => {
      toast.error(getErrorMessage(mutationError, '删除失败'))
    },
  })

  const startCreate = (parentId: number) => {
    setSelectedId(null)
    setDraftParentId(parentId)
    const nextForm = { ...EMPTY_FORM, parent_id: parentId }
    setFormData(nextForm)
    savedFormRef.current = nextForm
    formDirtyRef.current = false
    if (parentId) {
      setExpandedIds((current) => new Set(current).add(parentId))
    }
  }

  const saveCurrentForm = (nextForm = formData) => {
    if (updateMutation.isPending || createMutation.isPending) return
    if (!formDirtyRef.current) return

    const normalized = normalizeForm(nextForm)
    if (!normalized.name) {
      if (draftParentId !== null) return
      setFormData(savedFormRef.current)
      formDirtyRef.current = false
      toast.error('分类名称不能为空')
      return
    }

    formDirtyRef.current = false
    if (draftParentId !== null) {
      createMutation.mutate(normalized)
      return
    }

    if (!selectedId) return
    updateMutation.mutate({ id: selectedId, value: normalized })
  }

  const updateSelectField = (parentId: number) => {
    if (parentId === formData.parent_id) return
    const nextForm = { ...formData, parent_id: parentId }
    formDirtyRef.current = true
    setFormData(nextForm)
    saveCurrentForm(nextForm)
  }

  const updateFormField = <Key extends keyof CategoryForm>(key: Key, value: CategoryForm[Key]) => {
    formDirtyRef.current = true
    setFormData((current) => ({ ...current, [key]: value }))
  }

  const unavailableParentIds = useMemo(() => {
    const result = selectedId ? collectDescendantIds(selectedId, categories) : new Set<number>()
    if (selectedId) result.add(selectedId)
    return result
  }, [categories, selectedId])

  return (
    <div className="flex h-full min-h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row">
      <Card className="min-h-0 shrink-0 lg:w-[320px]">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>产品分类</CardTitle>
              <CardDescription>共 {categories.length} 个分类</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="新增一级分类"
              title="新增一级分类"
              onClick={() => startCreate(0)}
            >
              <Plus />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto px-2">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载中...
            </div>
          ) : error ? (
            <p className="px-2 py-4 text-sm text-destructive">分类加载失败</p>
          ) : categoryTree.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">暂无分类</p>
          ) : (
            <CategoryTree
              nodes={categoryTree}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onExpandedChange={setExpandedIds}
              onSelect={(category) => {
                setDraftParentId(null)
                setSelectedId(category.id)
              }}
              onAddChild={(category) => startCreate(category.id)}
              onDelete={setDeleteTarget}
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-h-0 min-w-0 flex-1">
        <CardHeader className="border-b">
          <CardTitle>{draftParentId !== null ? '新增产品分类' : selectedCategory?.name || '分类编辑'}</CardTitle>
          <CardDescription>
            {draftParentId !== null
              ? '填写分类名称并移开焦点后自动创建'
              : selectedCategory
                ? `分类 ID：${selectedCategory.id}，修改内容后失焦自动保存`
                : '请从左侧选择一个分类'}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          {selectedCategory || draftParentId !== null ? (
            <form className="flex max-w-3xl flex-col gap-5" onSubmit={(event) => event.preventDefault()}>
              <div className="space-y-2">
                <Label htmlFor="category-name">分类名称 *</Label>
                <Input
                  id="category-name"
                  autoFocus={draftParentId !== null}
                  value={formData.name}
                  disabled={updateMutation.isPending || createMutation.isPending}
                  onChange={(event) => updateFormField('name', event.target.value)}
                  onBlur={() => saveCurrentForm()}
                  placeholder="请输入分类名称"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-parent">父分类</Label>
                <Select value={String(formData.parent_id)} onValueChange={(value) => updateSelectField(Number(value))}>
                  <SelectTrigger id="category-parent" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">顶级分类</SelectItem>
                    {categories
                      .filter((category) => !unavailableParentIds.has(category.id))
                      .map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          <span style={{ paddingLeft: `${(category.depth || 0) * 12}px` }}>{category.name}</span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-sort">排序</Label>
                <Input
                  id="category-sort"
                  type="number"
                  value={formData.sort_order}
                  disabled={updateMutation.isPending || createMutation.isPending}
                  onChange={(event) => updateFormField('sort_order', Number(event.target.value) || 0)}
                  onBlur={() => saveCurrentForm()}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-keywords">SEO 关键词</Label>
                <Input
                  id="category-keywords"
                  value={formData.seo_keywords || ''}
                  disabled={updateMutation.isPending || createMutation.isPending}
                  onChange={(event) => updateFormField('seo_keywords', event.target.value)}
                  onBlur={() => saveCurrentForm()}
                  placeholder="请输入 SEO 关键词"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-description">SEO 描述</Label>
                <Textarea
                  id="category-description"
                  value={formData.seo_description || ''}
                  disabled={updateMutation.isPending || createMutation.isPending}
                  onChange={(event) => updateFormField('seo_description', event.target.value)}
                  onBlur={() => saveCurrentForm()}
                  placeholder="请输入 SEO 描述"
                  rows={5}
                />
              </div>

              {(updateMutation.isPending || createMutation.isPending) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在保存...
                </div>
              )}
            </form>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <FolderTree className="size-8" />
              请选择左侧分类
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除分类</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？此操作无法撤销；如果分类下有子分类或产品，删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? '删除中...' : '确定删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CategoryTree({
  nodes,
  selectedId,
  expandedIds,
  onExpandedChange,
  onSelect,
  onAddChild,
  onDelete,
  depth = 0,
}: {
  nodes: CategoryNode[]
  selectedId: number | null
  expandedIds: Set<number>
  onExpandedChange: (ids: Set<number>) => void
  onSelect: (category: ProductCategory) => void
  onAddChild: (category: ProductCategory) => void
  onDelete: (category: ProductCategory) => void
  depth?: number
}) {
  return nodes.map((node) => {
    const expanded = expandedIds.has(node.id)
    const hasChildren = node.children.length > 0

    return (
      <div key={node.id}>
        <div
          className={cn(
            'group flex min-h-9 items-center rounded-md pr-1 text-sm hover:bg-muted',
            selectedId === node.id && 'bg-muted font-medium text-foreground',
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn('mr-0.5 shrink-0', !hasChildren && 'invisible')}
            aria-label={expanded ? '收起子分类' : '展开子分类'}
            onClick={() => {
              const next = new Set(expandedIds)
              if (expanded) next.delete(node.id)
              else next.add(node.id)
              onExpandedChange(next)
            }}
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
          <button
            type="button"
            className="min-w-0 flex-1 truncate py-2 text-left"
            onClick={() => onSelect(node)}
            title={node.name}
          >
            {node.name}
          </button>
          <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`在${node.name}下新增子分类`}
              title="新增子分类"
              onClick={() => onAddChild(node)}
            >
              <Plus />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:text-destructive"
              aria-label={`删除${node.name}`}
              title="删除分类"
              onClick={() => onDelete(node)}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        {hasChildren && expanded ? (
          <CategoryTree
            nodes={node.children}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onExpandedChange={onExpandedChange}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onDelete={onDelete}
            depth={depth + 1}
          />
        ) : null}
      </div>
    )
  })
}

function buildCategoryTree(categories: ProductCategory[]) {
  const nodes = new Map<number, CategoryNode>()
  const roots: CategoryNode[] = []
  categories.forEach((category) => nodes.set(category.id, { ...category, children: [] }))
  nodes.forEach((node) => {
    const parent = nodes.get(node.parent_id)
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  sortTree(roots)
  return roots
}

function sortTree(nodes: CategoryNode[]) {
  nodes.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  nodes.forEach((node) => sortTree(node.children))
}

function collectDescendantIds(id: number, categories: ProductCategory[]) {
  const children = new Map<number, number[]>()
  categories.forEach((category) => {
    const siblings = children.get(category.parent_id) || []
    siblings.push(category.id)
    children.set(category.parent_id, siblings)
  })
  const result = new Set<number>()
  const visit = (parentId: number) => {
    for (const childId of children.get(parentId) || []) {
      result.add(childId)
      visit(childId)
    }
  }
  visit(id)
  return result
}

function toCategoryForm(category: ProductCategory): CategoryForm {
  return {
    name: category.name || '',
    parent_id: category.parent_id || 0,
    sort_order: category.sort_order || 0,
    seo_keywords: category.seo_keywords || '',
    seo_description: category.seo_description || '',
  }
}

function normalizeForm(form: CategoryForm): CategoryForm {
  return {
    ...form,
    name: form.name.trim(),
    seo_keywords: form.seo_keywords?.trim() || '',
    seo_description: form.seo_description?.trim() || '',
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const candidate = error as { message?: string; response?: { data?: { message?: string } } }
  return candidate.response?.data?.message || candidate.message || fallback
}
