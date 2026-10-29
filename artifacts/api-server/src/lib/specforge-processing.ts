import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import mammoth from "mammoth";
import { load } from "cheerio";
import { OfficeParser, type SupportedFileType } from "officeparser";
import WordExtractor from "word-extractor";
import type {
  Analysis,
  Assessment,
  CourseData,
  CourseOutcome,
  OutcomeMapping,
  ProgrammeOutcome,
  SourceFile,
  SyllabusUnit,
  ValidationIssue,
} from "@workspace/api-zod";

const MAX_EXTRACTED_CHARS = 120_000;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in",
  "into", "is", "of", "on", "or", "the", "to", "with", "will", "students",
  "student", "able", "their", "this", "that", "through", "using",
]);

type SourceRole = SourceFile["role"];
type UploadedFiles = Partial<Record<SourceRole, Express.Multer.File>>;
const officeParserFileTypes: Partial<Record<string, SupportedFileType>> = {
  ".pdf": "pdf",
  ".pptx": "pptx",
  ".xlsx": "xlsx",
  ".odt": "odt",
  ".odp": "odp",
  ".ods": "ods",
  ".odg": "odg",
  ".rtf": "rtf",
  ".epub": "epub",
  ".tex": "tex",
};

function htmlText(html: string): string {
  return load(html).text().replace(/\s+/g, " ").trim();
}

function getExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

async function readUpload(
  file: Express.Multer.File,
  role: SourceRole,
): Promise<{ sourceFile: SourceFile; originalText: string }> {
  const extension = getExtension(file.originalname);
  let text = "";

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result.value;
    if (!text.trim()) {
      throw new Error(`${file.originalname} did not contain readable text.`);
    }
  } else if (extension === ".doc") {
    const document = await new WordExtractor().extract(file.buffer);
    text = document.getBody();
  } else if (officeParserFileTypes[extension]) {
    const document = await OfficeParser.parseOffice(file.buffer, {
      fileType: officeParserFileTypes[extension],
    });
    text = (await document.to("text")).value;
  } else if (extension === ".html" || extension === ".htm") {
    const html = file.buffer.toString("utf8");
    text = htmlText(html);
  } else if (extension === ".json") {
    const raw = file.buffer.toString("utf8");
    const parsed: unknown = JSON.parse(raw);
    text = JSON.stringify(parsed, null, 2);
  } else {
    text = file.buffer.toString("utf8");
  }

  if (!text.trim()) {
    throw new Error(`${file.originalname} is empty or contains no readable text.`);
  }

  const limitedText = text.slice(0, MAX_EXTRACTED_CHARS);
  return {
    sourceFile: {
      id: randomUUID(),
      role,
      filename: file.originalname,
      fileType: extension.replace(".", "").toUpperCase(),
      status: "processed",
      extractedText: limitedText,
    },
    originalText: limitedText,
  };
}

function labelValue(text: string, labels: string): string | undefined {
  const expression = new RegExp(
    `(?:^|\\n)\\s*(?:${labels})\\s*[:\\-–]\\s*([^\\n]+)`,
    "i",
  );
  return text.match(expression)?.[1]?.trim();
}

