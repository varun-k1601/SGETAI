/* ===============================================================================================
   MERGING AN IMPORTED RÉSUMÉ INTO AN EXISTING PROFILE.
   ===============================================================================================
   Résumé autofill used to ASSIGN each array section wholesale (`user.experience = experience`), so
   a candidate with a full-stack résumé and a data-science résumé kept only whichever they uploaded
   last. This module turns that into a union.

   The wholesale assignment was worse than "the second upload wins", because the import mappers
   rebuild every entry from a fixed key list — deliberately, so a client cannot smuggle in
   privileged fields — and the fields they do NOT emit were therefore erased on every import:

     experience      managerEmail, trustScore, verificationStatus
                     → a candidate who completed manager verification lost it by uploading a CV
     projects        mediaFiles, documents, startDate, endDate
     certifications  media          achievements  media
     everything      _id, createdAt — the identity the media endpoints address entries by

   The fix is NOT to widen the mappers; that reopens the smuggling hole the fixed key lists exist
   to close. It is to merge here, server-side, against the stored document: a matched entry is
   KEPT — with everything the mapper never saw — and the résumé may only fill fields that are
   currently empty.
   =============================================================================================== */

const { normalizeTerm } = require("./matchService");
const { normalizeTitleKey } = require("./resumeGenerationService");

// The caps, applied to the MERGED result rather than to the incoming list. Two résumés can union
// past any of these; when that happens EXISTING entries always win, because the candidate already
// had them. Existing entries are never truncated, even on a profile already over a cap.
const SECTION_CAPS = {
  education: 10,
  experience: 15,
  projects: 15,
  certifications: 15,
  achievements: 15,
  customSections: 15,
  skillGroups: 12,
  skillsPerGroup: 40,
  preferredRoles: 12
};

function plain(entry) {
  if (!entry) return {};
  return typeof entry.toObject === "function" ? entry.toObject() : { ...entry };
}

// "Empty" is deliberately narrow: undefined, null, blank string, empty array. `false` and `0` are
// real stored values — `isCurrent: false` and `trustScore: 0` are answers, not gaps — so an import
// never overwrites them.
function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/* MATCHING KEYS. Every one folds case, trims, and collapses internal whitespace and punctuation,
   so "Node.js" and "nodejs", or "Sign-Language Recognition" and "Sign Language Recognition", are
   one entry rather than two.

   normalizeTerm (matchService) is reused for skills rather than written a third time: it already
   folds Node.js / nodejs / Node JS and react / reactjs together through SKILL_ALIASES, which is
   exactly the collision two résumés produce. normalizeTitleKey (resumeGenerationService) is reused
   for every title-keyed section, alongside its dedupeTitledItems. */
const sectionKeys = {
  skill: (value) => normalizeTerm(value),
  skillGroup: (group) => normalizeTitleKey(group?.category),
  experience: (item) => {
    const key = `${normalizeTitleKey(item?.jobTitle)}@${normalizeTitleKey(item?.companyName)}`;
    return key === "@" ? "" : key;
  },
  education: (item) => {
    const key = `${normalizeTitleKey(item?.institution)}@${normalizeTitleKey(item?.degree)}`;
    return key === "@" ? "" : key;
  },
  title: (item) => normalizeTitleKey(item?.title),
  customSectionEntry: (entry) =>
    `${normalizeTitleKey(entry?.title)}@${normalizeTitleKey(entry?.organization)}`
};

/* Fills ONLY the fields that are currently empty. This single rule is what protects every field
   the import mappers do not emit: `incoming` has no managerEmail / trustScore /
   verificationStatus / mediaFiles / documents / media / _id key at all, so those are never even
   considered, let alone overwritten.

   Descriptions are pointedly NOT concatenated. Two résumés word the same role's bullets
   differently, and joining them produces the doubled bullet list this whole change exists to
   prevent — so an existing description wins, and a résumé may only supply one that is missing. */
function fillEmptyFields(existing, incoming) {
  const merged = plain(existing);
  let changed = false;

  Object.entries(incoming || {}).forEach(([field, value]) => {
    if (isEmptyValue(value)) return;
    if (!isEmptyValue(merged[field])) return;
    merged[field] = value;
    changed = true;
  });

  return { merged, changed };
}

/* The core union. Existing entries keep their positions, new entries are appended after them, and
   a match updates in place. `cap` bounds the RESULT: once it is reached, further incoming entries
   are counted as truncated rather than pushed — existing data is never evicted to make room. */
