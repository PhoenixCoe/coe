import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/ui/SiteFooter';

export const metadata: Metadata = { title: 'Privacy', description: 'What Coe and Coe Mini keep, what they send, and what they never do.' };

const ROWS: [string, string][] = [
  ['What Coe keeps', 'Your sign-in email, your chats, your settings and your About you answers, so they follow you from one device to the next. Without an account, chats stay on your device. Coe also counts the tokens you use.'],
  ['Your PMC Account', 'You sign in on accounts.pmcstudios.uk with an email and a password you choose. Coe and Coe Mini never see your password: you type it on that page and it goes straight to the sign-in service, which keeps it scrambled so nobody, PMC included, can read or show it. Coe is handed a sign-in that lasts a while, not your password. The page also keeps a short list of the sites you use with the account (a name and a time) so your account page can show them. Your chats are protected on the way and by the sign-in rules on the database, but they are not end-to-end encrypted: the people who run Coe could technically read them.'],
  ['What goes to the AI', 'What you type, and any file or picture you add. Coe sends it to its server, which sends it to the AI company (OpenAI) to get your answer. A web search sends your question to a search service.'],
  ['What Coe Mini reads', 'The page you are on. It reads each page quietly on your device (you can turn that off in Settings), and it sends the page text, the words you selected or a picture of the screen only when you press a button or send a message. It presses Submit only on an ordinary form, only after you say yes, and never on school work.'],
  ['Notifications', 'Off until you turn them on in Settings, and your browser asks first. A notification only says that a reply is ready. It never shows the reply. Turn it off in Settings or in your browser.'],
  ['What it never does', 'No ads. No selling your data. No using your chats to show you ads. On homework and quiz sites Coe Mini shows the answer and the working in its panel. It does not type into those pages or press Submit.'],
  ['Your choices', 'You can skip every About you question. The "ask first" questions stay on unless you switch them off in Settings. To remove your account and everything stored with it, email contact@pmcstudios.uk.'],
];

export default function Page() {
  return (
    <main className="pv">
      <h1 className="d">Privacy</h1>
      <p className="tx pv-lead">Coe and Coe Mini, in plain words.</p>
      <dl>
        {ROWS.map(([h, t]) => (<div key={h}><dt className="d">{h}</dt><dd className="tx">{t}</dd></div>))}
      </dl>
      <p className="tx pv-end">Questions: contact@pmcstudios.uk</p>
      <Link className="btn gold" href="/">Back to Coe</Link>
      <SiteFooter />
    </main>
  );
}