function numberAfter(pattern: RegExp, text: string): number | null {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOutcomeId(value: string): string {
  const number = value.match(/\d+/)?.[0];
  return number ? `CO${Number(number)}` : value.toUpperCase().replace(/\s+/g, "");
}

function inferBloomLevel(outcome: string): string | null {
  const actionPhrase = outcome
    .replace(/^(?:students? will be able to|learners? will be able to|to)\s+/i, "")
    .trim();
  const firstVerb = actionPhrase.match(/^([a-z]+)/i)?.[1]?.toLowerCase();
  if (!firstVerb) return null;

  const levels: Record<string, string[]> = {
    Remember: ["define", "identify", "list", "name", "recall", "recognize", "state"],
    Understand: ["classify", "describe", "discuss", "explain", "interpret", "outline", "summarize"],
    Apply: ["apply", "calculate", "demonstrate", "implement", "operate", "solve", "use"],
    Analyze: ["analyze", "compare", "contrast", "differentiate", "examine", "investigate"],
    Evaluate: ["assess", "critique", "defend", "evaluate", "justify", "validate"],
    Create: ["construct", "create", "design", "develop", "formulate", "propose"],
  };

  return (
    Object.entries(levels).find(([, verbs]) => verbs.includes(firstVerb))?.[0] ??
    null
  );
}

function extractCourseOutcomes(text: string): CourseOutcome[] {
  const outcomes: CourseOutcome[] = [];
  const pattern =
    /(?:^|\n)\s*(?:Course\s+Outcome\s+)?(CO\s*[- ]?\s*\d+)\s*[:.)–-]\s*([^\n]+)/gi;

  for (const match of text.matchAll(pattern)) {
    const id = normalizeOutcomeId(match[1] ?? "");
    let outcomeText = (match[2] ?? "").trim();
    const explicitBloom = outcomeText.match(
      /\bBloom(?:'s)?(?:\s+Taxonomy)?(?:\s+Level)?\s*[:=]\s*([A-Za-z]+)/i,
    )?.[1];
    outcomeText = outcomeText
      .replace(/\bBloom(?:'s)?(?:\s+Taxonomy)?(?:\s+Level)?\s*[:=]\s*[A-Za-z]+/i, "")
      .trim();
    outcomes.push({
      id,
      text: outcomeText,
      bloomLevel: explicitBloom ?? inferBloomLevel(outcomeText),
    });
  }

  return outcomes;
}

function parseUnits(text: string): SyllabusUnit[] {
  const lines = text.split(/\r?\n/);
  const units: SyllabusUnit[] = [];
  const unitPattern = /^\s*(?:Unit|Module)\s+([IVXLC]+|\d+)\s*[:.)–-]\s*(.+)$/i;

  for (const line of lines) {
    const match = line.match(unitPattern);
    if (!match) continue;
    const id = match[1]?.toUpperCase() ?? String(units.length + 1);
    const rawTitle = match[2]?.trim() ?? "";
    const hours = numberAfter(
      /(\d+(?:\.\d+)?)\s*(?:contact\s*)?(?:hours?|hrs?)\b/i,
      rawTitle,
    ) ?? 0;
    const title = rawTitle
      .replace(/\(?\s*\d+(?:\.\d+)?\s*(?:contact\s*)?(?:hours?|hrs?)\s*\)?/i, "")
      .trim();
    units.push({ id, title: title || `Unit ${id}`, hours });
  }

  return units;
}

function parseProgrammeOutcomes(text: string): ProgrammeOutcome[] {
  const parsed: ProgrammeOutcome[] = [];
  const linePattern = /^\s*(PO|PSO)\s*[- ]?(\d+)\s*[:.)–-]\s*(.+)$/gim;

  for (const match of text.matchAll(linePattern)) {
    const kind = match[1]?.toUpperCase() === "PSO" ? "PSO" : "PO";
    const id = `${kind}${Number(match[2])}`;
    const description = match[3]?.trim() ?? "";
    parsed.push({
      id,
      title: id,
      description,
      type: kind,
    });
  }

  return parsed;
}

function parseCsvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseDefinitions(text: string, filename?: string): ProgrammeOutcome[] {
  if (!text.trim()) return [];
  if (filename && getExtension(filename) === ".json") {
    const value: unknown = JSON.parse(text);
    const records = Array.isArray(value)
      ? value
      : typeof value === "object" && value !== null
        ? ((value as Record<string, unknown>).programmeOutcomes ??
          (value as Record<string, unknown>).outcomes)
        : undefined;
    if (Array.isArray(records)) {
      const rows: ProgrammeOutcome[] = [];
      for (const record of records) {
        if (!record || typeof record !== "object") continue;
        const item = record as Record<string, unknown>;
        const rawId = String(item.id ?? item.code ?? item.outcomeId ?? "");
        const kind =
          String(item.type ?? rawId).toUpperCase().startsWith("PSO") ? "PSO" : "PO";
        const number = rawId.match(/\d+/)?.[0];
        if (!number) continue;
        rows.push({
          id: `${kind}${Number(number)}`,
          title: String(item.title ?? `${kind}${Number(number)}`),
          description: String(item.description ?? item.text ?? item.outcome ?? ""),
          type: kind,
        });
      }
      return rows;
    }
  }
  if (
    filename &&
    [".csv", ".tsv"].includes(getExtension(filename))
  ) {
    const delimiter = getExtension(filename) === ".tsv" ? "\t" : ",";
    const rows = parseCsvRows(text, delimiter);
    if (!rows.length) return [];
    const headers = rows[0]?.map((value) => value.toLowerCase()) ?? [];
    const hasHeader = headers.some((value) => /id|code|type|description|outcome/.test(value));
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const idIndex = hasHeader
      ? Math.max(headers.findIndex((value) => /id|code/.test(value)), 0)
      : 0;
    const descriptionIndex = hasHeader
      ? Math.max(headers.findIndex((value) => /description|outcome|text/.test(value)), 1)
      : 1;
    const typeIndex = hasHeader ? headers.findIndex((value) => /type/.test(value)) : 2;
    const outcomes: ProgrammeOutcome[] = [];
    for (const row of dataRows) {
      const rawId = row[idIndex] ?? "";
      const kind = (row[typeIndex] ?? rawId).toUpperCase().startsWith("PSO")
        ? "PSO"
        : "PO";
      const number = rawId.match(/\d+/)?.[0];
      if (!number || !/^(PO|PSO)/i.test(rawId)) continue;
      const id = `${kind}${Number(number)}`;
      outcomes.push({
        id,
        title: id,
        description: row[descriptionIndex] ?? "",
        type: kind,
      });
    }
    return outcomes;
  }
  return parseProgrammeOutcomes(text);
}

function parseAssessments(text: string): Assessment[] {
  const assessments: Assessment[] = [];
  for (const line of text.split(/\r?\n/)) {
    const percentage = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!percentage) continue;
    if (!/\b(quiz|assignment|exam|test|assessment|project|practical|lab|mid.?term|end.?term)\b/i.test(line)) {
      continue;
    }
    assessments.push({
      name: line.replace(/\s+/g, " ").trim().slice(0, 100),
      weightPercent: Number(percentage[1]),
      courseOutcomeIds: Array.from(
        line.matchAll(/\bCO\s*[- ]?\s*\d+\b/gi),
        (match) => normalizeOutcomeId(match[0]),
      ),
    });
  }
  return assessments;
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function readMappingRubric(rulesText: string): {
  oneTerm?: number;
  twoTerms?: number;
  threeOrMoreTerms?: number;
} {
  if (!rulesText.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(rulesText);
    if (typeof parsed !== "object" || parsed === null) return {};
    const rubric = (parsed as Record<string, unknown>).mappingRubric;
    if (typeof rubric !== "object" || rubric === null) return {};
    const values = rubric as Record<string, unknown>;
    const result = {
      oneTerm: Number(values.oneTerm),
      twoTerms: Number(values.twoTerms),
      threeOrMoreTerms: Number(values.threeOrMoreTerms),
    };
    if (
      [result.oneTerm, result.twoTerms, result.threeOrMoreTerms].every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 3,
      ) &&
      result.oneTerm <= result.twoTerms &&
      result.twoTerms <= result.threeOrMoreTerms
    ) {
      return result;
    }
  } catch {
    return {};
  }
  return {};
}

