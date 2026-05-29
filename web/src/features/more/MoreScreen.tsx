import { Link } from 'react-router-dom'
import { signOut } from '../auth/useSession'

export function MoreScreen() {
  return (
    <section>
      <h1>More</h1>
      <ul className="card-list">
        <li className="card">
          <Link to="/projects" className="link">Switch / manage projects</Link>
        </li>
      </ul>
      <p className="muted">Vendors, tasks, documents, bids, exports, and settings arrive in later waves.</p>
      <button type="button" onClick={() => signOut()}>Sign out</button>
    </section>
  )
}
