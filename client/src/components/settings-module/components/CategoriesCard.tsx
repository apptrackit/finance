import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../common/button'
import { Input } from '../../common/input'
import { Modal } from '../../common/modal'
import { API_BASE_URL, apiFetch } from '../../../config'
import { useAlert } from '../../../context/AlertContext'
import { useUnsavedChanges } from '../../../navigation/UnsavedChanges'
import { EMOJI_OPTIONS } from '../constants'
import type { Category } from '../types'
import { useSettingsMobile } from '../useSettingsMobile'
import { EmojiPicker } from './EmojiPicker'

type CategoryType = Category['type']
type Draft = { id?: string; name: string; icon: string; type: CategoryType }
const emptyDraft = (type: CategoryType): Draft => ({ name: '', icon: '📌', type })

export function CategoriesCard({
  onCountChange,
  active = true
}: {
  onCountChange?: (count: number) => void
  active?: boolean
}) {
  const { showAlert } = useAlert()
  const alertRef = useRef(showAlert)
  useEffect(() => {
    alertRef.current = showAlert
  }, [showAlert])
  const mobile = useSettingsMobile()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<CategoryType>('expense')
  const [newDraft, setNewDraft] = useState<Draft>(() => emptyDraft('expense'))
  const [editDraft, setEditDraft] = useState<Draft | null>(null)
  const [mobileAdding, setMobileAdding] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<'new' | 'edit' | null>(null)
  useUnsavedChanges(newDraft.name !== '' || !!editDraft || mobileAdding || busy)

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setLoadError(false)
      try {
        const res = await apiFetch(`${API_BASE_URL}/categories`, { signal, throwOnError: true })
        const data = (await res.json()) as Category[]
        if (!signal.aborted) {
          setCategories(data)
          onCountChange?.(data.length)
        }
      } catch (error) {
        if (!signal.aborted) {
          setLoadError(true)
          alertRef.current({
            type: 'error',
            title: 'Categories unavailable',
            message: error instanceof Error ? error.message : 'Could not load categories.'
          })
        }
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [onCountChange]
  )
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  useEffect(() => {
    if (!loading && !loadError) onCountChange?.(categories.length)
  }, [categories.length, onCountChange, loading, loadError])

  const save = async (draft: Draft) => {
    if (busy || !draft.name.trim()) return
    setBusy(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/categories${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), icon: draft.icon, type: draft.type })
      })
      const saved = (await res.json()) as Category
      setCategories((previous) =>
        draft.id ? previous.map((c) => (c.id === draft.id ? saved : c)) : [...previous, saved]
      )
      setTab(saved.type)
      if (draft.id) setEditDraft(null)
      else {
        setNewDraft(emptyDraft(saved.type))
        setMobileAdding(false)
      }
      setPicker(null)
      showAlert({
        type: 'success',
        title: draft.id ? 'Category Updated' : 'Category Added',
        message: `“${saved.name}” has been saved.`
      })
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Category not saved',
        message: error instanceof Error ? error.message : 'Please try again.'
      })
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!deleting || busy) return
    setBusy(true)
    try {
      await apiFetch(`${API_BASE_URL}/categories/${deleting.id}`, { method: 'DELETE' })
      setCategories((previous) => previous.filter((c) => c.id !== deleting.id))
      setDeleting(null)
      setEditDraft(null)
      showAlert({
        type: 'success',
        title: 'Category Deleted',
        message: `“${deleting.name}” has been removed.`
      })
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Category not deleted',
        message: error instanceof Error ? error.message : 'Please try again.'
      })
    } finally {
      setBusy(false)
    }
  }
  const startEdit = (category: Category) => {
    setEditDraft({ ...category, icon: category.icon || '📌' })
    setDeleting(null)
    setPicker(null)
  }
  const cancelEdit = () => {
    if (!busy) {
      setEditDraft(null)
      setMobileAdding(false)
      setDeleting(null)
      setPicker(null)
    }
  }
  const switchTab = (type: CategoryType) => {
    if (busy || editDraft) return
    setTab(type)
    setNewDraft((previous) => ({ ...previous, type }))
    setPicker(null)
    setDeleting(null)
  }
  const renderForm = (draft: Draft, editing: boolean, inSheet = false) => {
    const update = (next: Draft) => (editing ? setEditDraft(next) : setNewDraft(next))
    const pickerId = editing ? 'edit' : 'new'
    return (
      <form
        className="settings-category-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save(draft)
        }}
      >
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Choose category icon"
            disabled={busy}
            aria-expanded={picker === pickerId}
            onClick={() => setPicker(picker === pickerId ? null : pickerId)}
            className="text-xl"
          >
            {draft.icon}
          </Button>
          {!inSheet && picker === pickerId && (
            <EmojiPicker onChange={(icon) => update({ ...draft, icon })} onClose={() => setPicker(null)} />
          )}
        </div>
        <Input
          aria-label={editing ? 'Category name' : 'New category name'}
          placeholder={`New ${draft.type} category`}
          value={draft.name}
          disabled={busy || loading || loadError}
          onChange={(event) => update({ ...draft, name: event.target.value })}
        />
        {(editing || inSheet) && (
          <div className="settings-segments" role="group" aria-label="Category type">
            {(['expense', 'income'] as const).map((type) => (
              <button
                key={type}
                type="button"
                disabled={busy}
                aria-pressed={draft.type === type}
                onClick={() => update({ ...draft, type })}
                className="capitalize"
              >
                {type}
              </button>
            ))}
          </div>
        )}
        {inSheet && (
          <div className="grid grid-cols-8 gap-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border p-2">
            {EMOJI_OPTIONS.map((icon, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Use ${icon}`}
                aria-pressed={draft.icon === icon}
                disabled={busy}
                onClick={() => update({ ...draft, icon })}
                className={`h-10 rounded-lg text-xl hover:bg-accent ${draft.icon === icon ? 'bg-accent' : ''}`}
              >
                {icon}
              </button>
            ))}
          </div>
        )}
        <div className="settings-form-actions">
          {editing && !inSheet && (
            <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy || loading || loadError || !draft.name.trim()}>
            {!editing && !inSheet && <Plus className="h-4 w-4" />}
            {busy ? 'Saving...' : editing || inSheet ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    )
  }
  const deleteConfirmation = deleting && (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/5 p-3"
      role="group"
      aria-label={`Delete ${deleting.name}?`}
    >
      <p className="min-w-0 flex-1 text-sm">Delete “{deleting.name}”? This can’t be undone.</p>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => setDeleting(null)}>
        Cancel
      </Button>
      <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
        {busy ? 'Deleting...' : 'Delete'}
      </Button>
    </div>
  )

  return (
    <section aria-label="Categories">
      <div className="settings-category-heading">
        <div>
          <h2>Categories</h2>
          <p className="settings-description">Income and expense categories for your transactions.</p>
        </div>
        <Button
          className="settings-category-mobile"
          variant="ghost"
          size="icon"
          aria-label="Add category"
          disabled={busy || loading || loadError}
          onClick={() => {
            setMobileAdding(true)
            setEditDraft(null)
            setDeleting(null)
          }}
        >
          <Plus className="h-5 w-5" />
        </Button>
        <div className="settings-segments" role="group" aria-label="Category filter">
          {(['expense', 'income'] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={tab === type}
              disabled={busy || !!editDraft}
              onClick={() => switchTab(type)}
            >
              <span className="capitalize">{type}</span>{' '}
              <span className="opacity-60 tabular-nums">
                {categories.filter((c) => c.type === type).length}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-group" aria-busy={loading || busy}>
        <div className="settings-category-add">{renderForm(newDraft, false)}</div>
        {loading ? (
          <p className="settings-category-status" role="status">
            Loading categories...
          </p>
        ) : loadError ? (
          <div className="settings-category-status">
            <p>Could not load categories.</p>
            <Button variant="outline" size="sm" onClick={() => void load(new AbortController().signal)}>
              Retry
            </Button>
          </div>
        ) : categories.filter((c) => c.type === tab).length === 0 ? (
          <p className="settings-category-status">No {tab} categories yet</p>
        ) : (
          categories
            .filter((c) => c.type === tab)
            .map((category) => (
              <div key={category.id} className="settings-category-row">
                {!mobile && editDraft?.id === category.id ? (
                  renderForm(editDraft, true)
                ) : !mobile && deleting?.id === category.id ? (
                  deleteConfirmation
                ) : (
                  <>
                    <span className="settings-category-icon">{category.icon || '📌'}</span>
                    <span className="settings-category-name">{category.name}</span>
                    {!mobile && (
                      <div className="settings-category-actions">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${category.name}`}
                          disabled={busy || !!editDraft}
                          onClick={() => startEdit(category)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${category.name}`}
                          disabled={busy || !!editDraft}
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {mobile && (
                      <Button
                        className="settings-category-mobile"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${category.name}`}
                        disabled={busy}
                        onClick={() => startEdit(category)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))
        )}
      </div>
      {mobile && active && (mobileAdding || editDraft) && (
        <Modal
          isOpen
          onClose={cancelEdit}
          title={deleting ? 'Delete category?' : editDraft ? 'Edit category' : 'New category'}
          initialFocus="input"
        >
          {deleting ? (
            deleteConfirmation
          ) : (
            <>
              <div className="mb-4 flex justify-end">
                {editDraft && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => setDeleting({ ...editDraft, id: editDraft.id! })}
                  >
                    Delete
                  </Button>
                )}
              </div>
              {renderForm(editDraft || newDraft, !!editDraft, true)}
            </>
          )}
        </Modal>
      )}
    </section>
  )
}