export function proposeMappings(
  outcomes: CourseOutcome[],
  programmeOutcomes: ProgrammeOutcome[],
  rulesText: string,
): OutcomeMapping[] {
  const rubric = readMappingRubric(rulesText);
  return outcomes.flatMap((outcome) =>
    programmeOutcomes.map((programmeOutcome) => {
      const sharedTerms = [...tokens(outcome.text)].filter((term) =>
        tokens(programmeOutcome.description).has(term),
      );
      const score = sharedTerms.length
        ? sharedTerms.length >= 3
          ? rubric.threeOrMoreTerms ?? 0
          : sharedTerms.length === 2
            ? rubric.twoTerms ?? 0
            : rubric.oneTerm ?? 0
        : 0;
      const evidence = sharedTerms.length
        ? `Possible text evidence: ${sharedTerms.join(", ")}. ${
            score === 0
              ? "No matching institutional score rubric was supplied, so the proposed score remains 0."
              : "The score follows the supplied institutional mappingRubric; this suggestion still needs teacher review."
          }`
        : "No specific shared evidence terms were found. No mapping is asserted.";
      return {
        id: randomUUID(),
        courseOutcomeId: outcome.id,
        programmeOutcomeId: programmeOutcome.id,
        score,
        evidence,
        status: "suggested" as const,
      };
    }),
  );
}

function makeIssue(
  code: string,
  severity: ValidationIssue["severity"],
  title: string,
  source: string,
  evidence: string,
  explanation: string,
  originalValue: string | null = null,
  suggestedValue: string | null = null,
): ValidationIssue {
  return {
    id: randomUUID(),
    code,
    severity,
    title,
    source,
    evidence,
    explanation,
    originalValue,
    suggestedValue,
    status: "pending",
    reviewerComment: null,
  };
}

