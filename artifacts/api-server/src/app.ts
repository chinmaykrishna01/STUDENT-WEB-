import express, { type Express } from "express";
import { request as httpRequest } from "node:http";
import path from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const webRoot = path.resolve(import.meta.dirname, "../../specforge/dist/public");
const generatorRoot = path.resolve(import.meta.dirname, "public/generator");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use("/api/v1", (req, res) => {
  const port = Number(process.env.SUBMISSION_API_PORT ?? 3003);
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port,
      method: req.method,
      path: `/api/v1${req.url}`,
      headers: {
        "content-type": req.headers["content-type"] ?? "",
        ...(req.headers["content-length"]
          ? { "content-length": req.headers["content-length"] }
          : {}),
        accept: req.headers.accept ?? "application/json",
        ...(req.headers["x-llm-provider"]
          ? { "x-llm-provider": req.headers["x-llm-provider"] }
          : {}),
        ...(req.headers["x-llm-key"]
          ? { "x-llm-key": req.headers["x-llm-key"] }
          : {}),
        ...(req.headers["x-llm-model"]
          ? { "x-llm-model": req.headers["x-llm-model"] }
          : {}),
      },
    },
    (response) => {
      res.status(response.statusCode ?? 502);
      if (response.headers["content-type"]) {
        res.setHeader("content-type", response.headers["content-type"]);
      }
      response.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    logger.error({ err: error }, "Submission generator API is unavailable");
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: {
          code: "GENERATOR_UNAVAILABLE",
          message: "The submission generator is unavailable. Restart the local app.",
        },
      });
    }
  });
  req.pipe(upstream);
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/generator", express.static(generatorRoot));
app.use("/generator", (req, res, next) => {
  if (req.method === "GET") {
    res.sendFile(path.join(generatorRoot, "index.html"), (error) => {
      if (error) next(error);
    });
    return;
  }
  next();
});
app.use(express.static(webRoot));
app.use((req, res, next) => {
  if (
    req.method !== "GET" ||
    req.path === "/api" ||
    req.path.startsWith("/api/")
  ) {
    next();
    return;
  }

  res.sendFile(path.join(webRoot, "index.html"), (error) => {
    if (error) next(error);
  });
});

export default app;
