import { Router } from "express";
import { validate } from "../middleware/validation.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
    createStockController,
    adjustStockController,
    getStocksController,
    getStockMovementsController,
} from "../controllers/stock.controller";
import { createStockSchema, adjustStockSchema } from "../validations/stock.validation";

const router = Router();

router.use(authenticate, authorize(["SUPER_ADMIN", "ADMIN"]));

router.post("/", validate(createStockSchema), createStockController);
router.patch("/adjust", validate(adjustStockSchema), adjustStockController);
router.get("/", getStocksController);
router.get("/history", getStockMovementsController);

export default router;