export function validateCourse(
  courseText: string,
  blueprintText: string,
  courseData: CourseData,
  rulesText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  if (!courseData.title) {
    issues.push(
      makeIssue(
        "missing-course-title",
        "warning",
        "Course title not found",
        "Course specification",
        "No course title label was extracted.",
        "Review the document and enter the title if it is present; SpecForge will not invent one.",
      ),
    );
  }
  if (!courseData.courseCode) {
    issues.push(
      makeIssue(
        "missing-course-code",
        "warning",
        "Course code not found",
        "Course specification",
        "No course code label was extracted.",
        "Add the institutional course code during extraction review if it is present in the source.",
      ),
    );
  }
  if (courseData.credits === null) {
    issues.push(
      makeIssue(
        "missing-credits",
        "warning",
        "Credits not found",
        "Course specification",
        "No credits value was extracted.",
        "Credits are left unresolved because no value was supplied.",
      ),
    );
  }
  if (!courseData.outcomes.length) {
    issues.push(
      makeIssue(
        "missing-course-outcomes",
        "error",
        "No course outcomes found",
        "Course specification",
        "No CO1, CO2, or similarly numbered outcome lines were extracted.",
        "Add or correct the outcomes in extraction review before using mapping or blueprint checks.",
      ),
    );
  }

  for (const outcome of courseData.outcomes) {
    if (seen.has(outcome.id)) {
      issues.push(
        makeIssue(
          "duplicate-course-outcome",
          "error",
          `Duplicate outcome identifier ${outcome.id}`,
          "Course specification",
          `More than one outcome uses ${outcome.id}.`,
          "Each course outcome must have a unique identifier. Review the original wording before changing either entry.",
          outcome.id,
        ),
      );
    }
    seen.add(outcome.id);

    const inferred = inferBloomLevel(outcome.text);
    if (outcome.bloomLevel && inferred && outcome.bloomLevel.toLowerCase() !== inferred.toLowerCase()) {
      issues.push(
        makeIssue(
          `bloom-level-${outcome.id}`,
          "warning",
          `Review Bloom's level for ${outcome.id}`,
          "Course specification",
          `Outcome wording: “${outcome.text}”`,
          `The leading action phrase suggests ${inferred}, while the extracted label is ${outcome.bloomLevel}. This deterministic check is a prompt for review, not a classification decision.`,
          outcome.bloomLevel,
          inferred,
        ),
      );
    } else if (!outcome.bloomLevel) {
      issues.push(
        makeIssue(
          `bloom-level-${outcome.id}`,
          "info",
          `Bloom's level needs review for ${outcome.id}`,
          "Course specification",
          `Outcome wording: “${outcome.text}”`,
          inferred
            ? `The leading action phrase suggests ${inferred}; confirm it against the complete outcome and institutional guidance.`
            : "No reliable leading action phrase was recognized. Review the complete outcome and select a level only when supported.",
          null,
          inferred,
        ),
      );
    }
  }

  const { summaryTotal, syllabusTotal } = courseData.teachingHours;
  if (summaryTotal !== null && courseData.syllabusUnits.length && summaryTotal !== syllabusTotal) {
    issues.push(
      makeIssue(
        "syllabus-hours-mismatch",
        "error",
        "Summary and detailed syllabus hours differ",
        "Course specification",
        `Summary total: ${summaryTotal} hours; extracted syllabus total: ${syllabusTotal} hours.`,
        "The detailed unit total is shown as a possible correction. Verify both source sections before accepting it.",
        String(summaryTotal),
        String(syllabusTotal),
      ),
    );
  }

  if (courseData.institutionalRulesProvided) {
    let creditHoursPerCredit: number | null = null;
    try {
      const rules: unknown = JSON.parse(rulesText);
      if (typeof rules === "object" && rules !== null) {
        const candidate = Number((rules as Record<string, unknown>).creditHoursPerCredit);
        if (Number.isFinite(candidate) && candidate > 0) creditHoursPerCredit = candidate;
      }
    } catch {
      const match = rulesText.match(/(\d+(?:\.\d+)?)\s*(?:contact\s*)?hours?\s*(?:per|=)\s*credit/i);
      if (match?.[1]) creditHoursPerCredit = Number(match[1]);
    }
    if (
      creditHoursPerCredit !== null &&
      courseData.credits !== null &&
      summaryTotal !== null &&
      courseData.credits * creditHoursPerCredit !== summaryTotal
    ) {
      issues.push(
        makeIssue(
          "credit-hours-rule-mismatch",
          "warning",
          "Credits differ from the supplied institutional rule",
          "Course specification and institutional rules",
          `${courseData.credits} credits × ${creditHoursPerCredit} hours per credit = ${courseData.credits * creditHoursPerCredit} hours; extracted summary is ${summaryTotal} hours.`,
          "This comparison uses only the explicit creditHoursPerCredit rule provided with the upload. Confirm the institutional interpretation before changing values.",
          String(summaryTotal),
          String(courseData.credits * creditHoursPerCredit),
        ),
      );
    }
  }

  const knownOutcomeIds = new Set(courseData.outcomes.map((outcome) => outcome.id));
  const references = Array.from(
    blueprintText.matchAll(/\bCO\s*[- ]?\s*\d+\b/gi),
    (match) => normalizeOutcomeId(match[0]),
  );
  courseData.questionCoReferences = [...new Set(references)];
  for (const reference of courseData.questionCoReferences) {
    if (!knownOutcomeIds.has(reference)) {
      issues.push(
        makeIssue(
          "invalid-blueprint-co-reference",
          "error",
          `Blueprint references missing ${reference}`,
          "Question-paper blueprint",
          `The blueprint refers to ${reference}, which is not in the extracted course outcomes.`,
          "Check the source documents and update the blueprint or add the missing outcome only when supported by the official course specification.",
          reference,
        ),
      );
    }
  }

  if (!courseData.programmeOutcomes.length) {
    issues.push(
      makeIssue(
        "missing-official-outcome-definitions",
        "info",
        "Official PO/PSO definitions not supplied",
        "Outcome definitions upload",
        "No PO or PSO definitions were extracted.",
        "The mapping matrix is not fabricated. Upload approved definitions to generate evidence-based candidate links.",
      ),
    );
  }
  if (!courseText.trim()) {
    issues.push(
      makeIssue(
        "empty-course-source",
        "error",
        "Course specification could not be read",
        "Course specification",
        "No extractable text was returned.",
        "Try a supported document with selectable text. Scanned files require OCR, which is not enabled in this build.",
      ),
    );
  }

  return issues;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderList(items: string[]): string {
  return items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>Not supplied.</p>";
}

function generateCorrectedHtml(
  templateHtml: string | null,
  courseData: CourseData,
  unresolvedFields: string[],
): string {
  const hours = courseData.teachingHours;
  const unitRows = courseData.syllabusUnits
    .map((unit) => `<tr><td>${escapeHtml(unit.id)}</td><td>${escapeHtml(unit.title)}</td><td>${unit.hours}</td></tr>`)
    .join("");
  const outcomeRows = courseData.outcomes
    .map((outcome) => `<tr><td>${escapeHtml(outcome.id)}</td><td>${escapeHtml(outcome.text)}</td><td>${escapeHtml(outcome.bloomLevel ?? "Needs review")}</td></tr>`)
    .join("");
  const mappingRows = courseData.mappings
    .map((mapping) => {
      const po = courseData.programmeOutcomes.find((item) => item.id === mapping.programmeOutcomeId);
      return `<tr><td>${escapeHtml(mapping.courseOutcomeId)}</td><td>${escapeHtml(po?.id ?? mapping.programmeOutcomeId)}</td><td>${mapping.score}</td><td>${escapeHtml(mapping.evidence)}</td></tr>`;
    })
    .join("");
  const placeholderValues: Record<string, string> = {
    COURSE_TITLE: escapeHtml(courseData.title || "Not supplied"),
    COURSE_CODE: escapeHtml(courseData.courseCode || "Not supplied"),
    CREDITS: courseData.credits === null ? "Not supplied" : String(courseData.credits),
    TEACHING_HOURS: `<p>Lecture: ${hours.lecture}; Tutorial: ${hours.tutorial}; Practical: ${hours.practical}; Summary: ${hours.summaryTotal ?? "Not supplied"}; Syllabus units: ${hours.syllabusTotal}</p>`,
    SYLLABUS_UNITS: `<table><thead><tr><th>Unit</th><th>Topic</th><th>Hours</th></tr></thead><tbody>${unitRows}</tbody></table>`,
    COURSE_OUTCOMES: `<table><thead><tr><th>Outcome</th><th>Description</th><th>Bloom’s level</th></tr></thead><tbody>${outcomeRows}</tbody></table>`,
    ASSESSMENTS: renderList(courseData.assessments.map((assessment) => `${assessment.name}${assessment.weightPercent === null ? "" : ` (${assessment.weightPercent}%)`}`)),
    PO_PSO_MATRIX: `<table><thead><tr><th>CO</th><th>PO/PSO</th><th>Score</th><th>Evidence / review note</th></tr></thead><tbody>${mappingRows}</tbody></table>`,
    UNRESOLVED_FIELDS: renderList(unresolvedFields),
  };
  const fictionalNotice = courseData.title.startsWith("Fictional Demo:")
    ? `<p class="specforge-demo-notice"><strong>FICTIONAL DEMO DATA.</strong> This example does not represent a real course, outcome definition, or institutional policy.</p>`
    : "";
  const warning = `${fictionalNotice}<p class="specforge-draft-notice"><strong>DRAFT — Requires human review.</strong> Suggested corrections and mappings are not institutional approvals.</p>`;

  if (!templateHtml?.trim()) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(courseData.title || "Course specification")} — Draft</title><style>body{font:16px/1.55 Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#17243c}table{border-collapse:collapse;width:100%;margin:12px 0 24px}td,th{border:1px solid #ccd5e3;padding:8px;text-align:left;vertical-align:top}.specforge-draft-notice{padding:12px;background:#fff4d6;border-left:4px solid #d49b1c}</style></head><body>${warning}<h1>${escapeHtml(courseData.title || "Course title not supplied")}</h1><p>Course code: ${escapeHtml(courseData.courseCode || "Not supplied")} · Credits: ${courseData.credits ?? "Not supplied"}</p><h2>Teaching hours</h2>${placeholderValues.TEACHING_HOURS}<h2>Syllabus units</h2>${placeholderValues.SYLLABUS_UNITS}<h2>Course outcomes</h2>${placeholderValues.COURSE_OUTCOMES}<h2>Assessments</h2>${placeholderValues.ASSESSMENTS}<h2>CO–PO–PSO mapping</h2>${placeholderValues.PO_PSO_MATRIX}<h2>Unresolved fields</h2>${placeholderValues.UNRESOLVED_FIELDS}</body></html>`;
  }

  let html = templateHtml;
  let usedPlaceholder = false;
  for (const [key, value] of Object.entries(placeholderValues)) {
    const token = `{{${key}}}`;
    if (html.includes(token)) usedPlaceholder = true;
    html = html.replaceAll(token, value);
  }
  const $ = load(html);
  let insertedByHeading = false;
  const sections: Array<{ pattern: RegExp; content: string }> = [
    { pattern: /course outcomes|learning outcomes/i, content: placeholderValues.COURSE_OUTCOMES },
    { pattern: /syllabus|course content|units/i, content: placeholderValues.SYLLABUS_UNITS },
    { pattern: /teaching hours|contact hours/i, content: placeholderValues.TEACHING_HOURS },
    { pattern: /assessment/i, content: placeholderValues.ASSESSMENTS },
    { pattern: /co\s*[-–—]\s*po|mapping matrix|outcome mapping/i, content: placeholderValues.PO_PSO_MATRIX },
  ];
  $("h1,h2,h3,h4,h5,h6").each((_, element) => {
    const heading = $(element);
    const headingText = heading.text().trim();
    const section = sections.find((item) => item.pattern.test(headingText));
    if (section && !heading.next().hasClass("specforge-generated-section")) {
      heading.after(`<div class="specforge-generated-section">${section.content}</div>`);
      insertedByHeading = true;
    }
  });
  for (const [key, value] of Object.entries(placeholderValues)) {
    if (key === "UNRESOLVED_FIELDS") continue;
    if (!usedPlaceholder && !insertedByHeading) break;
    if (html.includes(`{{${key}}}`)) html = html.replaceAll(`{{${key}}}`, value);
  }
  if (!$("body").length) $("html").append("<body></body>");
  $("body").prepend(warning);
  return $.html();
}

