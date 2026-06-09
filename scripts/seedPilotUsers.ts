import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const SUPABASE_URL       = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const FACILITY_ID = 'd917b86c-682c-4f11-b285-0a1cada2b54b'

const PILOT_USERS = [
  { email: 'doctor@amc.et',      password: 'Test1234!', full_name: 'Dr. Abebe Girma',   role: 'physician',        employee_id: 'AMC-002', department: 'Internal Medicine' },
  { email: 'nurse@amc.et',       password: 'Test1234!', full_name: 'Tigist Haile',       role: 'nurse',            employee_id: 'AMC-003', department: 'Nursing' },
  { email: 'hr@amc.et',          password: 'Test1234!', full_name: 'Hana Bekele',        role: 'hr',               employee_id: 'AMC-004', department: 'Administration' },
  { email: 'meddir@amc.et',      password: 'Test1234!', full_name: 'Dr. Yonas Tadesse', role: 'medical_director', employee_id: 'AMC-005', department: 'Administration' },
  { email: 'ceo@amc.et',         password: 'Test1234!', full_name: 'Akeza Teame',        role: 'ceo',              employee_id: 'AMC-006', department: 'Administration' },
  { email: 'coordinator@amc.et', password: 'Test1234!', full_name: 'Sara Alemu',         role: 'coordinator',      employee_id: 'AMC-007', department: 'Administration' },
  { email: 'gm@amc.et',                   password: 'Test1234!', full_name: 'Melat Abate',        role: 'general_manager',  employee_id: 'AMC-008', department: 'Administration'    },
  { email: 'depthead.doctors@amc.et',     password: 'Test1234!', full_name: 'Dr. Fitsum Dagmawi', role: 'department_head',  employee_id: 'AMC-009', department: 'Internal Medicine' },
  { email: 'depthead.nursing@amc.et',     password: 'Test1234!', full_name: 'Sr. Almaz Bekele',   role: 'department_head',  employee_id: 'AMC-010', department: 'Nursing'           },
  { email: 'nurse2@amc.et',               password: 'Test1234!', full_name: 'Meron Tadesse',       role: 'nurse',            employee_id: 'AMC-011', department: 'Nursing'           },
  { email: 'depthead.midwifery@amc.et',   password: 'Test1234!', full_name: 'Sr. Tigist Alemu',   role: 'department_head',  employee_id: 'AMC-012', department: 'Midwifery'         },
  { email: 'depthead.pharmacy@amc.et',    password: 'Test1234!', full_name: 'Dawit Haile',         role: 'department_head',  employee_id: 'AMC-013', department: 'Pharmacy'          },
  { email: 'pharmacist@amc.et',           password: 'Test1234!', full_name: 'Selam Girma',         role: 'pharmacist',       employee_id: 'AMC-014', department: 'Pharmacy'          },
  { email: 'depthead.lab@amc.et',         password: 'Test1234!', full_name: 'Biniam Tesfaye',      role: 'department_head',  employee_id: 'AMC-015', department: 'Laboratory'        },
  { email: 'depthead.reception@amc.et',   password: 'Test1234!', full_name: 'Rahel Mekonen',       role: 'department_head',  employee_id: 'AMC-016', department: 'Reception'         },
]

async function seed() {
  console.log('🌱 Starting pilot seed...\n')

  const { data: depts } = await supabase.from('departments').select('id, name')
  const deptMap: Record<string, string> = {}
  for (const d of depts ?? []) deptMap[d.name] = d.id

  const { data: facilities } = await supabase.from('facilities').select('id').limit(1)
  const facilityId = facilities?.[0]?.id ?? null
  if (facilityId) console.log(`Using facility_id: ${facilityId}`)
  else console.log('⚠️  No facility found — facility_id will be null')

  // Pre-fetch all auth users once so we can resolve IDs without re-creating
  const { data: allUsersData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) { console.error('❌ Could not list users:', listErr.message); process.exit(1) }
  const existingUsers = allUsersData?.users ?? []
  const existingByEmail: Record<string, string> = {}
  for (const u of existingUsers) { if (u.email) existingByEmail[u.email] = u.id }

  for (const user of PILOT_USERS) {
    console.log(`Processing ${user.email}...`)

    let userId: string | undefined = existingByEmail[user.email]

    if (userId) {
      console.log(`  ℹ️  Auth user already exists — upserting profile`)
    } else {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email:         user.email,
        password:      user.password,
        email_confirm: true,
        user_metadata: {
          full_name:   user.full_name,
          role:        user.role,
          facility_id: FACILITY_ID,
        },
      })
      if (authErr) { console.error(`  ❌ Auth error: ${authErr.message}`); continue }
      userId = authData?.user?.id
      if (!userId) { console.error('  ❌ No user ID returned'); continue }
    }

    const { error: profileErr } = await supabase.from('profiles').upsert({
      id:            userId,
      full_name:     user.full_name,
      email:         user.email,
      role:          user.role,
      employee_id:   user.employee_id,
      department_id: deptMap[user.department] ?? null,
      facility_id:   FACILITY_ID,
      is_active:     true,
    })

    if (profileErr) console.error(`  ❌ Profile error: ${profileErr.message}`)
    else console.log(`  ✅ ${user.full_name} (${user.role}) done`)
  }

  console.log('\n✅ Seed complete!')
  console.log('\n─────────────────────────────────────────────────────')
  console.log('Email                      Password    Role')
  console.log('─────────────────────────────────────────────────────')
  for (const u of PILOT_USERS) {
    console.log(`${u.email.padEnd(28)} Test1234!  ${u.role}`)
  }
  console.log('─────────────────────────────────────────────────────')
}

seed().catch(console.error)
