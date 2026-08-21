// src/lib/flagRules.ts
// Shared types, per-rule-type metadata, and a live hook.

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

export type RuleType =
  | 'late_arrival'
  | 'no_show'
  | 'low_attendance'
  | 'early_departure'
  | 'weekly_hours_shortfall'
  | 'monitoring_gap'
  | 'custom'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface FlagRule {
  id: string
  org_id: string | null
  rule_name: string
  rule_key: string | null
  rule_type: RuleType
  description: string | null
  is_active: boolean
  is_system: boolean
  sort_order: number
  threshold_minutes: number | null
  threshold_percent: number | null
  threshold_days: number | null
  threshold_meters: number | null
  threshold_hours: number | null
  severity: Severity
  applies_to_roles: string[] | null
  applies_to_departments: string[] | null
  notify_roles: string[] | null
  auto_notify: boolean
  grace_period_days: number
  params: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ThresholdField =
  | 'threshold_minutes'
  | 'threshold_percent'
  | 'threshold_days'
  | 'threshold_meters'
  | 'threshold_hours'

interface FieldSpec {
  key: ThresholdField
  label: string
  help?: string
  min?: number
  max?: number
}

interface RuleMeta {
  label: string
  blurb: string
  fields: FieldSpec[]
  /** One line shown on the rule card. */
  describe: (r: FlagRule) => string
}

export const ALL_ROLES = [
  'super_admin',
  'ceo',
  'general_manager',
  'medical_director',
  'hr',
  'department_head',
  'coordinator',
  'physician',
  'nurse',
  'pharmacist',
  'staff',
] as const

export const roleLabel = (role: string) =>
  role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const hrs = (m: number | null) =>
  m == null ? '—' : m % 60 === 0 ? `${m / 60} hr` : `${Math.floor(m / 60)} hr ${m % 60} min`

export const RULE_META: Record<RuleType, RuleMeta> = {
  late_arrival: {
    label: 'Late arrival',
    blurb: 'How much lateness is tolerated before a clock-in counts as late.',
    fields: [
      { key: 'threshold_minutes', label: 'Grace period (minutes)', min: 0, max: 240,
        help: 'Counted from the scheduled shift start.' },
    ],
    describe: (r) => `Grace period ${r.threshold_minutes ?? 0} min after shift start`,
  },
  no_show: {
    label: 'No show',
    blurb: 'How long a scheduled shift can run with no clock-in before it is treated as a no show.',
    fields: [
      { key: 'threshold_minutes', label: 'Trigger after (minutes)', min: 15, max: 720,
        help: 'Counted from the scheduled shift start.' },
    ],
    describe: (r) => `No clock-in ${hrs(r.threshold_minutes)} after shift start`,
  },
  low_attendance: {
    label: 'Low attendance',
    blurb: 'The attendance floor, measured over a rolling window.',
    fields: [
      { key: 'threshold_percent', label: 'Minimum attendance (%)', min: 1, max: 100 },
      { key: 'threshold_days', label: 'Rolling window (days)', min: 7, max: 365 },
    ],
    describe: (r) => `Below ${r.threshold_percent ?? 0}% over ${r.threshold_days ?? 0} days`,
  },
  early_departure: {
    label: 'Early departure',
    blurb: 'How early a clock-out may be before the scheduled shift end.',
    fields: [
      { key: 'threshold_minutes', label: 'Allowed margin (minutes)', min: 0, max: 240 },
    ],
    describe: (r) => `Clock-out more than ${r.threshold_minutes ?? 0} min early`,
  },
  weekly_hours_shortfall: {
    label: 'Weekly hours shortfall',
    blurb: 'The minimum verified on-site hours per week.',
    fields: [
      { key: 'threshold_hours', label: 'Minimum hours per week', min: 1, max: 84,
        help: 'Ethiopian labour law sets 48 hours.' },
    ],
    describe: (r) => `Under ${r.threshold_hours ?? 0} verified hours in a week`,
  },
  monitoring_gap: {
    label: 'Monitoring gap',
    blurb: 'How long a phone can go unreachable during a shift before it is flagged.',
    fields: [
      { key: 'threshold_minutes', label: 'Silence threshold (minutes)', min: 5, max: 240,
        help: 'Longest gap allowed between heartbeat pings while clocked in.' },
    ],
    describe: (r) => `Phone unreachable for ${r.threshold_minutes ?? 0} min while on shift`,
  },
  custom: {
    label: 'Custom rule',
    blurb: 'A rule you define. Detection for custom rules is wired up per rule.',
    fields: [
      { key: 'threshold_minutes', label: 'Threshold (minutes)', min: 0 },
      { key: 'threshold_percent', label: 'Threshold (%)', min: 0, max: 100 },
      { key: 'threshold_days', label: 'Threshold (days)', min: 0 },
      { key: 'threshold_meters', label: 'Threshold (metres)', min: 0 },
      { key: 'threshold_hours', label: 'Threshold (hours)', min: 0 },
    ],
    describe: (r) => r.description?.split('.')[0] || 'Custom threshold',
  },
}

export const SEVERITY_STYLES: Record<Severity, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
}

/**
 * Picks the rule that governs a given staff member for a rule type.
 * A rule scoped to the person's role or department beats an unscoped one,
 * so you can hold nurses to a tighter grace period than administration.
 */
export function resolveRule(
  rules: FlagRule[],
  type: RuleType,
  person?: { role?: string | null; department_id?: string | null }
): FlagRule | undefined {
  const candidates = rules.filter((r) => r.rule_type === type && r.is_active)
  if (!candidates.length) return undefined
  const scored = candidates.map((r) => {
    const roles = r.applies_to_roles ?? []
    const depts = r.applies_to_departments ?? []
    let score = 0
    if (roles.length) {
      if (!person?.role || !roles.includes(person.role)) return { r, score: -1 }
      score += 2
    }
    if (depts.length) {
      if (!person?.department_id || !depts.includes(person.department_id)) return { r, score: -1 }
      score += 1
    }
    return { r, score }
  })
  return scored.filter((s) => s.score >= 0).sort((a, b) => b.score - a.score)[0]?.r
}

/** True while a staff member is still inside their onboarding grace period. */
export function inGracePeriod(rule: FlagRule, startedAt?: string | null): boolean {
  if (!rule.grace_period_days || !startedAt) return false
  const days = (Date.now() - new Date(startedAt).getTime()) / 86_400_000
  return days < rule.grace_period_days
}

/** Loads flag rules and keeps them in sync with edits made elsewhere. */
export function useFlagRules() {
  const [rules, setRules] = useState<FlagRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('flag_rules')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) setError(error.message)
    else {
      setRules((data ?? []) as FlagRule[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('flag_rules_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flag_rules' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  return { rules, loading, error, reload: load }
}