function templateHasInsertionPoint(templateHtml: string): boolean {
  if (/\{\{(?:COURSE_TITLE|COURSE_CODE|CREDITS|TEACHING_HOURS|SYLLABUS_UNITS|COURSE_OUTCOMES|ASSESSMENTS|PO_PSO_MATRIX|UNRESOLVED_FIELDS)\}\}/.test(templateHtml)) {
    return true;
  }
  const $ = load(templateHtml);
  return $("h1,h2,h3,h4,h5,h6").toArray().some((element) =>
    /course outcomes|learning outcomes|syllabus|course content|units|teaching hours|contact hours|assessment|co\s*[-–—]\s*po|mapping matrix|outcome mapping/i.test(
      $(element).text(),
    ),
  );
}

function unresolvedFor(
  courseData: CourseData,
  hasTemplate: boolean,
  templateHtml?: string | null,
): string[] {
  const fields: string[] = [];
  if (!courseData.title) fields.push("Course title was not extracted.");
  if (!courseData.courseCode) fields.push("Course code was not extracted.");
  if (courseData.credits === null) fields.push("Credits were not extracted.");
  if (!courseData.syllabusUnits.length) fields.push("Syllabus units and hours were not extracted.");
  if (!courseData.outcomes.length) fields.push("Course outcomes were not extracted.");
  if (!courseData.programmeOutcomes.length) fields.push("Official PO/PSO definitions were not supplied.");
  if (!hasTemplate) fields.push("No institutional HTML template was supplied.");
  if (hasTemplate && templateHtml && !templateHasInsertionPoint(templateHtml)) {
    fields.push("No supported placeholders or recognized section headings were found in the supplied template; the original template was preserved without generated course data.");
  }
  return fields;
}

