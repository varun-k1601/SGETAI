const test = require("node:test");
const assert = require("node:assert/strict");

const { importEducation, importExperience, importProjects } = require("../../controllers/profileController");
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
