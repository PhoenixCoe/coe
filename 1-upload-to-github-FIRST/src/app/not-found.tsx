import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="nf">
      <h1 className="nf-digits d" aria-label="Error 404">
        {['4', '0', '4'].map((c, i) => <span key={i} aria-hidden style={{ animationDelay: `${0.1 + i * 0.14}s` }}>{c}</span>)}
      </h1>
      <p className="nf-line d">Nothing here</p>
      <p className="tx nf-sub">That page does not exist, or it moved.</p>
      <Link className="btn gold" href="/">Back to Coe</Link>
    </main>
  );
}