function approvalState(
  issues: ValidationIssue[],
  mappings: OutcomeMapping[],
  unresolvedFields: string[],
): boolean {
  return (
    unresolvedFields.length === 0 &&
    issues.every((issue) => issue.status !== "pending") &&
    mappings.every((mapping) => mapping.score === 0 || mapping.status !== "suggested")
  );
}

export async function buildAnalysis(files: UploadedFiles): Promise<Analysis> {
  const courseFile = files.courseSpecification;
  if (!courseFile) {
    throw new Error("Upload a course specification document to continue.");
  }

  const roles: SourceRole[] = [
    "courseSpecification",
    "blueprint",
    "template",
    "outcomeDefinitions",
    "institutionalRules",
  ];
  const loaded = new Map<SourceRole, { sourceFile: SourceFile; originalText: string }>();
  for (const role of roles) {
    const file = files[role];
    if (file) loaded.set(role, await readUpload(file, role));
  }

  const courseText = loaded.get("courseSpecification")?.originalText ?? "";
  const blueprintText = loaded.get("blueprint")?.originalText ?? "";
  const outcomeFile = files.outcomeDefinitions;
  const rulesText = loaded.get("institutionalRules")?.originalText ?? "";
  const lecture = numberAfter(/\b(?:lecture|lectures|L)\s*(?:hours?|hrs?)?\s*[:=|–-]\s*(\d+(?:\.\d+)?)/i, courseText) ?? 0;
  const tutorial = numberAfter(/\b(?:tutorial|tutorials|T)\s*(?:hours?|hrs?)?\s*[:=|–-]\s*(\d+(?:\.\d+)?)/i, courseText) ?? 0;
  const practical = numberAfter(/\b(?:practical|practicals|P)\s*(?:hours?|hrs?)?\s*[:=|–-]\s*(\d+(?:\.\d+)?)/i, courseText) ?? 0;
  const explicitSummary = numberAfter(
    /\btotal(?:\s+contact)?\s+hours?\s*[:=|–-]\s*(\d+(?:\.\d+)?)/i,
    courseText,
  );
  const units = parseUnits(courseText);
  const outcomes = extractCourseOutcomes(courseText);
  const definitions = outcomeFile
    ? parseDefinitions(
        loaded.get("outcomeDefinitions")?.originalText ?? "",
        outcomeFile.originalname,
      )
    : parseProgrammeOutcomes(loaded.get("outcomeDefinitions")?.originalText ?? "");
  const summaryTotal =
    explicitSummary ??
    (courseText.match(/\b(?:lecture|tutorial|practical|L|T|P)\b/i)
      ? lecture + tutorial + practical
      : null);
  const courseData: CourseData = {
    title: labelValue(courseText, "Course\\s+Title|Subject\\s+Title") ?? "",
    courseCode: labelValue(courseText, "Course\\s+Code|Subject\\s+Code") ?? "",
    credits:
      numberAfter(/\bcredits?\s*[:=|–-]\s*(\d+(?:\.\d+)?)/i, courseText) ??
      numberAfter(/\b(\d+(?:\.\d+)?)\s+credits?\b/i, courseText),
    teachingHours: {
      lecture,
      tutorial,
      practical,
      summaryTotal,
      syllabusTotal: units.reduce((total, unit) => total + unit.hours, 0),
    },
    syllabusUnits: units,
    outcomes,
    assessments: parseAssessments(courseText),
    programmeOutcomes: definitions,
    mappings: [],
    questionCoReferences: [],
    institutionalRulesProvided: Boolean(rulesText.trim()),
  };
  courseData.mappings = proposeMappings(outcomes, definitions, rulesText);
  const issues = validateCourse(courseText, blueprintText, courseData, rulesText);
  const template = files.template
    ? files.template.buffer.toString("utf8")
    : null;
  const unresolvedFields = unresolvedFor(courseData, Boolean(template), template);
  const now = new Date();
  const id = randomUUID();
  const analysis: Analysis = {
    id,
    name: courseData.title || courseFile.originalname,
    courseTitle: courseData.title,
    courseCode: courseData.courseCode,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    sourceFiles: [...loaded.values()].map((value) => value.sourceFile),
    courseData,
    issues,
    templateHtml: template,
    correctedHtml: null,
    unresolvedFields,
    approvalsComplete: false,
  };
  analysis.correctedHtml = generateCorrectedHtml(
    analysis.templateHtml,
    analysis.courseData,
    analysis.unresolvedFields,
  );
  analysis.approvalsComplete = approvalState(
    analysis.issues,
    analysis.courseData.mappings,
    analysis.unresolvedFields,
  );
  return analysis;
}

