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
  now?: Date
}): Flag[] {
  const { rules, staff, shifts, logs } = input
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

    const missingOut = resolveRule(rules, 'missing_clockout', person)
    if (missingOut && inLog && !outLog) {
      const cutoff = end + (missingOut.threshold_minutes ?? 60) * MIN
      if (now.getTime() > cutoff) {
        push(missingOut, person, shift.ends_at, 'Shift ended with no clock-out', `noout:${shift.id}`)
      }
    }
  }

  // --- log-anchored rules ---------------------------------------------
  for (const log of logs) {
    const person = byId.get(log.user_id)
    if (!person) continue

    const geo = resolveRule(rules, 'geofence_breach', person)
    if (geo && log.attendance_type === 'clock_in') {
      const beyond =
        log.distance_m != null
          ? log.distance_m > (geo.threshold_meters ?? 150)
          : log.within_geofence === false
      if (beyond) {
        const dist = log.distance_m != null ? `${Math.round(log.distance_m)} m from site` : 'Outside site radius'
        push(geo, person, log.scanned_at, dist, `geo:${log.id}`)
      }
    }

    const unscheduled = resolveRule(rules, 'unscheduled_clockin', person)
    if (unscheduled && log.attendance_type === 'clock_in') {
      const hasShift = shifts.some(
        (s) => s.user_id === log.user_id && sameDay(s.starts_at, log.scanned_at)
      )
      if (!hasShift) {
        push(unscheduled, person, log.scanned_at, 'Clock-in with no shift scheduled', `unsched:${log.id}`)
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
