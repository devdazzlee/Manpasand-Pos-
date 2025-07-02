"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchProducts = exports.getHomeData = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const app_service_1 = __importDefault(require("../services/app.service"));
const apiResponse_1 = require("../utils/apiResponse");
const appService = new app_service_1.default();
exports.getHomeData = (0, asyncHandler_1.default)(async (req, res) => {
    const homeData = await appService.getHomeData();
    new apiResponse_1.ApiResponse(homeData, 'Data fetched successfully', 200).send(res);
});
exports.searchProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const searchedProducts = await appService.searchProducts(req.query.search);
    new apiResponse_1.ApiResponse(searchedProducts, 'Data fetched successfully', 200).send(res);
});
//# sourceMappingURL=app.controller.js.map