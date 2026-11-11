import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/ui/SiteFooter';
import { COE_VERSION } from '@/lib/coe/changelog';

export const metadata: Metadata = { title: 'About and credits', description: 'Who makes Coe, what it is built with, and who owns what.' };

const ROWS: [string, string][] = [
  ['What Coe is', 'Coe is a study and writing helper. Coe Mini is the same helper in the sidebar of Chrome, Edge and Firefox on a computer. It is not on phones or iPads, which cannot add browser extensions. Both are made by PMC Studios.'],
  ['Who owns what', 'Coe, Coe Mini, the Coe logo, the PMC Studios logo, and the PMC Header and PMC Font typefaces are made by PMC Studios. © PMC Studios. All rights reserved.'],
  ['Where the answers come from', 'Coe sends what you write to its server, which sends it to the AI company OpenAI to get a reply. The privacy page says exactly what is kept and what is sent.'],
  ['Fonts', 'PMC Header and PMC Font are drawn by PMC Studios. Big Shoulders Display, IBM Plex Mono and JetBrains Mono stand in when needed, and are used under the SIL Open Font License 1.1.'],
  ['Maps', 'Map pages use OpenStreetMap data. © OpenStreetMap contributors.'],
  ['Version', `Coe ${COE_VERSION}. Coe Mini shows its own version in its Settings, and the two are kept in step.`],
  ['Contact', 'contact@pmcstudios.uk'],
];

export default function Page() {
  return (
    <main className="pv">
      <h1 className="d">About and credits</h1>
      <p className="tx pv-lead">The small print, in plain words.</p>
      <dl>
        {ROWS.map(([h, t]) => (<div key={h}><dt className="d">{h}</dt><dd className="tx">{t}</dd></div>))}
      </dl>
      <p className="tx pv-end"><Link href="/privacy/">Read the privacy page</Link></p>
      <Link className="btn gold" href="/">Back to Coe</Link>
      <SiteFooter />
    </main>
  );
}
