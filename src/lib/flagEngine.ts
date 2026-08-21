// src/lib/flagEngine.ts
// Pure functions: given shifts, attendance logs and the configured rules,
// return the flags. No Supabase calls here, so it stays easy to reason about
// and to move server-side later.

import { inGracePeriod, resolveRule, type FlagRule, type RuleType, type Severity } from './flagRules'

export interface StaffLite {
  id: string
  full_name: string
  role: string | null
  department_id: string | null
  department_name?: string | null
  started_at?: string | null
  is_active?: boolean
}

export interface ShiftLite {
  id: string
  user_id: string
  starts_at: string
  ends_at: string
  department_id: string | null
  status?: string | null
}

export interface AttendanceLite {
  id: string
  user_id: string
  attendance_type: 'clock_in' | 'clock_out'
  scanned_at: string
  within_geofence: boolean | null
  distance_m?: number | null
}

export interface HeartbeatLite {
  id: string
  user_id: string
  pinged_at: string
}

export interface Flag {
  key: string
  rule_id: string
  rule_name: string
  rule_type: RuleType
  severity: Severity
  user_id: string
  staff_name: string
  role: string | null
  department_id: string | null
  occurred_at: string
  detail: string
}

const MIN = 60_000
const t = (iso: string) => new Date(iso).getTime()
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()

/**
 * Runs every active rule over the window.
 * `now` is injectable so the Flags page can be tested against fixed times.
 */
