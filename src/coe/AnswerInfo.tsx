'use client';
/** Everything about one answer in one place: the businesses on its maps (with every detail and button), and how it was made. */
import { useMemo } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';
import { PlaceCard, mapPlaces } from './MapBlock';
import { modelByKey } from '@/lib/coe/models';
import type { Msg } from './store';

const ago = (t: number) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString('en-GB'); };
const TOOL: Record<string, string> = { js: 'Ran code', maths: 'Exact maths', search: 'Searched the web', image: 'Made a picture', place: 'Looked up places', pmc_app: 'Used a PMC App', workspace: 'Worked on project files', remember: 'Noted something', github: 'GitHub', google_doc: 'Google Docs', google_sheet: 'Google Sheets', google_slides: 'Google Slides', google_read: 'Read a Google file' };

export function AnswerInfo({ msg, onClose }: { msg: Msg; onClose: () => void }) {
  const places = useMemo(() => mapPlaces(msg.text), [msg.text]);
  const tools = Array.from(new Set((msg.runs ?? []).map((r) => TOOL[(r.args as { tool?: string } | undefined)?.tool ?? ''] ?? '').filter(Boolean)));
  const rows: [string, string][] = [
    ['Made by', msg.model ? `${modelByKey(msg.model).name}${msg.work ? ' in Deep Work' : ''}` : 'Coe'],
    ['When', ago(msg.ts)],
    ['Tokens', msg.inTokens || msg.outTokens ? `${(msg.inTokens ?? 0).toLocaleString('en-GB')} read, ${(msg.outTokens ?? 0).toLocaleString('en-GB')} written` : 'Not counted'],
    ['Double-check', msg.checked === 'fixed' ? `Coe found a mistake and fixed it${msg.fix ? `: ${msg.fix}` : ''}` : msg.checked === 'ok' ? 'Coe looked it over and found nothing wrong' : 'Not checked'],
    ...(tools.length ? [['Tools used', tools.join(', ')] as [string, string]] : []),
  ];
  return (
    <Modal title="About this answer" onClose={onClose} wide>
      <div className="ainfo">
        {places.length > 0 && (
          <section aria-label="Places">
            <h3 className="d ainfo-h"><UiIcon name="place" size={18} />Places ({places.length})</h3>
            <div className="pc-full">{places.map((p, i) => <PlaceCard key={`${p.name}${i}`} p={p} i={i} full />)}</div>
          </section>
        )}
        <section aria-label="How it was made">
          <h3 className="d ainfo-h"><UiIcon name="info" size={18} />How it was made</h3>
          <dl className="ainfo-dl">{rows.map(([k, v]) => <div key={k}><dt className="d">{k}</dt><dd className="tx">{v}</dd></div>)}</dl>
          <p className="tx ainfo-n">Tokens are the small pieces of text Coe reads and writes. Your daily allowance is counted in tokens.</p>
        </section>
      </div>
    </Modal>
  );
}