export function createFictionalDemoAnalysis(): Analysis {
  const now = new Date();
  const courseData: CourseData = {
    title: "Fictional Demo: Foundations of Data Systems",
    courseCode: "DEMO-CS-204",
    credits: 4,
    teachingHours: {
      lecture: 32,
      tutorial: 8,
      practical: 24,
      summaryTotal: 64,
      syllabusTotal: 60,
    },
    syllabusUnits: [
      { id: "I", title: "Relational data models", hours: 16 },
      { id: "II", title: "Query design and transactions", hours: 20 },
      { id: "III", title: "Data integrity and systems", hours: 24 },
    ],
    outcomes: [
      { id: "CO1", text: "Explain relational data models and key constraints.", bloomLevel: "Understand" },
      { id: "CO2", text: "Design queries that retrieve and transform structured data.", bloomLevel: "Create" },
      { id: "CO2", text: "Apply transaction concepts to maintain data integrity.", bloomLevel: "Apply" },
    ],
    assessments: [{ name: "Fictional practical assignment", weightPercent: 20, courseOutcomeIds: ["CO2"] }],
    programmeOutcomes: [
      { id: "PO1", title: "Fictional PO1", description: "Use computing knowledge to solve structured data problems.", type: "PO" },
      { id: "PSO1", title: "Fictional PSO1", description: "Design and evaluate data systems for practical applications.", type: "PSO" },
    ],
    mappings: [],
    questionCoReferences: ["CO1", "CO4"],
    institutionalRulesProvided: false,
  };
  courseData.mappings = proposeMappings(courseData.outcomes, courseData.programmeOutcomes, "");
  const demoCourseText =
    "Fictional demo source only. The course values and outcomes below are invented for interface demonstration; no real course or institutional policy is represented.";
  const demoBlueprintText = "Fictional blueprint references CO1 and CO4.";
  const issues = validateCourse(demoCourseText, demoBlueprintText, courseData, "");
  const unresolvedFields = [
    "All course and outcome data in this example are fictional.",
    "No institutional mapping rubric was supplied; proposed mapping scores remain 0.",
    "No official institutional HTML template was supplied.",
  ];
  const templateHtml = null;
  const analysis: Analysis = {
    id: randomUUID(),
    name: "Fictional demo — Foundations of Data Systems",
    courseTitle: courseData.title,
    courseCode: courseData.courseCode,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    sourceFiles: [
      {
        id: randomUUID(),
        role: "courseSpecification",
        filename: "fictional-demo-course-specification.docx",
        fileType: "DOCX",
        status: "processed",
        extractedText: demoCourseText,
      },
      {
        id: randomUUID(),
        role: "blueprint",
        filename: "fictional-demo-blueprint.csv",
        fileType: "CSV",
        status: "processed",
        extractedText: demoBlueprintText,
      },
    ],
    courseData,
    issues,
    templateHtml,
    correctedHtml: null,
    unresolvedFields,
    approvalsComplete: false,
  };
  analysis.correctedHtml = generateCorrectedHtml(null, courseData, unresolvedFields);
  return analysis;
}

