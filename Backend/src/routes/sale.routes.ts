import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
    getSalesController,
    getSalesForReturnsController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
    getTodaySalesController,
    getRecentSaleItemProductNameAndPrice,
} from "../controllers/sale.controller";
import { createSaleSchema, refundSaleSchema } from "../validations/sale.validation";

const router = Router();

router.use(authenticate, authorize(["SUPER_ADMIN", "ADMIN"]));

router.get("/recent", getRecentSaleItemProductNameAndPrice);
router.get("/today", getTodaySalesController);
router.get("/for-returns", getSalesForReturnsController);
router.get("/", getSalesController);
router.get("/:saleId", getSaleByIdController);
router.post("/", validate(createSaleSchema), createSaleController);
router.patch("/:saleId/refund", validate(refundSaleSchema), refundSaleController);

export default router;
