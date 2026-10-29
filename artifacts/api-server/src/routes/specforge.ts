import { Router, type IRouter, type RequestHandler } from "express";
import multer, { type MulterError } from "multer";
import { desc, eq } from "drizzle-orm";
import { db, specforgeAnalysesTable } from "@workspace/db";
import {
  CreateAnalysisResponse,
  CreateDemoAnalysisResponse,
  GetAnalysesResponse,
  GetAnalysisParams,
  GetAnalysisResponse,
  GetDashboardResponse,
  ReviewIssueBody,
  ReviewIssueParams,
  ReviewIssueResponse,
  UpdateAnalysisBody,
  UpdateAnalysisParams,
  UpdateAnalysisResponse,
  UpdateMappingBody,
  UpdateMappingParams,
  UpdateMappingResponse,
  type Analysis,
} from "@workspace/api-zod";
import {
  buildAnalysis,
  createFictionalDemoAnalysis,
  updateAnalysisData,
  updateAnalysisMapping,
  updateIssueDecision,
} from "../lib/specforge-processing";

const router: IRouter = Router();
const fileExtensions: Record<string, string[]> = {
  courseSpecification: [".docx"],
  blueprint: [".docx", ".csv", ".json", ".txt"],
  template: [".html", ".htm"],
  outcomeDefinitions: [".docx", ".csv", ".json", ".txt"],
  institutionalRules: [".json", ".csv", ".txt"],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter(_req, file, callback) {
    const allowedExtensions = fileExtensions[file.fieldname];
    const dot = file.originalname.lastIndexOf(".");
    const extension = dot >= 0 ? file.originalname.slice(dot).toLowerCase() : "";
    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
      callback(
        new Error(
          `Unsupported file for ${file.fieldname}. Check the accepted file types and try again.`,
        ),
      );
      return;
    }
    callback(null, true);
  },
});

const parseUpload: RequestHandler = (req, res, next) => {
  upload.fields([
    { name: "courseSpecification", maxCount: 1 },
    { name: "blueprint", maxCount: 1 },
    { name: "template", maxCount: 1 },
    { name: "outcomeDefinitions", maxCount: 1 },
    { name: "institutionalRules", maxCount: 1 },
  ])(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const message =
      error instanceof Error ? error.message : "The uploaded files could not be read.";
    req.log.warn({ err: error }, "Rejected SpecForge upload");
    res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: message });
  });
};

function getFileMap(request: Express.Request): Parameters<typeof buildAnalysis>[0] {
  const uploaded = request.files as
    | Record<string, Express.Multer.File[]>
    | undefined;
  const result: Parameters<typeof buildAnalysis>[0] = {};
  for (const [field, items] of Object.entries(uploaded ?? {})) {
    const file = items[0];
    if (
      file &&
      [
        "courseSpecification",
        "blueprint",
        "template",
        "outcomeDefinitions",
        "institutionalRules",
      ].includes(field)
    ) {
      result[field as keyof typeof result] = file;
    }
  }
  return result;
}

async function findAnalysis(id: string): Promise<Analysis | undefined> {
  const [row] = await db
    .select({ data: specforgeAnalysesTable.data })
    .from(specforgeAnalysesTable)
    .where(eq(specforgeAnalysesTable.id, id))
    .limit(1);
  return row?.data as Analysis | undefined;
}

function asDatabaseDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("The saved analysis has an invalid timestamp.");
  }
  return date;
}

async function persistAnalysis(analysis: Analysis): Promise<void> {
  await db
    .insert(specforgeAnalysesTable)
    .values({
      id: analysis.id,
      data: analysis,
      createdAt: asDatabaseDate(analysis.createdAt),
      updatedAt: asDatabaseDate(analysis.updatedAt),
    })
    .onConflictDoUpdate({
      target: specforgeAnalysesTable.id,
      set: {
        data: analysis,
        updatedAt: analysis.updatedAt,
      },
    });
}

