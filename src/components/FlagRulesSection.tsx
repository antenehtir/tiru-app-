// src/components/FlagRulesSection.tsx
// Super Admin only. Rendered at the bottom of Admin.tsx.

import { useState } from 'react'
import {
  AlertTriangle, Pencil, Plus, Trash2, X, Check, Loader2, Info,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import {
  ALL_ROLES, RULE_META, SEVERITY_STYLES, roleLabel, useFlagRules,
  type FlagRule, type RuleType, type Severity,
} from '../lib/flagRules'

const RULE_TYPE_OPTIONS = Object.keys(RULE_META) as RuleType[]
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical']

interface Props {
  orgId?: string | null
}

export default function FlagRulesSection({ orgId }: Props) {
  const { rules, loading, error, reload } = useFlagRules()
  const [editing, setEditing] = useState<Partial<FlagRule> | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function toggleActive(rule: FlagRule) {
    setBusyId(rule.id)
    await supabase.from('flag_rules').update({ is_active: !rule.is_active }).eq('id', rule.id)
    setBusyId(null)
    reload()
  }

  async function remove(rule: FlagRule) {
    if (!window.confirm(`Delete "${rule.rule_name}"? Flagging will stop using this rule.`)) return
    setBusyId(rule.id)
    await supabase.from('flag_rules').delete().eq('id', rule.id)
    setBusyId(null)
    reload()
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-teal-50 p-2 text-teal-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Flag rules</h2>
            <p className="text-sm text-slate-500">
              Set the thresholds the Flags page uses. Changes apply to new flagging immediately.
            </p>
          </div>
        </div>
        <button
          onClick={() =>
            setEditing({
              org_id: orgId ?? null,
              rule_name: '',
              rule_type: 'custom',
              description: '',
              is_active: true,
              is_system: false,
              severity: 'medium',
              notify_roles: ['super_admin'],
              applies_to_roles: [],
              grace_period_days: 0,
              sort_order: 100,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Add rule
        </button>
      </header>

      {loading && (
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Rules could not be loaded: {error}. Refresh the page, and check that the flag_rules table exists.
        </p>
      )}

      {!loading && !error && rules.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No rules defined yet. Add the first one to start flagging.
        </p>
      )}

      <div className="mt-5 grid gap-3">
        {rules.map((rule) => {
          const meta = RULE_META[rule.rule_type]
          return (
            <article
              key={rule.id}
              className={`rounded-lg border p-4 transition ${
                rule.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{rule.rule_name}</h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                        SEVERITY_STYLES[rule.severity]
                      }`}
                    >
                      {rule.severity}
                    </span>
                    {!rule.is_active && (
                      <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-500">
                        Off
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{rule.description || meta?.blurb}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {meta ? meta.describe(rule) : '—'}
                    {rule.grace_period_days > 0 && (
                      <span className="font-normal text-slate-500">
                        {' '}· new staff exempt for {rule.grace_period_days} days
                      </span>
                    )}
                  </p>
                  {!!rule.applies_to_roles?.length && (
                    <p className="mt-1 text-xs text-slate-500">
                      Applies to: {rule.applies_to_roles.map(roleLabel).join(', ')}
                    </p>
                  )}
                  {!!rule.notify_roles?.length && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Notifies: {rule.notify_roles.map(roleLabel).join(', ')}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => toggleActive(rule)}
                    disabled={busyId === rule.id}
                    role="switch"
                    aria-checked={rule.is_active}
                    aria-label={`${rule.is_active ? 'Turn off' : 'Turn on'} ${rule.rule_name}`}
                    className={`relative h-6 w-11 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
                      rule.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        rule.is_active ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => setEditing(rule)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  {!rule.is_system && (
                    <button
                      onClick={() => remove(rule)}
                      aria-label={`Delete ${rule.rule_name}`}
                      className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Rules scoped to a role or department take precedence over unscoped rules of the same type.
        Turning a rule off stops new flags; flags already raised stay in the record.
      </p>

      {editing && (
        <RuleEditor
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </section>
  )
}

// ------------------------------------------------------------------
// Editor modal
// ------------------------------------------------------------------

function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule: Partial<FlagRule>
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Partial<FlagRule>>(rule)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const meta = RULE_META[(draft.rule_type ?? 'custom') as RuleType]
  const isNew = !draft.id
  const set = <K extends keyof FlagRule>(key: K, value: FlagRule[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const toggleInList = (key: 'notify_roles' | 'applies_to_roles', role: string) => {
    const current = (draft[key] as string[] | null) ?? []
    set(key, (current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role]) as never)
  }

  async function save() {
    if (!draft.rule_name?.trim()) {
      setProblem('Give the rule a name so it can be recognised on the Flags page.')
      return
    }
    const missing = meta.fields.find(
      (f) => draft.rule_type !== 'custom' && (draft[f.key] == null || draft[f.key] === ('' as never))
    )
    if (missing) {
      setProblem(`${missing.label} is needed before this rule can flag anything.`)
      return
    }

    setSaving(true)
    setProblem(null)
    const payload = {
      org_id: draft.org_id ?? null,
      rule_name: draft.rule_name.trim(),
      rule_type: draft.rule_type,
      description: draft.description ?? null,
      is_active: draft.is_active ?? true,
      severity: draft.severity ?? 'medium',
      threshold_minutes: draft.threshold_minutes ?? null,
      threshold_percent: draft.threshold_percent ?? null,
      threshold_days: draft.threshold_days ?? null,
      threshold_meters: draft.threshold_meters ?? null,
      threshold_hours: draft.threshold_hours ?? null,
      applies_to_roles: draft.applies_to_roles ?? [],
      notify_roles: draft.notify_roles ?? [],
      auto_notify: draft.auto_notify ?? false,
      grace_period_days: draft.grace_period_days ?? 0,
      sort_order: draft.sort_order ?? 100,
    }

    const { error } = isNew
      ? await supabase.from('flag_rules').insert(payload)
      : await supabase.from('flag_rules').update(payload).eq('id', draft.id!)

    setSaving(false)
    if (error) setProblem(`Save failed: ${error.message}`)
    else onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-slate-900">
            {isNew ? 'Add rule' : `Edit ${rule.rule_name}`}
          </h3>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="Rule name">
            <input
              value={draft.rule_name ?? ''}
              onChange={(e) => set('rule_name', e.target.value)}
              className={inputClass}
              placeholder="Late arrival"
            />
          </Field>

          <Field label="What it flags" help={meta.blurb}>
            <textarea
              value={draft.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Shown to leadership on the Flags page."
            />
          </Field>

          {isNew && (
            <Field label="Rule type">
              <select
                value={draft.rule_type}
                onChange={(e) => set('rule_type', e.target.value as RuleType)}
                className={inputClass}
              >
                {RULE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {RULE_META[t].label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {meta.fields.map((f) => (
            <Field key={f.key} label={f.label} help={f.help}>
              <input
                type="number"
                min={f.min}
                max={f.max}
                value={(draft[f.key] as number | null) ?? ''}
                onChange={(e) =>
                  set(f.key, (e.target.value === '' ? null : Number(e.target.value)) as never)
                }
                className={inputClass}
              />
              {f.key === 'threshold_minutes' && draft.threshold_minutes != null && draft.threshold_minutes >= 60 && (
                <p className="mt-1 text-xs text-slate-500">
                  That is {(draft.threshold_minutes / 60).toFixed(1).replace('.0', '')} hours.
                </p>
              )}
            </Field>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity">
              <select
                value={draft.severity ?? 'medium'}
                onChange={(e) => set('severity', e.target.value as Severity)}
                className={inputClass}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="New-staff grace (days)" help="0 applies the rule from day one.">
              <input
                type="number"
                min={0}
                max={180}
                value={draft.grace_period_days ?? 0}
                onChange={(e) => set('grace_period_days', Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Applies to" help="Leave all unchecked to apply to every staff member.">
            <RoleChecklist
              selected={draft.applies_to_roles ?? []}
              onToggle={(r) => toggleInList('applies_to_roles', r)}
            />
          </Field>

          <Field label="Notify">
            <RoleChecklist
              selected={draft.notify_roles ?? []}
              onToggle={(r) => toggleInList('notify_roles', r)}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.is_active ?? true}
              onChange={(e) => set('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600"
            />
            Rule is on
          </label>

          {problem && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{problem}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
    </div>
  )
}

function RoleChecklist({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (role: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-2">
      {ALL_ROLES.map((role) => (
        <label key={role} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={selected.includes(role)}
            onChange={() => onToggle(role)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600"
          />
          {roleLabel(role)}
        </label>
      ))}
    </div>
  )
}
