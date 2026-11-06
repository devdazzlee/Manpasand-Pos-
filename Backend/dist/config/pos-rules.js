"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOW_NEGATIVE_STOCK_SALE = exports.REQUIRE_OPEN_REGISTER_FOR_SALE = void 0;
/**
 * Manpasand selling rules.
 *
 * REQUIRE_OPEN_REGISTER_FOR_SALE: when true, a bill can only be made while the
 * branch's cash register is open (and not locked). Manpasand sells without it.
 *
 * ALLOW_NEGATIVE_STOCK_SALE: when true, a product can be sold even if the
 * system shows no stock; its quantity simply goes below zero.
 */
exports.REQUIRE_OPEN_REGISTER_FOR_SALE = false;
exports.ALLOW_NEGATIVE_STOCK_SALE = true;
//# sourceMappingURL=pos-rules.js.map