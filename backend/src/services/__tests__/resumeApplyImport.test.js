const test = require("node:test");
const assert = require("node:assert/strict");

const {
  importEducation,
  importExperience,
  importProjects,
  importTitledList,
  importSkillGroups
} = require("../../controllers/profileController");
const {
  SECTION_CAPS,
  sectionKeys: mergeKeys,
  isEmptyValue,
  mergeSection,
  mergeStrings,
  mergeSkillGroups,
  replaceSection,
  previewSection
} = require("../profileMergeService");
const { normalizeParsedProfile } = require("../resumeProfileParser");

/* ===============================================================================================
   THE APPLY BOUNDARY — PUT /profile/apply-parsed-resume.

   This is the last step of résumé autofill: the candidate has reviewed the parsed draft and
   clicked "Save all imported details", and these mappers write it to their profile.

   Each one REBUILDS its object from a fixed list of keys rather than passing it through. That is
   the right shape for an import boundary - it means a client cannot smuggle in `trustScore` or
   `verificationStatus` - but it has one dangerous property: a field the parser produces and the
   mapper forgets is dropped in COMPLETE SILENCE. No error, no warning, no failed validation.

   That is not hypothetical. `importEducation` omitted `gpa`, so every education grade the parser
   extracted was discarded here, and not one education entry in the production database had a
   grade. The symptom pointed elsewhere entirely: the most recent degree still showed one, because
   the generator falls back to the Number-typed `profile.currentGPA` for that entry alone. So the
   top degree looked right and the ones under it looked like an extraction failure.

   These tests close the loop by construction: whatever the parser emits for an entry, the mapper
   that writes it must keep. Add a field to a normalizer and forget the mapper, and this fails.
   =============================================================================================== */

// The keys the parser actually produces, taken from the parser itself rather than restated here,
// so the two cannot drift apart.
function parserKeysFor(section, sample) {
  const draft = normalizeParsedProfile({ [section]: [sample] });
  return Object.keys(draft[section][0]);
}

test("importEducation keeps every field the parser emits — including the grade", () => {
  const sample = {
    institution: "International Institute of Information Technology, Bangalore",
    degree: "Master of Technology",
    fieldOfStudy: "Computer Science and Engineering",
    gpa: "3.68/4",
    startDate: "July 2024",
    endDate: "July 2026"
  };
  const parsed = normalizeParsedProfile({ education: [sample] }).education;
  const imported = importEducation(parsed);

  parserKeysFor("education", sample).forEach((key) => {
    assert.ok(key in imported[0], `importEducation drops "${key}" — the parser produces it and it will vanish on save`);
  });
  assert.equal(imported[0].gpa, "3.68/4", "the grade must survive the apply step verbatim");
});

test("a grade survives with its scale, whatever scale that is", () => {
  // The scale is half the fact: 8.68 without its /10 is indistinguishable from a 4-point GPA that
  // would be impossible. Nothing on this path may convert, round or re-base a grade.
  const scales = ["3.68/4", "8.68/10", "78.4%", "First Class with Distinction", "9.12/10", "A+"];
  const parsed = normalizeParsedProfile({
    education: scales.map((gpa, index) => ({ institution: `Institution ${index}`, degree: `Degree ${index}`, gpa }))
  }).education;

  const imported = importEducation(parsed);
  assert.equal(imported.length, scales.length);
  scales.forEach((gpa, index) => assert.equal(imported[index].gpa, gpa, `"${gpa}" must round-trip unchanged`));
});

test("EVERY education entry keeps its own grade, not just the first", () => {
  // Filling only element [0] of an array is a classic extraction failure, and it was the suspected
  // cause here. It was not - but the property is worth pinning at the boundary regardless.
  const degrees = [
    { institution: "IIIT Hyderabad", degree: "M.S in Data Science", gpa: "8.5" },
    { institution: "SNIST", degree: "B.Tech in CSE", gpa: "7.9" },
    { institution: "Excellencia Junior College", degree: "Intermediate", gpa: "9.6" },
    { institution: "Vikas High School", degree: "High School", gpa: "9.3" }
  ];
  const imported = importEducation(normalizeParsedProfile({ education: degrees }).education);

  assert.deepEqual(imported.map((item) => item.gpa), ["8.5", "7.9", "9.6", "9.3"]);
});

