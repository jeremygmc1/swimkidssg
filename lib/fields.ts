export type FieldConfig = {
  name: string
  label: string
  type: 'text' | 'email' | 'tel' | 'phone' | 'number' | 'select' | 'textarea'
  required: boolean
  options?: string[]
  min?: number
  max?: number
}

// ── Add, remove, or reorder fields here ──────────────────────────────────────
export const FIELDS: FieldConfig[] = [
  { name: 'parentName', label: 'Parent Name',      type: 'text',     required: true  },
  { name: 'email',      label: 'Email',             type: 'email',    required: true  },
  { name: 'phone',      label: 'Phone Number',      type: 'phone',    required: true  },
  { name: 'childAge',   label: "Child's Age",       type: 'number',   required: true, min: 2, max: 99 },
  {
    name: 'swimLevel',
    label: 'Swim Level',
    type: 'select',
    required: true,
    options: ['Beginner', 'Intermediate', 'Advanced'],
  },
  { name: 'message',    label: 'Message / Enquiry', type: 'textarea', required: false },
]
// ─────────────────────────────────────────────────────────────────────────────
