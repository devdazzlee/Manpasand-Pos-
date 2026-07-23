import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
    getSalesController,
    getSalesForReturnsController,
    getReturnTransactionsController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
    getTodaySalesController,
    getRecentSaleItemProductNameAndPrice,
    getHoldSalesController,
    createHoldSaleController,
    retrieveHoldSaleController,
    deleteHoldSaleController,
    cancelSaleController,
    updateSaleController,
    deleteSaleController,
} from "../controllers/sale.controller";
import { createSaleSchema, refundSaleSchema } from "../validations/sale.validation";

const router = Router();
const holdSaleRoles = [
    "SUPER_ADMIN",
    "ADMIN",
    "BRANCH_MANAGER",
    "WAREHOUSE_MANAGER",
    "PURCHASE_MANAGER",
];
const saleManagementRoles = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER"];
const metadataRoles = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER", "WAREHOUSE_MANAGER", "PURCHASE_MANAGER"];
const adminRoles = ["SUPER_ADMIN", "ADMIN"];

router.use(authenticate);
router.use("/hold", authorize(holdSaleRoles));

// Hold-sale operations should be available to any authenticated staff role.
router.get("/hold", getHoldSalesController);
router.post("/hold", createHoldSaleController);
router.post("/hold/:holdSaleId/retrieve", retrieveHoldSaleController);
router.delete("/hold/:holdSaleId", deleteHoldSaleController);

router.use(authorize(saleManagementRoles));

router.get("/recent", authorize(metadataRoles), getRecentSaleItemProductNameAndPrice);
router.get("/today", getTodaySalesController);
router.get("/for-returns", getSalesForReturnsController);
router.get("/return-transactions", getReturnTransactionsController);
router.get("/", getSalesController);
router.get("/:saleId", getSaleByIdController);
router.post("/", validate(createSaleSchema), createSaleController);
router.patch("/:saleId/refund", validate(refundSaleSchema), refundSaleController);
router.patch("/:saleId/cancel", authorize(adminRoles), cancelSaleController);
router.patch("/:saleId", updateSaleController);
router.delete("/:saleId", deleteSaleController);

export default router;
