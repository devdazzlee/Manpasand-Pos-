import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  pushController,
  pingController,
  listReviewsController,
  resolveReviewController,
} from "../controllers/sync.controller";
import { syncPushSchema } from "../validations/sync.validation";
import { SYNC_ROLES } from "../services/sync.service";

const router = Router();

router.use(authenticate);

router.get("/ping", pingController);
router.post("/push", authorize(SYNC_ROLES), validate(syncPushSchema), pushController);

const reviewRoles = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER"];
router.get("/reviews", authorize(reviewRoles), listReviewsController);
router.patch("/reviews/:id/resolve", authorize(reviewRoles), resolveReviewController);

export default router;
