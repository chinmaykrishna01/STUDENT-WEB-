import { Router, type IRouter } from "express";
import healthRouter from "./health";
import specforgeRouter from "./specforge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(specforgeRouter);

export default router;