export function detectFlags(input: {
  rules: FlagRule[]
  staff: StaffLite[]
  shifts: ShiftLite[]
  logs: AttendanceLite[]
  heartbeats: HeartbeatLite[]
  now?: Date
}): Flag[] {
  const { rules, staff, shifts, logs, heartbeats } = input
  const now = input.now ?? new Date()
  const byId = new Map(staff.map((s) => [s.id, s]))
  const flags: Flag[] = []

  const push = (rule: FlagRule, person: StaffLite, occurred_at: string, detail: string, key: string) => {
    if (inGracePeriod(rule, person.started_at)) return
    flags.push({
      key,
      rule_id: rule.id,
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      severity: rule.severity,
      user_id: person.id,
      staff_name: person.full_name,
      role: person.role,
      department_id: person.department_id,
      occurred_at,
      detail,
    })
  }

  const firstClockIn = (userId: string, dayIso: string) =>
    logs
      .filter((l) => l.user_id === userId && l.attendance_type === 'clock_in' && sameDay(l.scanned_at, dayIso))
      .sort((a, b) => t(a.scanned_at) - t(b.scanned_at))[0]

  const lastClockOut = (userId: string, dayIso: string) =>
    logs
      .filter((l) => l.user_id === userId && l.attendance_type === 'clock_out' && sameDay(l.scanned_at, dayIso))
      .sort((a, b) => t(b.scanned_at) - t(a.scanned_at))[0]

  // --- shift-anchored rules -------------------------------------------
  for (const shift of shifts) {
    const person = byId.get(shift.user_id)
    if (!person || person.is_active === false) continue

    const start = t(shift.starts_at)
    const end = t(shift.ends_at)
    const inLog = firstClockIn(person.id, shift.starts_at)
    const outLog = lastClockOut(person.id, shift.ends_at)

    const late = resolveRule(rules, 'late_arrival', person)
    if (late && inLog) {
      const lateBy = Math.round((t(inLog.scanned_at) - start) / MIN)
      if (lateBy > (late.threshold_minutes ?? 0)) {
        push(late, person, inLog.scanned_at, `Clocked in ${lateBy} min after shift start`, `late:${shift.id}`)
      }
    }

    const noShow = resolveRule(rules, 'no_show', person)
    if (noShow && !inLog) {
      const cutoff = start + (noShow.threshold_minutes ?? 120) * MIN
      if (now.getTime() > cutoff) {
        push(noShow, person, shift.starts_at, 'Scheduled shift with no clock-in', `noshow:${shift.id}`)
      }
    }

    const early = resolveRule(rules, 'early_departure', person)
    if (early && outLog) {
      const earlyBy = Math.round((end - t(outLog.scanned_at)) / MIN)
      if (earlyBy > (early.threshold_minutes ?? 0)) {
        push(early, person, outLog.scanned_at, `Clocked out ${earlyBy} min before shift end`, `early:${shift.id}`)
      }
    }
  }

  // --- person-anchored rules ------------------------------------------
  for (const person of staff) {
    if (person.is_active === false) continue

    const low = resolveRule(rules, 'low_attendance', person)
    if (low) {
      const windowStart = now.getTime() - (low.threshold_days ?? 30) * 24 * 60 * MIN
      const due = shifts.filter(
        (s) => s.user_id === person.id && t(s.starts_at) >= windowStart && t(s.starts_at) <= now.getTime()
      )
      if (due.length) {
        const attended = due.filter((s) => !!firstClockIn(person.id, s.starts_at)).length
        const pct = Math.round((attended / due.length) * 100)
        if (pct < (low.threshold_percent ?? 80)) {
          push(
            low,
            person,
            now.toISOString(),
            `${pct}% attendance (${attended} of ${due.length} shifts, last ${low.threshold_days} days)`,
            `lowatt:${person.id}`
          )
        }
      }
    }

    const weekly = resolveRule(rules, 'weekly_hours_shortfall', person)
    if (weekly) {
      const weekStart = now.getTime() - 7 * 24 * 60 * MIN
      const pairs = logs
        .filter((l) => l.user_id === person.id && t(l.scanned_at) >= weekStart)
        .sort((a, b) => t(a.scanned_at) - t(b.scanned_at))
      let hours = 0
      let openedAt: number | null = null
      for (const l of pairs) {
        if (l.attendance_type === 'clock_in') openedAt = t(l.scanned_at)
        else if (openedAt != null) {
          hours += (t(l.scanned_at) - openedAt) / (60 * MIN)
          openedAt = null
        }
      }
      const target = weekly.threshold_hours ?? 48
      if (hours > 0 && hours < target) {
        push(
          weekly,
          person,
          now.toISOString(),
          `${hours.toFixed(1)} of ${target} verified hours this week`,
          `weekly:${person.id}`
        )
      }
    }

    const gapRule = resolveRule(rules, 'monitoring_gap', person)
    if (gapRule) {
      const threshold = gapRule.threshold_minutes ?? 30
      const personLogs = logs
        .filter((l) => l.user_id === person.id)
        .sort((a, b) => t(a.scanned_at) - t(b.scanned_at))

      const sessions: { start: number; end: number }[] = []
      let sessionStart: number | null = null
      for (const l of personLogs) {
        if (l.attendance_type === 'clock_in') {
          sessionStart = t(l.scanned_at)
        } else if (sessionStart != null) {
          sessions.push({ start: sessionStart, end: t(l.scanned_at) })
          sessionStart = null
        }
      }
      if (sessionStart != null) {
        sessions.push({ start: sessionStart, end: now.getTime() })
      }

      for (const session of sessions) {
        const pings = heartbeats
          .filter((h) => h.user_id === person.id && t(h.pinged_at) >= session.start && t(h.pinged_at) <= session.end)
          .sort((a, b) => t(a.pinged_at) - t(b.pinged_at))

        const marks = [session.start, ...pings.map((p) => t(p.pinged_at)), session.end]
        let maxGap = 0
        for (let i = 1; i < marks.length; i++) {
          maxGap = Math.max(maxGap, marks[i] - marks[i - 1])
        }
        const maxGapMin = Math.round(maxGap / MIN)
        if (maxGapMin > threshold) {
          push(
            gapRule,
            person,
            new Date(session.end).toISOString(),
            `Phone unreachable for ${maxGapMin} min while on shift`,
            `gap:${person.id}:${session.start}`
          )
        }
      }
    }
  }

  return flags.sort((a, b) => t(b.occurred_at) - t(a.occurred_at))
}

/** Counts per rule type, for the summary cards at the top of the Flags page. */
export function summarise(flags: Flag[]) {
  return flags.reduce<Record<string, number>>((acc, f) => {
    acc[f.rule_type] = (acc[f.rule_type] ?? 0) + 1
    return acc
  }, {})
}
