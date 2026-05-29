import { signOut } from '../auth/useSession'

export function MoreScreen() {
  return (
    <section>
      <h1>More</h1>
      <p>Vendors, tasks, documents, bids, exports, and settings arrive in later waves.</p>
      <button type="button" onClick={() => signOut()}>
        Sign out
      </button>
    </section>
  )
}
