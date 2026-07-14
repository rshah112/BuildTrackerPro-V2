import { useEffect, useRef } from 'react'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { SectionCard } from '../../components/ui/SectionCard'
import { ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { NotifyControl } from './NotifyControl'
import { useNotificationPrefs, useSaveNotificationPrefs, DEFAULT_PREFS } from './useNotificationPrefs'
import { useDirtyState } from '../../lib/useDirtyState'

const hourLabel = (h: number) => {
  const am = h < 12
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:00 ${am ? 'AM' : 'PM'}`
}
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const LEAD_OPTIONS = [0, 1, 2, 3, 5, 7, 10, 14]
const leadLabel = (d: number) => (d === 0 ? 'On the due date' : `${d} day${d === 1 ? '' : 's'} before`)

type Form = typeof DEFAULT_PREFS
const EMPTY_PREFS: never[] = []

export function NotificationSettingsScreen() {
  const { data = EMPTY_PREFS, isLoading, error } = useNotificationPrefs()
  const save = useSaveNotificationPrefs()
  const toast = useToast()
  const { value: form, setValue: setForm, markClean, resetClean } = useDirtyState<Form>(DEFAULT_PREFS)
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current || data.length === 0) return
    const p = data[0]
    resetClean({
      leadDays: p.leadDays,
      quietStart: p.quietStart,
      quietEnd: p.quietEnd,
      remindDueSoon: p.remindDueSoon,
      remindOverdue: p.remindOverdue,
      remindChangeOrders: p.remindChangeOrders,
    })
    seeded.current = true
  }, [data, resetClean])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const onSave = async () => {
    try {
      await save.mutateAsync(form)
      markClean()
      toast.success('Reminder settings saved')
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save settings')
    }
  }

  return (
    <section>
      <ScreenHeader title="Reminder settings" subtitle="Control when payment reminders are sent" />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={false}
        errorLabel="Couldn’t load reminder settings"
        empty={null}
      >
        <>
          <SectionCard title="Notifications">
            <NotifyControl />
            <p className="muted">Reminders are sent once a day to your enabled devices.</p>
          </SectionCard>

          <SectionCard title="What to remind me about">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.remindOverdue}
                onChange={(e) => set('remindOverdue', e.target.checked)}
              />
              Overdue invoices
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.remindDueSoon}
                onChange={(e) => set('remindDueSoon', e.target.checked)}
              />
              Invoices coming due
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.remindChangeOrders}
                onChange={(e) => set('remindChangeOrders', e.target.checked)}
              />
              Change-order payments
            </label>
          </SectionCard>

          <SectionCard title="Timing">
            <Field label="Remind me about upcoming invoices">
              {(p) => (
                <Select
                  {...p}
                  value={String(form.leadDays)}
                  onChange={(e) => set('leadDays', Number(e.target.value))}
                >
                  {LEAD_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {leadLabel(d)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="form-grid">
              <Field label="Quiet hours start" hint="No reminders during these hours.">
                {(p) => (
                  <Select {...p} value={String(form.quietStart)} onChange={(e) => set('quietStart', Number(e.target.value))}>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Quiet hours end">
                {(p) => (
                  <Select {...p} value={String(form.quietEnd)} onChange={(e) => set('quietEnd', Number(e.target.value))}>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </SectionCard>

          <Button fullWidth loading={save.isPending} onClick={onSave}>
            Save settings
          </Button>
        </>
      </ListState>
    </section>
  )
}
