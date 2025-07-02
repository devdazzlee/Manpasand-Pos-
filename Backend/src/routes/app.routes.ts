import { Router } from "express";
import { getHomeData, searchProducts } from "../controllers/app.controller";

const router = Router();

router.get("/", getHomeData);
router.get("/products", searchProducts);

export default router;