function mergeSection({ existing = [], incoming = [], keyOf, cap = Infinity }) {
  const entries = (Array.isArray(existing) ? existing : []).map(plain);
  const indexByKey = new Map();

  entries.forEach((entry, index) => {
    const key = keyOf(entry);
    if (key && !indexByKey.has(key)) indexByKey.set(key, index);
  });

  const summary = { added: 0, updated: 0, matched: 0, truncated: 0 };

  (Array.isArray(incoming) ? incoming : []).forEach((item) => {
    const key = keyOf(item);

    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      const filled = fillEmptyFields(entries[index], item);
      entries[index] = filled.merged;
      summary.matched += 1;
      if (filled.changed) summary.updated += 1;
      return;
    }

    if (entries.length >= cap) {
      summary.truncated += 1;
      return;
    }

    if (key) indexByKey.set(key, entries.length);
    entries.push(plain(item));
    summary.added += 1;
  });

  return { entries, summary };
}

// A string union that keeps the EXISTING spelling of a duplicate. A profile holding "NodeJS" and a
// résumé listing "Node.js" is one skill, displayed the way the candidate already had it.
function mergeStrings({ existing = [], incoming = [], cap = Infinity }) {
  const values = [];
  const seen = new Set();
  const summary = { added: 0, matched: 0, truncated: 0 };

  (Array.isArray(existing) ? existing : []).forEach((value) => {
    const key = sectionKeys.skill(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    values.push(value);
  });

  (Array.isArray(incoming) ? incoming : []).forEach((value) => {
    const key = sectionKeys.skill(value);
    if (!key) return;

    if (seen.has(key)) {
      summary.matched += 1;
      return;
    }

    if (values.length >= cap) {
      summary.truncated += 1;
      return;
    }

    seen.add(key);
    values.push(value);
    summary.added += 1;
  });

  return { values, summary };
}

/* Skill groups merge at two levels: the group by category, then the skills inside a matched
   category. Without the inner merge, "Programming Languages" from a second résumé would either be
   dropped whole or appended as a second heading of the same name.

   A skill appearing under two DIFFERENT categories is left alone: that is a categorisation
   difference between two résumés, not a duplicate entry, and quietly moving skills between the
   candidate's own headings is not this function's call to make. */
function mergeSkillGroups({ existing = [], incoming = [] }) {
  const groups = (Array.isArray(existing) ? existing : []).map((group) => {
    const source = plain(group);
    return { ...source, skills: [...(source.skills || [])] };
  });
  const indexByKey = new Map();

  groups.forEach((group, index) => {
    const key = sectionKeys.skillGroup(group);
    if (key && !indexByKey.has(key)) indexByKey.set(key, index);
  });

  const summary = {
    added: 0,
    updated: 0,
    matched: 0,
    truncated: 0,
    skillsAdded: 0,
    skillsTruncated: 0
  };

  (Array.isArray(incoming) ? incoming : []).forEach((group) => {
    const key = sectionKeys.skillGroup(group);

    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      const inner = mergeStrings({
        existing: groups[index].skills,
        incoming: group.skills,
        cap: SECTION_CAPS.skillsPerGroup
      });

      groups[index].skills = inner.values;
      summary.matched += 1;
      summary.skillsAdded += inner.summary.added;
      summary.skillsTruncated += inner.summary.truncated;
      if (inner.summary.added) summary.updated += 1;
      return;
    }

    if (groups.length >= SECTION_CAPS.skillGroups) {
      summary.truncated += 1;
      return;
    }

    const next = plain(group);
    const inner = mergeStrings({ existing: [], incoming: next.skills, cap: SECTION_CAPS.skillsPerGroup });
    next.skills = inner.values;

    if (key) indexByKey.set(key, groups.length);
    groups.push(next);
    summary.added += 1;
    summary.skillsAdded += inner.values.length;
    summary.skillsTruncated += inner.summary.truncated;
  });

  return { groups, summary };
}

/* Custom sections nest, so they merge at two levels like skill groups: the section by title, then
   its entries by their own title and organization. Filling only-empty-fields at the section level
   would mean a second résumé's coursework was silently ignored whenever a "Relevant Coursework"
   section already existed — the exact loss this change exists to stop. */