router.get("/specforge/dashboard", async (req, res): Promise<void> => {
  const rows = await db
    .select({ data: specforgeAnalysesTable.data })
    .from(specforgeAnalysesTable)
    .orderBy(desc(specforgeAnalysesTable.updatedAt));
  const analyses = rows.map((row) => row.data as Analysis);
  const summary = {
    totalDocumentsAnalyzed: analyses.length,
    detectedIssues: analyses.reduce((total, analysis) => total + analysis.issues.length, 0),
    pendingApprovals: analyses.reduce(
      (total, analysis) =>
        total +
        analysis.issues.filter((issue) => issue.status === "pending").length +
        analysis.courseData.mappings.filter(
          (mapping) => mapping.status === "suggested" && mapping.score > 0,
        ).length,
      0,
    ),
    recentAnalyses: analyses.slice(0, 5),
  };
  req.log.info({ count: analyses.length }, "Loaded SpecForge dashboard");
  res.json(GetDashboardResponse.parse(summary));
});

router.get("/specforge/analyses", async (req, res): Promise<void> => {
  const rows = await db
    .select({ data: specforgeAnalysesTable.data })
    .from(specforgeAnalysesTable)
    .orderBy(desc(specforgeAnalysesTable.updatedAt));
  res.json(GetAnalysesResponse.parse(rows.map((row) => row.data)));
});

router.post(
  "/specforge/analyses",
  parseUpload,
  async (req, res): Promise<void> => {
    try {
      const analysis = await buildAnalysis(getFileMap(req));
      await persistAnalysis(analysis);
      req.log.info({ analysisId: analysis.id }, "Created SpecForge analysis");
      res.status(201).json(CreateAnalysisResponse.parse(analysis));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The uploaded documents could not be processed.";
      req.log.warn({ err: error }, "SpecForge document processing failed");
      res.status(400).json({ error: message });
    }
  },
);

router.post("/specforge/analyses/demo", async (req, res): Promise<void> => {
  const analysis = createFictionalDemoAnalysis();
  await persistAnalysis(analysis);
  req.log.info({ analysisId: analysis.id }, "Created fictional SpecForge demo");
  res.status(201).json(CreateDemoAnalysisResponse.parse(analysis));
});

router.get("/specforge/analyses/:analysisId", async (req, res): Promise<void> => {
  const parsedParams = GetAnalysisParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const analysis = await findAnalysis(parsedParams.data.analysisId);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  res.json(GetAnalysisResponse.parse(analysis));
});

router.patch("/specforge/analyses/:analysisId", async (req, res): Promise<void> => {
  const parsedParams = UpdateAnalysisParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdateAnalysisBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const analysis = await findAnalysis(parsedParams.data.analysisId);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  const updated = updateAnalysisData(analysis, parsedBody.data);
  await persistAnalysis(updated);
  res.json(UpdateAnalysisResponse.parse(updated));
});

router.delete("/specforge/analyses/:analysisId", async (req, res): Promise<void> => {
  const parsedParams = GetAnalysisParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const [deleted] = await db
    .delete(specforgeAnalysesTable)
    .where(eq(specforgeAnalysesTable.id, parsedParams.data.analysisId))
    .returning({ id: specforgeAnalysesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  res.sendStatus(204);
});

router.patch(
  "/specforge/analyses/:analysisId/issues/:issueId",
  async (req, res): Promise<void> => {
    const parsedParams = ReviewIssueParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const parsedBody = ReviewIssueBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const analysis = await findAnalysis(parsedParams.data.analysisId);
    if (!analysis) {
      res.status(404).json({ error: "Analysis not found." });
      return;
    }
    const updated = updateIssueDecision(
      analysis,
      parsedParams.data.issueId,
      parsedBody.data.status,
      parsedBody.data.reviewerComment ?? null,
    );
    if (!updated) {
      res.status(404).json({ error: "Issue not found." });
      return;
    }
    await persistAnalysis(updated);
    res.json(ReviewIssueResponse.parse(updated));
  },
);

router.patch(
  "/specforge/analyses/:analysisId/mappings/:mappingId",
  async (req, res): Promise<void> => {
    const parsedParams = UpdateMappingParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const parsedBody = UpdateMappingBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const analysis = await findAnalysis(parsedParams.data.analysisId);
    if (!analysis) {
      res.status(404).json({ error: "Analysis not found." });
      return;
    }
    const updated = updateAnalysisMapping(
      analysis,
      parsedParams.data.mappingId,
      parsedBody.data,
    );
    if (!updated) {
      res.status(404).json({ error: "Mapping not found." });
      return;
    }
    await persistAnalysis(updated);
    res.json(UpdateMappingResponse.parse(updated));
  },
);

export default router;
