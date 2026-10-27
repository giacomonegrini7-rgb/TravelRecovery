// Contenuti (questionario e demo) nella lingua corrente.
import { QUESTIONNAIRES, type QuestionnaireDefinition } from '../config/questionnaire';
import {
  BENEFIT_LABEL, DEMO_CASES, NEED_LABEL, STATUS_LABEL, getCase,
  type Benefit, type CategoryId, type DemoCase, type NeedId, type Status,
} from '../config/demoCases';
import { CONSENT_TEXT, PROJECT } from '../config/project';
import { getLang, type Lang } from './index';
import { localizeQuestionnaire } from './questionnaire.en';
import { BENEFIT_LABEL_EN, NEED_LABEL_EN, STATUS_LABEL_EN, localizeCase } from './demoCases.en';

const cache = new Map<string, QuestionnaireDefinition>();

export function questionnaireFor(version: string, lang: Lang = getLang()): QuestionnaireDefinition {
  const base = QUESTIONNAIRES[version] ?? QUESTIONNAIRES[PROJECT.questionnaireVersion];
  if (lang === 'it') return base;
  const key = `${base.version}:${lang}`;
  if (!cache.has(key)) cache.set(key, localizeQuestionnaire(base));
  return cache.get(key)!;
}

export function demoCases(lang: Lang = getLang()): DemoCase[] {
  return lang === 'it' ? DEMO_CASES : DEMO_CASES.map(localizeCase);
}

export function demoCase(category: CategoryId, lang: Lang = getLang()): DemoCase {
  const c = getCase(category);
  return lang === 'it' ? c : localizeCase(c);
}

export function categoryLabel(category: string, lang: Lang = getLang()): string {
  return demoCases(lang).find((c) => c.category === category)?.categoryLabel ?? category;
}

export function needLabel(n: NeedId, lang: Lang = getLang()) { return (lang === 'en' ? NEED_LABEL_EN : NEED_LABEL)[n]; }
export function statusLabel(s: Status, lang: Lang = getLang()) { return (lang === 'en' ? STATUS_LABEL_EN : STATUS_LABEL)[s]; }
export function benefitLabel(b: Benefit, lang: Lang = getLang()) { return (lang === 'en' ? BENEFIT_LABEL_EN : BENEFIT_LABEL)[b]; }

/** Testo e versione del consenso mostrati al partecipante (devono coincidere con consent_versions nel database). */
export const CONSENT_TEXT_EN =
  'I would like to receive email updates about the launch of Travel Recovery. I can withdraw my consent at any time.';

export function consentFor(lang: Lang, itVersion: string, itText: string): { version: string; text: string } {
  return lang === 'en' ? { version: `${itVersion}-en`, text: CONSENT_TEXT_EN } : { version: itVersion, text: itText || CONSENT_TEXT };
}
