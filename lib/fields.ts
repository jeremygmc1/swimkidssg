export type FieldConfig = {
  name: string
  label: string
  type: 'text' | 'email' | 'tel' | 'phone' | 'number' | 'select' | 'textarea'
  required: boolean
  options?: string[]
  min?: number
  max?: number
  maxLength?: number
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
  { name: 'message',    label: 'Message / Enquiry', type: 'textarea', required: false, maxLength: 2000 },
]
// ─────────────────────────────────────────────────────────────────────────────
