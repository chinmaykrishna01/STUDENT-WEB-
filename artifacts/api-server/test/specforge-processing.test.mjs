import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysis,
  proposeMappings,
  validateCourse,
} from "../src/lib/specforge-processing.ts";

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

function pdfWithText(text) {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = Buffer.from(`BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`, "ascii");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const streamHeader = Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "ascii");
  const streamObject = Buffer.concat([
    streamHeader,
    stream,
    Buffer.from("\nendstream", "ascii"),
  ]);
  const bodies = [...objects.map((object) => Buffer.from(object, "ascii")), streamObject];
  let pdf = Buffer.from("%PDF-1.4\n", "ascii");
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(pdf.length);
    pdf = Buffer.concat([
      pdf,
      Buffer.from(`${index + 1} 0 obj\n`, "ascii"),
      body,
      Buffer.from("\nendobj\n", "ascii"),
    ]);
  }
  const xrefOffset = pdf.length;
  const xref = [
    `xref\n0 ${offsets.length}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  return Buffer.concat([pdf, Buffer.from(xref, "ascii")]);
}

test("extracts a selectable-text PDF course specification", async () => {
  const analysis = await buildAnalysis({
    courseSpecification: {
      originalname: "course-specification.pdf",
      buffer: pdfWithText("Course Title: PDF Smoke Test"),
    },
  });

  assert.equal(analysis.sourceFiles[0]?.fileType, "PDF");
  assert.match(analysis.sourceFiles[0]?.extractedText ?? "", /PDF Smoke Test/);
});

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
