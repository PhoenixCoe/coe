import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="nf">
      <h1 className="d">Nothing here</h1>
      <p className="tx">That page does not exist.</p>
      <Link className="btn gold" href="/">Back to Coe</Link>
    </main>
  );
}
