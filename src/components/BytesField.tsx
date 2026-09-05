import type { Encoding } from '../api/contracts'

export function BytesField({
  label,
  value,
  encoding,
  onValue,
  onEncoding,
  placeholder,
  multiline = false,
}: {
  label: string
  value: string
  encoding: Encoding
  onValue(value: string): void
  onEncoding(value: Encoding): void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <label className="bytes-field">
      <span>{label}</span>
      <span className="bytes-input-row">
        {multiline ? (
          <textarea onChange={(event) => onValue(event.target.value)} placeholder={placeholder} rows={3} value={value} />
        ) : (
          <input onChange={(event) => onValue(event.target.value)} placeholder={placeholder} value={value} />
        )}
        <select aria-label={`${label} encoding`} onChange={(event) => onEncoding(event.target.value as Encoding)} value={encoding}>
          <option value="text">Text</option>
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
        </select>
      </span>
    </label>
  )
}

