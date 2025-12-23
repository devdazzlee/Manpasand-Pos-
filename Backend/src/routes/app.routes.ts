import { Router } from "express";
import { getHomeData, searchProducts, getProductById } from "../controllers/app.controller";

const router = Router();

router.get("/", getHomeData);
router.get("/products", searchProducts);
router.get("/products/:id", getProductById);

export default router;