test("a degree with no grade stays empty — never borrows one from a neighbour", () => {
  // A grade on the wrong degree is a fabricated credential, and worse than a missing one.
  const imported = importEducation(normalizeParsedProfile({
    education: [
      { institution: "IIT Madras", degree: "Master of Technology", gpa: "9.12/10" },
      { institution: "Anna University", degree: "Bachelor of Engineering", gpa: "" }
    ]
  }).education);

  assert.equal(imported[0].gpa, "9.12/10");
  assert.equal(imported[1].gpa, "", "an absent grade must stay absent");
});

test("importExperience and importProjects keep every field their parser emits too", () => {
  // The same silent-drop class of bug, on the two mappers next to the one that had it.
  const experienceSample = {
    jobTitle: "Summer Intern", companyName: "Morgan Stanley",
    startDate: "May 2025", endDate: "July 2025", isCurrent: false, description: "Implemented a synthetic counter."
  };
  const parsedExperience = normalizeParsedProfile({ experience: [experienceSample] }).experience;
  const importedExperience = importExperience(parsedExperience);
  parserKeysFor("experience", experienceSample).forEach((key) => {
    assert.ok(key in importedExperience[0], `importExperience drops "${key}"`);
  });

  const projectSample = {
    title: "Sign Language Recognition", description: "Created and deployed.",
    projectUrl: "https://example.com/demo", repositoryUrl: "https://github.com/example/repo"
  };
  const parsedProjects = normalizeParsedProfile({ projects: [projectSample] }).projects;
  const importedProjects = importProjects(parsedProjects);
  parserKeysFor("projects", projectSample).forEach((key) => {
    assert.ok(key in importedProjects[0], `importProjects drops "${key}"`);
  });
});

test("the apply boundary still refuses fields a client must not set", () => {
  // The mappers rebuild rather than spread precisely so this cannot happen: trust and verification
  // state belong to the verification flow, never to an uploaded résumé.
  const imported = importExperience([{
    jobTitle: "Summer Intern", companyName: "Morgan Stanley",
    trustScore: 95, verificationStatus: "Verified", managerEmail: "someone@example.com"
  }]);

  assert.ok(!("trustScore" in imported[0]), "a résumé import must never set trustScore");
  assert.ok(!("verificationStatus" in imported[0]), "a résumé import must never set verificationStatus");
  assert.ok(!("managerEmail" in imported[0]), "a résumé import must never set managerEmail");
});

/* ===============================================================================================
   THE MERGE — the other half of the same boundary.
   ===============================================================================================
   The mappers above answer "does this field survive the trip?". These answer the question that
   used to have the wrong answer: "does what I ALREADY had survive someone else's résumé?"

   It did not. Every array section was assigned wholesale (`user.experience = experience`), so a
   candidate with a full-stack résumé and a data-science résumé kept only the last one uploaded.
   And because the mappers rebuild from a fixed key list, the assignment also erased every field
   they do not emit — verificationStatus, trustScore, managerEmail, mediaFiles, documents, media —
   which is the same silent-drop failure as the missing `gpa`, one layer up: not a field the parser
   produced and the mapper forgot, but a field the PROFILE held and the import never knew about.

   These tests pin the union, the de-duplication, and above all what an import is not allowed to
   destroy.
   =============================================================================================== */

// Mirrors what applyParsedResume does for one section, so a test exercises the same pair of steps
// the endpoint does: map the incoming résumé, then merge it into what is stored.
function importAndMerge({ existing, incoming, mapper, keyOf, cap }) {
  return mergeSection({ existing, incoming: mapper(incoming), keyOf, cap });
}

