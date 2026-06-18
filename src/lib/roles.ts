// Single source of truth for human-readable role labels.
// Note: keys are the role string values stored in the DB — do not change those.
const ROLE_LABELS: Record<string, string> = {
  super_admin:      'Super Admin',
  ceo:              'CEO',
  general_manager:  'General Manager',
  medical_director: 'Medical Director',
  hr:               'HR',
  coordinator:      'Coordinator',
  department_head:  'Department Head',
  physician:        'Physician',
  nurse:            'Nurse',
  pharmacist:       'Pharmacist',
  staff:            'Staff',
}

// Returns the display label for a role. Falls back to title-casing unknown roles.
export function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
