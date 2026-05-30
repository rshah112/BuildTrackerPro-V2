import type { ReactNode } from 'react'
import { Sheet } from './Sheet'
import type { Editor } from './useEditor'

/** A Sheet wired to an `useEditor` state: handles open/close and the new-vs-edit title,
 *  and only renders the form (via the children render-prop) while open. The render-prop
 *  receives the row to edit, or undefined when creating.
 *
 *    <EditorSheet editor={editor} newTitle="New vendor" editTitle="Edit vendor">
 *      {(initial) => <VendorForm initial={initial} onDone={editor.close} … />}
 *    </EditorSheet>
 */
export function EditorSheet<T>({
  editor,
  newTitle,
  editTitle,
  children,
}: {
  editor: Editor<T>
  newTitle: string
  editTitle: string
  children: (initial: T | undefined) => ReactNode
}) {
  return (
    <Sheet open={editor.isOpen} onClose={editor.close} title={editor.isNew ? newTitle : editTitle}>
      {editor.isOpen && children(editor.initial)}
    </Sheet>
  )
}