test("two different résumés produce the UNION of their experience, not the last one uploaded", () => {
  const fullStack = [{ jobTitle: "Software Engineer", companyName: "Northwind", description: "Built React front ends." }];
  const dataScience = [{ jobTitle: "Data Scientist", companyName: "Kribud", description: "Trained ranking models." }];

  const first = importAndMerge({ existing: [], incoming: fullStack, mapper: importExperience, keyOf: mergeKeys.experience, cap: SECTION_CAPS.experience });
  const second = importAndMerge({ existing: first.entries, incoming: dataScience, mapper: importExperience, keyOf: mergeKeys.experience, cap: SECTION_CAPS.experience });

  assert.deepEqual(
    second.entries.map((item) => item.jobTitle),
    ["Software Engineer", "Data Scientist"],
    "the second résumé must ADD to the first, and existing entries keep their position"
  );
});

test("uploading the SAME résumé twice changes nothing", () => {
  const resume = [
    { jobTitle: "Software Engineer", companyName: "Northwind", description: "Built React front ends." },
    { jobTitle: "Intern", companyName: "Kribud", description: "Wrote tests." }
  ];

  const first = importAndMerge({ existing: [], incoming: resume, mapper: importExperience, keyOf: mergeKeys.experience, cap: SECTION_CAPS.experience });
  const second = importAndMerge({ existing: first.entries, incoming: resume, mapper: importExperience, keyOf: mergeKeys.experience, cap: SECTION_CAPS.experience });

  assert.equal(second.entries.length, first.entries.length, "a re-import must not duplicate anything");
  assert.equal(second.summary.added, 0);
  assert.deepEqual(second.entries, first.entries, "and must not lose anything either");
});

test("the same role at the same company is ONE entry, with the bullets not doubled", () => {
  // Two résumés word the same role differently. Concatenating would produce the doubled bullet
  // list this change exists to prevent, so the description the candidate already had wins.
  const existing = importExperience([
    { jobTitle: "Software Engineer", companyName: "Northwind Talent", description: "Owned the checkout service." }
  ]);
  const rewritten = [
    { jobTitle: "software engineer", companyName: "NORTHWIND TALENT", description: "Led payments work across three teams." }
  ];

  const merged = importAndMerge({ existing, incoming: rewritten, mapper: importExperience, keyOf: mergeKeys.experience, cap: SECTION_CAPS.experience });

  assert.equal(merged.entries.length, 1, "case and spacing must not create a second copy of one role");
  assert.equal(merged.entries[0].description, "Owned the checkout service.");
  assert.ok(!/Led payments work/.test(merged.entries[0].description), "descriptions must never be concatenated");
});

test("a VERIFIED experience entry survives a re-import as Verified, with its trustScore and managerEmail", () => {
  /* THE ONE THAT MATTERS MOST. importExperience emits six fields and none of them is
     verificationStatus, trustScore or managerEmail — that is deliberate, it is what stops a client
     smuggling them in. The old wholesale assignment therefore reverted every verified role to
     Pending / 0 / no manager: a candidate lost completed manager verification by uploading a CV.

     The merge cannot reintroduce the smuggling hole either — the incoming object still has no such
     keys — so it must preserve them from the STORED entry instead. */
  const stored = [{
    _id: "65f0000000000000000000aa",
    jobTitle: "Software Engineer",
    companyName: "Northwind Talent",
    description: "Owned the checkout service.",
    managerEmail: "manager@northwind.example",
    trustScore: 92,
    verificationStatus: "Verified"
  }];

  const merged = importAndMerge({
    existing: stored,
    incoming: [{ jobTitle: "Software Engineer", companyName: "Northwind Talent", description: "Rewritten bullets.", trustScore: 0, verificationStatus: "Pending", managerEmail: "attacker@example.com" }],
    mapper: importExperience,
    keyOf: mergeKeys.experience,
    cap: SECTION_CAPS.experience
  });

  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].verificationStatus, "Verified", "a résumé upload must never downgrade a verified role");
  assert.equal(merged.entries[0].trustScore, 92, "the trust score must survive the import");
  assert.equal(merged.entries[0].managerEmail, "manager@northwind.example", "the manager's email must survive the import");
  assert.equal(merged.entries[0]._id, "65f0000000000000000000aa", "the entry keeps its identity, which the verification flow addresses it by");
});

