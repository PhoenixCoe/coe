'use client';
import { useState } from 'react';
import { Select } from '@/ui/Controls';
import { AGE_OPTIONS, ROLE_OPTIONS, levelWords } from '@/lib/coe/profile';
import type { CoeSettings } from '@/lib/coe/settings';
import { Modal } from './Panels';

/** The first time Coe opens: a few short, optional questions, so it knows who it is talking to. Nothing personal. Skipping is fine. */
export const MET = 'pmc:coe:met';
export function MeetCoe({ s, save, onClose }: { s: CoeSettings; save: (patch: Partial<CoeSettings>) => void; onClose: () => void }) {
  const [name, setName] = useState(s.name), [ageBand, setAge] = useState<CoeSettings['ageBand']>(s.ageBand), [role, setRole] = useState<CoeSettings['role']>(s.role), [yearOrJob, setYear] = useState(s.yearOrJob), [subjects, setSubj] = useState(s.subjects);
  const done = (keep: boolean) => { try { localStorage.setItem(MET, '1'); } catch { /* blocked */ } if (keep) save({ name: name.trim().slice(0, 30), ageBand, role, yearOrJob: yearOrJob.trim().slice(0, 60), subjects: subjects.trim().slice(0, 100) }); onClose(); };
  return (
    <Modal title="Meet Coe" onClose={() => done(false)}>
      <div className="meet">
        <p className="lead tx">A few quick questions, so Coe talks to you the right way. Skip any you like. You can change them later in Settings.</p>
        <div className="meet-grid">
          <div className="cx-fr"><label className="label" htmlFor="mt-name">What should Coe call you?</label>
            <input id="mt-name" className="cx-in" type="text" maxLength={30} value={name} placeholder="Your first name" autoComplete="off" autoFocus onChange={(e) => setName(e.target.value)} /></div>
          <div className="cx-fr"><span className="label">Your age group</span><Select label="Your age group" value={ageBand} onChange={(v) => setAge(v)} options={AGE_OPTIONS} /></div>
          <div className="cx-fr"><span className="label">What best fits you?</span><Select label="What best fits you" value={role} onChange={(v) => setRole(v)} options={ROLE_OPTIONS} /></div>
          <div className="cx-fr"><label className="label" htmlFor="mt-lvl">{levelWords(role)[0]}</label>
            <input id="mt-lvl" className="cx-in" type="text" maxLength={60} value={yearOrJob} placeholder={levelWords(role)[1]} autoComplete="off" onChange={(e) => setYear(e.target.value)} /></div>
          <div className="cx-fr"><label className="label" htmlFor="mt-subj">What you study or work on</label>
            <input id="mt-subj" className="cx-in" type="text" maxLength={100} value={subjects} placeholder="Maths, science, music" autoComplete="off" onChange={(e) => setSubj(e.target.value)} /></div>
        </div>
        <div className="meet-act"><button type="button" className="cx-link" onClick={() => done(false)}>Skip for now</button><button type="button" className="btn primary" onClick={() => done(true)}>Save</button></div>
      </div>
    </Modal>
  );
}
