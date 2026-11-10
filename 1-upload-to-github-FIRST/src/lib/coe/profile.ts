/** The few things Coe asks about you, so it can talk to you the right way. All optional. The Coe Mini sidebar asks the same ones. */
import type { CoeSettings } from './settings';

export const AGE_OPTIONS: { value: CoeSettings['ageBand']; label: string }[] = [
  { value: '', label: 'Rather not say' }, { value: 'under11', label: 'Under 11' }, { value: '11-13', label: '11 to 13' }, { value: '14-16', label: '14 to 16' },
  { value: '17-18', label: '17 to 18' }, { value: '19-24', label: '19 to 24' }, { value: '25+', label: '25 or over' },
];
export const ROLE_OPTIONS: { value: CoeSettings['role']; label: string }[] = [
  { value: '', label: 'Rather not say' }, { value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }, { value: 'parent', label: 'Parent or carer' },
  { value: 'working', label: 'Working' }, { value: 'other', label: 'Something else' },
];
const LEVEL: Record<string, [string, string]> = {
  student: ['Year or course', 'Year 10, A level'], teacher: ['What you teach', 'Maths, KS3 science'], parent: ['Your child’s year (if you like)', 'Year 7'],
  working: ['Your job', 'Nurse, builder'], other: ['What you do', 'Hobbies, a project'], '': ['Year, course or job', 'Year 10, A level, nurse'],
};
export const levelWords = (role: string) => LEVEL[role] ?? LEVEL[''];
export type ProfilePatch = Partial<Pick<CoeSettings, 'name' | 'ageBand' | 'role' | 'yearOrJob' | 'subjects' | 'length' | 'easy' | 'profileAt'>>;
