import assert from "node:assert/strict";
import test from "node:test";
import { proposeMappings, validateCourse } from "../src/lib/specforge-processing.ts";

function courseData(overrides = {}) {
  return {
    title: "Foundations of Computing",
    courseCode: "CS101",
    credits: 3,
    teachingHours: {
      lecture: 24,
      tutorial: 0,
      practical: 0,
      summaryTotal: 24,
      syllabusTotal: 24,
    },
    syllabusUnits: [{ id: "I", title: "Foundations", hours: 24 }],
    outcomes: [
      {
        id: "CO1",
        text: "Explain core computing concepts.",
        bloomLevel: "Understand",
      },
    ],
    assessments: [],
    programmeOutcomes: [
      {
        id: "PO1",
        title: "Knowledge",
        description: "Apply computing concepts to practical problems.",
        type: "PO",
      },
    ],
    mappings: [],
    questionCoReferences: [],
    institutionalRulesProvided: false,
    ...overrides,
  };
}

const issueCodes = (issues) => issues.map((issue) => issue.code);

test("detects duplicate course outcome identifiers", () => {
  const data = courseData({
    outcomes: [
      { id: "CO1", text: "Explain core computing concepts.", bloomLevel: "Understand" },
      { id: "CO1", text: "Apply computing concepts.", bloomLevel: "Apply" },
    ],
  });

  const issue = validateCourse("Course specification", "", data, "").find(
    (entry) => entry.code === "duplicate-course-outcome",
  );
  assert.ok(issue);
  assert.equal(issue.severity, "error");
  assert.match(issue.evidence, /More than one outcome uses CO1/);
});

test("reports a summary and syllabus hour mismatch with a review value", () => {
  const data = courseData({
    teachingHours: {
      lecture: 24,
      tutorial: 0,
      practical: 0,
      summaryTotal: 24,
      syllabusTotal: 16,
    },
    syllabusUnits: [{ id: "I", title: "Foundations", hours: 16 }],
  });

  const issue = validateCourse("Course specification", "", data, "").find(
    (entry) => entry.code === "syllabus-hours-mismatch",
  );
  assert.ok(issue);
  assert.equal(issue.suggestedValue, "16");
  assert.equal(issue.status, "pending");
});

test("flags blueprint references that do not exist in the course outcomes", () => {
  const issues = validateCourse("Course specification", "Question 1: CO1; Question 2: CO9", courseData(), "");
  const dangling = issues.find((entry) => entry.code === "invalid-blueprint-co-reference");

  assert.ok(dangling);
  assert.match(dangling.evidence, /CO9/);
});

test("checks credits only when an explicit institutional rule is supplied", () => {
  const data = courseData({
    institutionalRulesProvided: false,
    teachingHours: {
      lecture: 24,
      tutorial: 0,
      practical: 0,
      summaryTotal: 24,
      syllabusTotal: 24,
    },
  });
  const rule = JSON.stringify({ creditHoursPerCredit: 10 });

  assert.equal(
    issueCodes(validateCourse("Course specification", "", data, rule)).includes(
      "credit-hours-rule-mismatch",
    ),
    false,
  );

  const withSuppliedRule = courseData({
    institutionalRulesProvided: true,
    teachingHours: data.teachingHours,
  });
  const mismatch = validateCourse("Course specification", "", withSuppliedRule, rule).find(
    (entry) => entry.code === "credit-hours-rule-mismatch",
  );
  assert.ok(mismatch);
  assert.match(mismatch.evidence, /10 hours per credit/);
});

test("does not invent programme outcomes or nonzero mapping scores without evidence", () => {
  const outcomes = [{ id: "CO1", text: "Apply secure data records." }];
  const noDefinitions = proposeMappings(outcomes, [], "");
  const noRubric = proposeMappings(
    outcomes,
    [{ id: "PO1", title: "Data", description: "Apply secure data records.", type: "PO" }],
    "",
  );

  assert.deepEqual(noDefinitions, []);
  assert.equal(noRubric.length, 1);
  assert.equal(noRubric[0].score, 0);
  assert.match(noRubric[0].evidence, /No matching institutional score rubric/);
});

test("uses only a compatible supplied rubric for nonzero mapping scores", () => {
  const mappings = proposeMappings(
    [{ id: "CO1", text: "Apply secure data records." }],
    [{ id: "PO1", title: "Data", description: "Apply secure data records.", type: "PO" }],
    JSON.stringify({
      mappingRubric: { oneTerm: 1, twoTerms: 2, threeOrMoreTerms: 3 },
    }),
  );

  assert.equal(mappings.length, 1);
  assert.equal(mappings[0].score, 3);
  assert.match(mappings[0].evidence, /supplied institutional mappingRubric/);
});