test("a trustScore of 0 is a value, not a gap — an import cannot fill it", () => {
  // isEmptyValue treats only undefined/null/""/[] as empty on purpose. If 0 counted as empty an
  // import could raise a trust score, which is exactly the field it must never touch.
  assert.equal(isEmptyValue(0), false);
  assert.equal(isEmptyValue(false), false);
  assert.equal(isEmptyValue(""), true);
  assert.equal(isEmptyValue([]), true);
});

test("project media and documents survive a re-import", () => {
  // importProjects emits four fields, so mediaFiles/documents were discarded on every import —
  // orphaning files that still exist in the storage bucket.
  const stored = [{
    _id: "65f0000000000000000000bb",
    title: "Sign Language Recognition",
    description: "Created and deployed.",
    mediaFiles: [{ filePath: "projects/demo.png", fileType: "image" }],
    documents: [{ filePath: "projects/paper.pdf", fileType: "document" }],
    startDate: new Date("2024-01-01")
  }];

  const merged = importAndMerge({
    existing: stored,
    incoming: [{ title: "sign-language recognition", description: "Rewritten.", projectUrl: "https://example.com/demo" }],
    mapper: importProjects,
    keyOf: mergeKeys.title,
    cap: SECTION_CAPS.projects
  });

  assert.equal(merged.entries.length, 1, "punctuation must not create a second copy of one project");
  assert.equal(merged.entries[0].mediaFiles.length, 1, "attached media must still be attached");
  assert.equal(merged.entries[0].documents.length, 1, "attached documents must still be attached");
  assert.equal(merged.entries[0].mediaFiles[0].filePath, "projects/demo.png");
  assert.ok(merged.entries[0].startDate, "startDate is not something importProjects emits — it must not be erased");
  assert.equal(merged.entries[0].projectUrl, "https://example.com/demo", "an EMPTY field may still be filled by the résumé");
});

test("certification and achievement media survive a re-import", () => {
  const stored = [{ _id: "65f0000000000000000000cc", title: "AWS Certified Developer", media: { filePath: "certs/aws.pdf", fileType: "document" } }];

  const merged = importAndMerge({
    existing: stored,
    incoming: [{ title: "AWS Certified Developer", description: "Associate level." }],
    mapper: importTitledList,
    keyOf: mergeKeys.title,
    cap: SECTION_CAPS.certifications
  });

  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].media.filePath, "certs/aws.pdf", "importTitledList does not emit media, so the merge must keep it");
  assert.equal(merged.entries[0].description, "Associate level.", "the empty description is still fillable");
});

test('"Node.js" against a profile holding "NodeJS" is one skill, spelled the way it already was', () => {
  const merged = mergeStrings({ existing: ["NodeJS", "React"], incoming: ["Node.js", "node js", "Pandas"] });

  assert.deepEqual(merged.values, ["NodeJS", "React", "Pandas"]);
  assert.equal(merged.summary.added, 1);
  assert.equal(merged.summary.matched, 2, "both spellings of Node must match the one already held");
});

test("skill groups merge WITHIN a matched category rather than creating a second heading", () => {
  const existing = importSkillGroups([{ category: "Programming Languages", skills: ["Java", "Python"] }]);
  const incoming = importSkillGroups([
    { category: "programming languages", skills: ["Python", "Go"] },
    { category: "Machine Learning", skills: ["PyTorch"] }
  ]);

  const merged = mergeSkillGroups({ existing, incoming });

  assert.deepEqual(merged.groups.map((group) => group.category), ["Programming Languages", "Machine Learning"]);
  assert.deepEqual(merged.groups[0].skills, ["Java", "Python", "Go"], "Python was already there; Go is new");
});

