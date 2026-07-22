export type FieldConfig = {
  name: string
  label: string
  type: 'text' | 'email' | 'tel' | 'phone' | 'number' | 'select' | 'textarea'
  required: boolean
  options?: string[]
  min?: number
  max?: number
  maxLength?: number
  placeholder?: string
  helpText?: string
  /** Only render this field when another field currently has a specific value */
  showIf?: { field: string; value: string }
}

// ── Add, remove, or reorder fields here ──────────────────────────────────────
export const FIELDS: FieldConfig[] = [
  { name: 'parentName', label: 'Parent Name',      type: 'text',     required: true, maxLength: 100 },
  { name: 'email',      label: 'Email',             type: 'email',    required: true, maxLength: 254 },
  { name: 'phone',      label: 'Phone Number',      type: 'phone',    required: true, maxLength: 10 },
  { name: 'childAge',   label: "Child's Age",       type: 'number',   required: true, min: 2, max: 99, maxLength: 2 },
  {
    name: 'swimLevel',
    label: 'Swim Level',
    type: 'select',
    required: true,
    options: ['Beginner', 'Intermediate', 'Advanced', 'Competitive'],
    maxLength: 50,
  },
  {
    name: 'poolAccess',
    label: 'Type of Pool Access',
    type: 'select',
    required: true,
    options: ['Private (landed / condo)', 'Public (ActiveSG, etc.)'],
    maxLength: 50,
  },
  {
    name: 'condoName',
    label: 'Condo Name',
    type: 'text',
    required: false,
    maxLength: 100,
    placeholder: 'e.g. The Interlace',
    showIf: { field: 'poolAccess', value: 'Private (landed / condo)' },
  },
  {
    name: 'coachGender',
    label: 'Coach Gender Preference',
    type: 'select',
    required: false,
    options: ['No preference', 'Female coach', 'Male coach'],
    maxLength: 30,
  },
  {
    name: 'message',
    label: 'Message / Enquiry',
    type: 'textarea',
    required: false,
    maxLength: 2000,
    placeholder: "e.g. My child can float but isn't confident yet, has mild asthma, prefers weekend mornings…",
    helpText: "Feel free to include your child's current swim proficiency, any medical conditions we should know about, or preferred timings.",
  },
]
// ─────────────────────────────────────────────────────────────────────────────

// ── Coach sign-up form (writes to the "Coaches" sheet tab) ───────────────────
export const COACH_FIELDS: FieldConfig[] = [
  { name: 'name',  label: 'Name',         type: 'text',  required: true, maxLength: 100 },
  { name: 'phone', label: 'Phone Number', type: 'phone', required: true, maxLength: 10 },
]
// ─────────────────────────────────────────────────────────────────────────────
