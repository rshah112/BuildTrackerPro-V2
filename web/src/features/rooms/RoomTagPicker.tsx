import { useMemo } from 'react'
import { Combobox, type ComboOption } from '../../components/ui/Combobox'

/** Room-tag picker: suggests rooms already used in the project and accepts a new one. Keeps room
 *  tags consistent (so the Room Summary groups cleanly) instead of free-typed one-offs that never
 *  match. Same shared-Combobox pattern as VendorPicker. */
export function RoomTagPicker({
  label = 'Room tag',
  value,
  rooms,
  onChange,
  hint,
}: {
  label?: string
  value: string
  rooms: string[]
  onChange: (room: string) => void
  hint?: string
}) {
  const options = useMemo<ComboOption[]>(
    () =>
      [...new Set(rooms.filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((r) => ({ value: r, label: r })),
    [rooms],
  )
  return (
    <Combobox
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      allowCustom
      placeholder="Search or add a room"
      hint={hint}
    />
  )
}