test("a cap truncates the INCOMING résumé, never the entries the candidate already had", () => {
  const existing = importProjects(
    Array.from({ length: SECTION_CAPS.projects }, (_, index) => ({ title: `Existing project ${index}` }))
  );
  const merged = importAndMerge({
    existing,
    incoming: [{ title: "Brand new project" }, { title: "Another new project" }],
    mapper: importProjects,
    keyOf: mergeKeys.title,
    cap: SECTION_CAPS.projects
  });

  assert.equal(merged.entries.length, SECTION_CAPS.projects);
  assert.deepEqual(merged.entries, existing, "not one existing project may be evicted to make room");
  assert.equal(merged.summary.truncated, 2, "and the drop is counted so the response can say so");
});

test("an empty parse leaves the section untouched", () => {
  // The original guard, still standing: "the parser found no projects" is not the same statement
  // as "I have no projects".
  const existing = importProjects([{ title: "Sign Language Recognition" }]);
  assert.equal(importProjects([]).length, 0, "nothing parsed means nothing to merge");
  assert.equal(importProjects(undefined).length, 0);

  const merged = importAndMerge({ existing, incoming: [], mapper: importProjects, keyOf: mergeKeys.title, cap: SECTION_CAPS.projects });
  assert.deepEqual(merged.entries, existing);
});

test("replacing a section still refuses to revoke verification or orphan a file", () => {
  /* The per-section escape hatch is for a candidate correcting a badly-parsed first import, so it
     DOES drop entries the résumé no longer mentions. It does not drop the two kinds of thing an
     import never created: manager verification, and files that still exist in the bucket. */
  const existing = [
    { title: "Junk parsed entry" },
    { title: "Real project", mediaFiles: [{ filePath: "projects/demo.png", fileType: "image" }] }
  ];

  const replaced = replaceSection({
    existing,
    incoming: importProjects([{ title: "Correctly parsed project" }]),
    keyOf: mergeKeys.title,
    cap: SECTION_CAPS.projects
  });

  const titles = replaced.entries.map((entry) => entry.title);
  assert.ok(titles.includes("Correctly parsed project"), "the corrected entry is written");
  assert.ok(!titles.includes("Junk parsed entry"), "and the junk the candidate asked to clear is gone");
  assert.ok(titles.includes("Real project"), "but an entry holding an uploaded file is never removed by an import");
  assert.equal(replaced.summary.removed, 1);
  assert.equal(replaced.summary.retainedProtected, 1);
});

test("a verified experience is not deleted by a replace either", () => {
  const replaced = replaceSection({
    existing: [{ jobTitle: "Software Engineer", companyName: "Northwind", verificationStatus: "Verified", trustScore: 92 }],
    incoming: importExperience([{ jobTitle: "Data Scientist", companyName: "Kribud" }]),
    keyOf: mergeKeys.experience,
    cap: SECTION_CAPS.experience
  });

  assert.equal(replaced.entries.length, 2);
  assert.equal(replaced.summary.retainedProtected, 1);
  assert.equal(replaced.entries.find((item) => item.jobTitle === "Software Engineer").verificationStatus, "Verified");
});

test("the review panel's NEW / ALREADY PRESENT labels come from the same keys the merge uses", () => {
  // If these two ever disagreed, the panel would promise one thing and the Save button would do
  // another. previewSection and mergeSection take the same keyOf for exactly that reason.
  const existing = importProjects([{ title: "Sign Language Recognition" }]);
  const incoming = importProjects([{ title: "sign-language recognition" }, { title: "Brand new" }]);

  const flags = previewSection({ existing, incoming, keyOf: mergeKeys.title });
  const merged = mergeSection({ existing, incoming, keyOf: mergeKeys.title, cap: SECTION_CAPS.projects });

  assert.deepEqual(flags.map((flag) => flag.isNew), [false, true]);
  assert.equal(merged.summary.added, flags.filter((flag) => flag.isNew).length, "one label, one outcome");
});