export function updateIssueDecision(
  analysis: Analysis,
  issueId: string,
  status: ValidationIssue["status"],
  reviewerComment: string | null,
): Analysis | null {
  const issue = analysis.issues.find((item) => item.id === issueId);
  if (!issue) return null;
  const issues = analysis.issues.map((item) =>
    item.id === issueId ? { ...item, status, reviewerComment } : item,
  );
  let courseData = analysis.courseData;
  if (status === "accepted" && issue.suggestedValue !== null) {
    if (issue.code === "syllabus-hours-mismatch") {
      const value = Number(issue.suggestedValue);
      if (Number.isFinite(value)) {
        courseData = {
          ...courseData,
          teachingHours: { ...courseData.teachingHours, summaryTotal: value },
        };
      }
    } else if (issue.code.startsWith("bloom-level-")) {
      const outcomeId = issue.code.slice("bloom-level-".length);
      courseData = {
        ...courseData,
        outcomes: courseData.outcomes.map((outcome) =>
          outcome.id === outcomeId
            ? { ...outcome, bloomLevel: issue.suggestedValue }
            : outcome,
        ),
      };
    }
  }
  return refreshAnalysis({ ...analysis, courseData, issues });
}

export function updateAnalysisData(
  analysis: Analysis,
  changes: Partial<Pick<Analysis, "name" | "courseData" | "issues" | "templateHtml" | "correctedHtml" | "unresolvedFields">>,
): Analysis {
  return refreshAnalysis({ ...analysis, ...changes }, changes.courseData !== undefined);
}

export function updateAnalysisMapping(
  analysis: Analysis,
  mappingId: string,
  changes: { score?: number; evidence?: string; status?: OutcomeMapping["status"] },
): Analysis | null {
  const exists = analysis.courseData.mappings.some((mapping) => mapping.id === mappingId);
  if (!exists) return null;
  const mappings = analysis.courseData.mappings.map((mapping) =>
    mapping.id === mappingId ? { ...mapping, ...changes } : mapping,
  );
  return refreshAnalysis({
    ...analysis,
    courseData: { ...analysis.courseData, mappings },
  });
}

function refreshAnalysis(analysis: Analysis, refreshValidation = false): Analysis {
  const courseData: CourseData = {
    ...analysis.courseData,
    teachingHours: { ...analysis.courseData.teachingHours },
    outcomes: [...analysis.courseData.outcomes],
    syllabusUnits: [...analysis.courseData.syllabusUnits],
  };
  const courseText =
    analysis.sourceFiles.find((source) => source.role === "courseSpecification")
      ?.extractedText ?? "";
  const blueprintText =
    analysis.sourceFiles.find((source) => source.role === "blueprint")
      ?.extractedText ?? "";
  const rulesText =
    analysis.sourceFiles.find((source) => source.role === "institutionalRules")
      ?.extractedText ?? "";
  if (refreshValidation) {
    const previousMappings = new Map(
      courseData.mappings.map((mapping) => [
        `${mapping.courseOutcomeId}|${mapping.programmeOutcomeId}`,
        mapping,
      ]),
    );
    courseData.mappings = proposeMappings(
      courseData.outcomes,
      courseData.programmeOutcomes,
      rulesText,
    ).map((mapping) => {
      const previous = previousMappings.get(
        `${mapping.courseOutcomeId}|${mapping.programmeOutcomeId}`,
      );
      return previous?.evidence === mapping.evidence ? { ...mapping, ...previous } : mapping;
    });
  }
  const issues = refreshValidation
    ? (() => {
        const previousIssues = new Map(
          analysis.issues.map((issue) => [`${issue.code}|${issue.evidence}`, issue]),
        );
        return validateCourse(courseText, blueprintText, courseData, rulesText).map(
          (issue) => {
            const previous = previousIssues.get(`${issue.code}|${issue.evidence}`);
            return previous
              ? {
                  ...issue,
                  id: previous.id,
                  status: previous.status,
                  reviewerComment: previous.reviewerComment,
                }
              : issue;
          },
        );
      })()
    : analysis.issues;
  const unresolvedFields = unresolvedFor(
    courseData,
    Boolean(analysis.templateHtml),
    analysis.templateHtml,
  );
  const refreshed: Analysis = {
    ...analysis,
    courseData,
    issues,
    courseTitle: courseData.title,
    courseCode: courseData.courseCode,
    updatedAt: new Date(),
    unresolvedFields,
    correctedHtml: null,
    approvalsComplete: false,
  };
  refreshed.correctedHtml = generateCorrectedHtml(
    refreshed.templateHtml,
    refreshed.courseData,
    refreshed.unresolvedFields,
  );
  refreshed.approvalsComplete = approvalState(
    refreshed.issues,
    refreshed.courseData.mappings,
    refreshed.unresolvedFields,
  );
  return refreshed;
}