function mergeCustomSections({ existing = [], incoming = [] }) {
  const sections = (Array.isArray(existing) ? existing : []).map((section) => {
    const source = plain(section);
    return { ...source, entries: (source.entries || []).map(plain) };
  });
  const indexByKey = new Map();

  sections.forEach((section, index) => {
    const key = sectionKeys.title(section);
    if (key && !indexByKey.has(key)) indexByKey.set(key, index);
  });

  const summary = { added: 0, updated: 0, matched: 0, truncated: 0 };

  (Array.isArray(incoming) ? incoming : []).forEach((section) => {
    const key = sectionKeys.title(section);

    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      const inner = mergeSection({
        existing: sections[index].entries,
        incoming: section.entries || [],
        keyOf: sectionKeys.customSectionEntry
      });

      sections[index].entries = inner.entries;
      summary.matched += 1;
      if (inner.summary.added || inner.summary.updated) summary.updated += 1;
      return;
    }

    if (sections.length >= SECTION_CAPS.customSections) {
      summary.truncated += 1;
      return;
    }

    if (key) indexByKey.set(key, sections.length);
    sections.push(plain(section));
    summary.added += 1;
  });

  return { sections, summary };
}

/* An entry an import may never delete, even when the candidate explicitly asked to REPLACE a
   section. Manager verification and uploaded files are not résumé content — they were earned or
   attached outside this flow, the files still exist in the storage bucket, and a parser's opinion
   about what one résumé mentions is not grounds for discarding either. Anything protected here can
   still be removed one entry at a time in the normal profile editor. */
function isProtectedEntry(entry) {
  const source = plain(entry);
  const verified = source.verificationStatus === "Verified" || Number(source.trustScore) > 0;
  const hasFiles =
    (source.mediaFiles || []).length > 0 ||
    (source.documents || []).length > 0 ||
    Boolean(source.media?.filePath || source.media?.url);

  return verified || hasFiles;
}

/* The opt-in escape hatch: replace this section instead of merging into it, for a candidate
   correcting a badly-parsed first import. Merge stays the default everywhere; a replace only ever
   happens because the request named that section.

   Even here a matched entry keeps its protected fields, and a protected entry the résumé does not
   mention is retained rather than deleted: replacing a section is a request to drop entries the
   résumé does not mention, not a request to revoke verification or orphan a file. */
function replaceSection({ existing = [], incoming = [], keyOf, cap = Infinity }) {
  const existingByKey = new Map();
  const unkeyed = [];

  (Array.isArray(existing) ? existing : []).forEach((entry) => {
    const source = plain(entry);
    const key = keyOf(source);

    if (!key) {
      unkeyed.push(source);
      return;
    }
    if (!existingByKey.has(key)) existingByKey.set(key, source);
  });

  const entries = [];
  const summary = { added: 0, updated: 0, matched: 0, truncated: 0, removed: 0, retainedProtected: 0 };

  (Array.isArray(incoming) ? incoming : []).forEach((item) => {
    if (entries.length >= cap) {
      summary.truncated += 1;
      return;
    }

    const key = keyOf(item);
    const previous = key ? existingByKey.get(key) : undefined;

    if (previous) {
      existingByKey.delete(key);
      entries.push(fillEmptyFields(previous, item).merged);
      summary.matched += 1;
      return;
    }

    entries.push(plain(item));
    summary.added += 1;
  });

  [...existingByKey.values(), ...unkeyed].forEach((entry) => {
    if (isProtectedEntry(entry)) {
      entries.push(entry);
      summary.retainedProtected += 1;
      return;
    }
    summary.removed += 1;
  });

  return { entries, summary };
}

// Which incoming entries the candidate does not have yet — computed with the SAME key functions
// the merge uses, so the review panel's "New" / "Already in your profile" labels cannot disagree
// with what saving actually does.
function previewSection({ existing = [], incoming = [], keyOf }) {
  const keys = new Set(
    (Array.isArray(existing) ? existing : []).map((entry) => keyOf(entry)).filter(Boolean)
  );

  return (Array.isArray(incoming) ? incoming : []).map((item) => {
    const key = keyOf(item);
    return { key, isNew: !key || !keys.has(key) };
  });
}

module.exports = {
  SECTION_CAPS,
  sectionKeys,
  isEmptyValue,
  fillEmptyFields,
  mergeSection,
  mergeStrings,
  mergeSkillGroups,
  mergeCustomSections,
  replaceSection,
  previewSection,
  isProtectedEntry
};
