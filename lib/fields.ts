export type FieldConfig = {
  name: string
  label: string
  type: 'text' | 'email' | 'tel' | 'phone' | 'number' | 'select' | 'textarea' | 'radio' | 'multiselect' | 'file'
  required: boolean
  options?: string[]
  min?: number
  max?: number
  maxLength?: number
  placeholder?: string
  helpText?: string
  /** For `file`: accepted types, e.g. '.pdf,.doc,.docx' */
  accept?: string
  /** For `file`: allow selecting multiple files */
  multiple?: boolean
  /** Only render this field when another field currently has a specific value */
  showIf?: { field: string; value: string }
}

// For `multiselect`, an option literally named 'Others' reveals a free-text
// "please specify" input; its value is stored in the companion `${name}_other`.

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
  { name: 'name',  label: 'Name',           type: 'text',  required: true, maxLength: 100 },
  { name: 'phone', label: 'Contact Number', type: 'phone', required: true, maxLength: 10 },
  {
    name: 'swimCert',
    label: 'Swim Cert',
    type: 'multiselect',
    required: true,
    options: ['NROC', 'SSI', 'AustSwim', 'STA', 'Others'],
    maxLength: 200,
  },
  {
    name: 'cprAed',
    label: 'Do you have a valid CPR/AED license?',
    type: 'radio',
    required: true,
    options: ['Yes', 'No'],
  },
  {
    name: 'coachProfile',
    label: 'Coach Profile',
    type: 'file',
    required: false,
    accept: '.pdf,.doc,.docx',
    helpText: 'Optional. Upload your coaching profile or CV (PDF or Word, max 8 MB).',
  },
  {
    name: 'certs',
    label: 'Certs',
    type: 'file',
    required: false,
    multiple: true,
    accept: '.pdf,.png,.jpg,.jpeg,.webp',
    helpText:
      'Optional. Upload your swim certs and valid CPR/AED license (PDF or image, max 8 MB each). You can select multiple files.',
  },
  { name: 'remarks', label: 'Remarks', type: 'textarea', required: false, maxLength: 2000 },
]
// ─────────────────────────────────────────────────────────────────────────────
