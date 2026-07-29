import type { FieldConfig } from '@/lib/fields'
import FileUploadField from './FileUploadField'

const COUNTRY_CODES = [
  { code: '+65', label: '🇸🇬 +65 (SG)' },
  { code: '+60', label: '🇲🇾 +60 (MY)' },
  { code: '+62', label: '🇮🇩 +62 (ID)' },
  { code: '+63', label: '🇵🇭 +63 (PH)' },
  { code: '+66', label: '🇹🇭 +66 (TH)' },
  { code: '+84', label: '🇻🇳 +84 (VN)' },
  { code: '+86', label: '🇨🇳 +86 (CN)' },
  { code: '+91', label: '🇮🇳 +91 (IN)' },
  { code: '+44', label: '🇬🇧 +44 (UK)' },
  { code: '+1',  label: '🇺🇸 +1  (US)' },
]

const base =
  'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

type Props = {
  field: FieldConfig
  value: string
  phoneCode?: string
  otherValue?: string
  onChange: (name: string, value: string) => void
}

export default function FormField({ field, value, phoneCode, otherValue, onChange }: Props) {
  const { name, label, type, required, options, min, max, maxLength, placeholder, helpText } = field
  const selected = value ? value.split(',') : []

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {helpText && <p className="text-xs text-gray-400">{helpText}</p>}

      {type === 'phone' && (
        <div className="flex gap-2">
          <select
            value={phoneCode ?? '+65'}
            onChange={(e) => onChange(`${name}_code`, e.target.value)}
            className={`${base} flex-1 min-w-0 px-2`}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <input
            id={name}
            type="tel"
            name={name}
            value={value}
            required={required}
            placeholder="e.g. 91234567"
            maxLength={maxLength}
            onChange={(e) => onChange(name, e.target.value)}
            className={`${base} flex-[5] min-w-0`}
          />
        </div>
      )}

      {type === 'select' && (
        <select
          id={name}
          name={name}
          value={value}
          required={required}
          onChange={(e) => onChange(name, e.target.value)}
          className={base}
        >
          <option value="">Select…</option>
          {options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}

      {type === 'file' && (
        <FileUploadField field={field} value={value} onChange={onChange} />
      )}

      {type === 'radio' && (
        <div className="flex gap-6 pt-1">
          {options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name={name}
                value={o}
                checked={value === o}
                required={required}
                onChange={(e) => onChange(name, e.target.value)}
                className="accent-brand-500"
              />
              {o}
            </label>
          ))}
        </div>
      )}

      {type === 'multiselect' && (
        <div className="flex flex-col gap-2 pt-1">
          {options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => {
                  const next = selected.includes(o)
                    ? selected.filter((s) => s !== o)
                    : [...selected, o]
                  onChange(name, next.join(','))
                }}
                className="accent-brand-500"
              />
              {o}
            </label>
          ))}
          {selected.includes('Others') && (
            <input
              type="text"
              value={otherValue ?? ''}
              required={required}
              maxLength={100}
              placeholder="Please specify"
              onChange={(e) => onChange(`${name}_other`, e.target.value)}
              className={base}
            />
          )}
        </div>
      )}

      {type === 'textarea' && (
        <textarea
          id={name}
          name={name}
          value={value}
          required={required}
          rows={4}
          maxLength={maxLength}
          placeholder={placeholder ?? `Enter your ${label.toLowerCase()}…`}
          onChange={(e) => onChange(name, e.target.value)}
          className={base}
        />
      )}

      {['text', 'email', 'number'].includes(type) && (
        <input
          id={name}
          type={type}
          name={name}
          value={value}
          required={required}
          min={min}
          max={max}
          maxLength={maxLength}
          placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
          onChange={(e) => onChange(name, e.target.value)}
          className={base}
        />
      )}
    </div>
  )
}
