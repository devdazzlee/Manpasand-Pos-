"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockImportService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const numericBarcodeSku_1 = require("../utils/numericBarcodeSku");
const pagination_1 = require("../utils/pagination");
const period_lock_service_1 = require("./period-lock.service");
const chart_of_accounts_service_1 = require("./chart-of-accounts.service");
const product_service_1 = require("./product.service");
const audit_service_1 = require("./audit.service");
/**
 * Opening-stock import (migration from a previous POS).
 *
 *   preview  → match every row to a branch + product, suggest close names,
 *              flag new products / categories / brands and duplicate files.
 *   create   → saves the batch and its lines (status PROCESSING).
 *   process  → applies the next chunk of lines; the client loops for progress.
 *              The last chunk posts the journal: Dr Inventory / Cr Opening
 *              Balance Equity (Inventory itself is overlaid from live stock, so
 *              the trial balance skips that line — see chart-of-accounts).
 *   reverse  → undoes every applied line, deletes products the import created
 *              (when nothing else uses them) and posts the reversing journal.
 */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const normKey = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const tokens = (v) => normKey(v)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);
const MAX_ROWS = 20000;
const CHUNK_SIZE = 50;
const SUGGESTION_MIN_SCORE = 0.45;
const toNum = (v) => {
    if (v === null || v === undefined)
        return null;
    const s = String(v).replace(/,/g, '').trim();
    if (!s)
        return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};
const clean = (v) => {
    const s = String(v ?? '').trim();
    return s ? s : null;
};
/** Character-bigram Dice similarity — cheap and good enough for product names. */
function similarity(a, b) {
    const grams = (s) => {
        const t = s.replace(/[^a-z0-9]/g, '');
        const out = new Map();
        for (let i = 0; i < t.length - 1; i++) {
            const g = t.slice(i, i + 2);
            out.set(g, (out.get(g) || 0) + 1);
        }
        return { out, size: Math.max(0, t.length - 1) };
    };
    const A = grams(a);
    const B = grams(b);
    if (!A.size || !B.size)
        return 0;
    let hit = 0;
    for (const [g, n] of A.out)
        hit += Math.min(n, B.out.get(g) || 0);
    return (2 * hit) / (A.size + B.size);
}
class Catalog {
    byCode = new Map();
    byName = new Map();
    byId = new Map();
    byToken = new Map();
    constructor(products) {
        for (const p of products) {
            this.byId.set(p.id, p);
            for (const c of [p.sku, p.code, p.custom_code, p.label_barcode]) {
                const k = normKey(c);
                if (k && !this.byCode.has(k))
                    this.byCode.set(k, p);
            }
            const n = normKey(p.name);
            if (n && !this.byName.has(n))
                this.byName.set(n, p);
            for (const t of new Set(tokens(p.name))) {
                const list = this.byToken.get(t) || [];
                list.push(p);
                this.byToken.set(t, list);
            }
        }
    }
    find(code, name) {
        const byCode = code ? this.byCode.get(normKey(code)) : undefined;
        if (byCode)
            return { product: byCode, by: 'code' };
        const byName = name ? this.byName.get(normKey(name)) : undefined;
        if (byName)
            return { product: byName, by: 'name' };
        return null;
    }
    /** Top matches by name, only scoring products that share a word with the query. */
    suggest(name, limit = 3) {
        if (!name)
            return [];
        const q = normKey(name);
        const candidates = new Set();
        for (const t of tokens(name)) {
            const list = this.byToken.get(t);
            // Very common words ("suit", "red") alone would pull in half the catalog.
            if (list && list.length <= 400)
                list.forEach((p) => candidates.add(p));
        }
        return [...candidates]
            .map((p) => ({ id: p.id, name: p.name, sku: p.sku, score: round2(similarity(q, normKey(p.name))) }))
            .filter((s) => s.score >= SUGGESTION_MIN_SCORE)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
}
async function loadCatalog() {
    const products = await client_2.prisma.product.findMany({
        select: {
            id: true,
            name: true,
            sku: true,
            code: true,
            custom_code: true,
            label_barcode: true,
            purchase_rate: true,
            sales_rate_inc_dis_and_tax: true,
        },
    });
    return new Catalog(products);
}
const newBatchReference = () => `OSI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
async function nextVoucherNo(tx) {
    const last = await tx.journalVoucher.findFirst({
        where: { voucher_no: { startsWith: 'JV-' } },
        orderBy: { voucher_no: 'desc' },
        select: { voucher_no: true },
    });
    const n = last ? Number(last.voucher_no.slice(3)) || 0 : 0;
    return `JV-${String(n + 1).padStart(6, '0')}`;
}
class StockImportService {
    products = new product_service_1.ProductService();
    accounts = new chart_of_accounts_service_1.ChartOfAccountsService();
    /* =========================== preview =========================== */
    async preview(rows, opts) {
        if (!rows.length)
            throw new apiError_1.AppError(400, 'The file has no rows');
        if (rows.length > MAX_ROWS)
            throw new apiError_1.AppError(400, `At most ${MAX_ROWS} rows per import — split the file`);
        const [branches, catalog, categories, brands] = await Promise.all([
            client_2.prisma.branch.findMany({ where: { is_active: true }, select: { id: true, name: true, code: true } }),
            loadCatalog(),
            client_2.prisma.category.findMany({ select: { name: true } }),
            client_2.prisma.brand.findMany({ select: { name: true } }),
        ]);
        const branchByKey = new Map();
        for (const b of branches) {
            branchByKey.set(normKey(b.name), b);
            branchByKey.set(normKey(b.code), b);
            branchByKey.set(normKey(b.id), b);
        }
        const defaultBranch = opts.defaultBranchId ? branches.find((b) => b.id === opts.defaultBranchId) || null : null;
        if (opts.defaultBranchId && !defaultBranch)
            throw new apiError_1.AppError(400, 'Default branch not found');
        // First pass: branch + product resolution.
        const out = rows.map((r) => {
            const sku = clean(r.sku);
            const name = clean(r.name);
            const qty = toNum(r.quantity);
            const base = {
                rowNo: r.rowNo,
                status: 'error',
                warnings: [],
                branchId: null,
                branchName: null,
                productId: null,
                productName: null,
                productSku: null,
                sku,
                name,
                quantity: qty ?? 0,
                currentQty: null,
                change: null,
                unitCost: toNum(r.unitCost),
                value: null,
                suggestions: [],
                category: clean(r.category),
                brand: clean(r.brand),
                size: clean(r.size),
                color: clean(r.color),
                salePrice: toNum(r.salePrice),
            };
            if (r.skip)
                return { ...base, status: 'skipped', message: 'Skipped by you' };
            const branchText = clean(r.branch);
            const branch = branchText ? branchByKey.get(normKey(branchText)) : defaultBranch;
            if (branch) {
                base.branchId = branch.id;
                base.branchName = branch.name;
            }
            if (!sku && !name)
                return { ...base, message: 'No SKU/code or product name' };
            if (qty === null)
                return { ...base, message: 'Quantity is not a number' };
            if (qty < 0)
                return { ...base, message: 'Quantity cannot be negative' };
            if (opts.mode === 'ADD' && qty === 0)
                return { ...base, status: 'skipped', message: 'Quantity is 0 — nothing to add' };
            if (base.unitCost !== null && base.unitCost < 0)
                return { ...base, message: 'Cost cannot be negative' };
            if (!branch) {
                return {
                    ...base,
                    message: branchText ? `Branch "${branchText}" not found` : 'No branch — add a Branch column or choose a default branch',
                };
            }
            const manual = r.productId ? catalog.byId.get(r.productId) : undefined;
            if (r.productId && !manual)
                return { ...base, message: 'Chosen product no longer exists' };
            const hit = manual ? { product: manual, by: 'manual' } : catalog.find(sku, name);
            if (hit) {
                return {
                    ...base,
                    status: 'matched',
                    matchedBy: hit.by,
                    productId: hit.product.id,
                    productName: hit.product.name,
                    productSku: hit.product.sku,
                };
            }
            base.suggestions = catalog.suggest(name);
            if (opts.createMissing && name) {
                return { ...base, status: 'new', message: 'New product will be created' };
            }
            return {
                ...base,
                status: 'unmatched',
                message: name ? 'No product with this SKU/code or name' : 'Not found — add a product name to create it',
            };
        });
        // Current on-hand for matched rows, one query per branch set.
        const matched = out.filter((r) => r.status === 'matched');
        const stockRows = matched.length
            ? await client_2.prisma.stock.findMany({
                where: {
                    product_id: { in: [...new Set(matched.map((r) => r.productId))] },
                    branch_id: { in: [...new Set(matched.map((r) => r.branchId))] },
                },
                select: { product_id: true, branch_id: true, current_quantity: true },
            })
            : [];
        const onHand = new Map(stockRows.map((s) => [`${s.product_id}:${s.branch_id}`, (0, helpers_1.asNumber)(s.current_quantity)]));
        // Same product + branch listed more than once is merged on save — say so.
        const seen = new Map();
        for (const r of out) {
            if (r.status !== 'matched' && r.status !== 'new')
                continue;
            const key = `${r.productId || `new:${normKey(r.sku || r.name)}`}:${r.branchId}`;
            seen.set(key, (seen.get(key) || 0) + 1);
        }
        const existingCategories = new Set(categories.map((c) => normKey(c.name)));
        const existingBrands = new Set(brands.map((b) => normKey(b.name)));
        const newCategories = new Set();
        const newBrands = new Set();
        const newProducts = new Set();
        for (const r of out) {
            if (r.status === 'matched') {
                const product = catalog.byId.get(r.productId);
                const current = onHand.get(`${r.productId}:${r.branchId}`) ?? 0;
                const productCost = (0, helpers_1.asNumber)(product.purchase_rate);
                const cost = opts.updateCost || productCost <= 0 ? r.unitCost ?? productCost : productCost;
                if (!opts.updateCost && r.unitCost !== null && productCost > 0 && Math.abs(r.unitCost - productCost) >= 0.01) {
                    r.warnings.push(`File cost ${r.unitCost} differs from product cost ${productCost} — product cost kept`);
                }
                r.currentQty = current;
                r.change = round3(opts.mode === 'ADD' ? r.quantity : r.quantity - current);
                r.unitCost = cost;
                r.value = round2(r.change * cost);
                if (opts.mode === 'SET' && r.change === 0)
                    r.warnings.push('Already at this quantity — no change');
            }
            else if (r.status === 'new') {
                r.currentQty = 0;
                r.change = r.quantity;
                r.unitCost = r.unitCost ?? 0;
                r.value = round2(r.quantity * r.unitCost);
                if (!r.unitCost)
                    r.warnings.push('No cost — stock will be valued at 0');
                if (r.category && !existingCategories.has(normKey(r.category)))
                    newCategories.add(r.category);
                if (r.brand && !existingBrands.has(normKey(r.brand)))
                    newBrands.add(r.brand);
                newProducts.add(normKey(r.sku || r.name));
            }
            if (r.status === 'matched' || r.status === 'new') {
                const key = `${r.productId || `new:${normKey(r.sku || r.name)}`}:${r.branchId}`;
                const n = seen.get(key) || 0;
                if (n > 1)
                    r.warnings.push(`Listed ${n} times for this branch — quantities will be added together`);
            }
        }
        const ready = out.filter((r) => r.status === 'matched' || r.status === 'new');
        const duplicates = await this.findDuplicates(opts.fileChecksum, opts.sourceReference);
        return {
            rows: out,
            summary: {
                total: out.length,
                matched: out.filter((r) => r.status === 'matched').length,
                newProducts: newProducts.size,
                newRows: out.filter((r) => r.status === 'new').length,
                unmatched: out.filter((r) => r.status === 'unmatched').length,
                errors: out.filter((r) => r.status === 'error').length,
                skipped: out.filter((r) => r.status === 'skipped').length,
                totalQty: round3(ready.reduce((s, r) => s + (r.change || 0), 0)),
                totalValue: round2(ready.reduce((s, r) => s + (r.value || 0), 0)),
                newCategories: [...newCategories],
                newBrands: [...newBrands],
                branches: [...new Set(ready.map((r) => r.branchName))],
            },
            duplicates,
        };
    }
    async findDuplicates(checksum, sourceReference) {
        const or = [];
        if (checksum)
            or.push({ file_checksum: checksum });
        if (sourceReference?.trim())
            or.push({ source_reference: { equals: sourceReference.trim(), mode: 'insensitive' } });
        if (!or.length)
            return [];
        const rows = await client_2.prisma.stockImportBatch.findMany({
            where: { status: { not: 'REVERSED' }, OR: or },
            select: {
                id: true,
                reference: true,
                file_name: true,
                file_checksum: true,
                source_reference: true,
                created_at: true,
                total_lines: true,
                creator: { select: { email: true, name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        return rows.map((b) => ({
            id: b.id,
            reference: b.reference,
            fileName: b.file_name,
            sourceReference: b.source_reference,
            createdAt: b.created_at,
            lines: b.total_lines,
            by: b.creator?.name || b.creator?.email || null,
            reason: checksum && b.file_checksum === checksum ? 'same-file' : 'same-reference',
        }));
    }
    /* =========================== create =========================== */
    async create(params) {
        const { options } = params;
        const stockDate = params.stockDate ? new Date(params.stockDate) : new Date();
        if (Number.isNaN(stockDate.getTime()))
            throw new apiError_1.AppError(400, 'Invalid stock date');
        if (stockDate.getTime() > Date.now() + 60_000)
            throw new apiError_1.AppError(400, 'Stock date cannot be in the future');
        await (0, period_lock_service_1.assertPeriodOpen)(stockDate, 'an opening stock import');
        const running = await client_2.prisma.stockImportBatch.findFirst({ where: { status: 'PROCESSING' }, select: { reference: true } });
        if (running) {
            throw new apiError_1.AppError(409, `Import ${running.reference} is still in progress — finish or undo it first`);
        }
        // Never trust the browser's resolution — redo it here.
        const preview = await this.preview(params.rows, options);
        if (preview.duplicates.length && !params.allowDuplicate) {
            const d = preview.duplicates[0];
            throw new apiError_1.AppError(409, d.reason === 'same-file'
                ? `This file was already imported as ${d.reference}. Undo that import first, or confirm to import again.`
                : `Reference "${d.sourceReference}" was already used by ${d.reference}.`, [{ code: 'DUPLICATE_IMPORT', duplicates: preview.duplicates }]);
        }
        // Merge repeated product+branch rows into one line.
        const rawByRow = new Map(params.rows.map((r) => [r.rowNo, r]));
        const merged = new Map();
        const others = [];
        for (const r of preview.rows) {
            const common = {
                row_no: r.rowNo,
                sku: r.sku,
                name: r.name,
                category_name: r.category,
                brand_name: r.brand,
                size_name: r.size,
                color_name: r.color,
                sale_price: r.salePrice,
            };
            if (r.status !== 'matched' && r.status !== 'new') {
                if (!r.branchId)
                    continue; // nothing useful to keep without a branch
                others.push({
                    ...common,
                    batch_id: '',
                    branch_id: r.branchId,
                    product_id: r.productId,
                    quantity: r.quantity,
                    unit_cost: r.unitCost,
                    // Rejected at the check step — kept for the record, not counted as failures.
                    status: 'SKIPPED',
                    error: r.message || null,
                });
                continue;
            }
            const key = `${r.productId || `new:${normKey(r.sku || r.name)}`}:${r.branchId}`;
            const prev = merged.get(key);
            if (prev) {
                prev.quantity = round3((0, helpers_1.asNumber)(prev.quantity) + r.quantity);
                continue;
            }
            merged.set(key, {
                ...common,
                batch_id: '',
                branch_id: r.branchId,
                product_id: r.productId,
                quantity: r.quantity,
                // Keep the file's cost; processing decides whether it is applied.
                unit_cost: toNum(rawByRow.get(r.rowNo)?.unitCost),
                create_product: r.status === 'new',
                status: 'PENDING',
            });
        }
        const pending = [...merged.values()];
        if (!pending.length)
            throw new apiError_1.AppError(400, 'No rows are ready to import — fix the errors first');
        const batch = await client_2.prisma.stockImportBatch.create({
            data: {
                reference: newBatchReference(),
                file_name: params.fileName?.slice(0, 255) || null,
                file_checksum: options.fileChecksum || null,
                source_reference: options.sourceReference?.trim() || null,
                notes: params.notes?.trim() || null,
                mode: options.mode,
                update_cost: options.updateCost,
                create_missing: options.createMissing,
                stock_date: stockDate,
                total_lines: pending.length,
                error_lines: 0,
                created_by: params.userId,
            },
        });
        const all = [...pending, ...others].map((l) => ({ ...l, batch_id: batch.id }));
        for (let i = 0; i < all.length; i += 1000) {
            await client_2.prisma.stockImportLine.createMany({ data: all.slice(i, i + 1000) });
        }
        await (0, audit_service_1.audit)({
            action: 'inventory.stock_import.create',
            category: 'inventory',
            entity: 'StockImportBatch',
            entityId: batch.id,
            summary: `Started opening stock import ${batch.reference} (${pending.length} lines${params.fileName ? `, ${params.fileName}` : ''})`,
            userId: params.userId,
            details: { mode: options.mode, updateCost: options.updateCost, createMissing: options.createMissing },
        });
        return { id: batch.id, reference: batch.reference, totalLines: pending.length, skippedRows: others.length };
    }
    /* =========================== process =========================== */
    /** Applies the next chunk. Call repeatedly until `done`. */
    async process(batchId, userId) {
        const batch = await client_2.prisma.stockImportBatch.findUnique({ where: { id: batchId } });
        if (!batch)
            throw new apiError_1.AppError(404, 'Import not found');
        if (batch.status !== 'PROCESSING')
            return this.progress(batchId);
        const lines = await client_2.prisma.stockImportLine.findMany({
            where: { batch_id: batchId, status: 'PENDING' },
            orderBy: { row_no: 'asc' },
            take: CHUNK_SIZE,
        });
        if (lines.length) {
            try {
                await client_2.prisma.$transaction((tx) => this.applyLines(tx, batch, lines, userId), { maxWait: 20000, timeout: 120000 });
            }
            catch {
                // Something in the chunk failed — retry line by line so one bad row
                // doesn't block the rest, and record why it failed.
                for (const line of lines) {
                    try {
                        await client_2.prisma.$transaction((tx) => this.applyLines(tx, batch, [line], userId), { maxWait: 20000, timeout: 30000 });
                    }
                    catch (error) {
                        await client_2.prisma.stockImportLine.update({
                            where: { id: line.id },
                            data: { status: 'ERROR', error: (error.message || 'Failed').slice(0, 500) },
                        });
                        await client_2.prisma.stockImportBatch.update({ where: { id: batchId }, data: { error_lines: { increment: 1 } } });
                    }
                }
            }
        }
        const remaining = await client_2.prisma.stockImportLine.count({ where: { batch_id: batchId, status: 'PENDING' } });
        if (remaining === 0)
            await this.finalize(batchId, userId);
        return this.progress(batchId);
    }
    async applyLines(tx, batch, lines, userId) {
        let codeCounter = null;
        const relationCache = new Map();
        let applied = 0;
        let created = 0;
        for (const line of lines) {
            let productId = line.product_id;
            let createdProduct = false;
            if (!productId) {
                if (!line.create_product)
                    throw new apiError_1.AppError(400, `Row ${line.row_no}: no product`);
                // An earlier line of this import may already have created it.
                const existing = await this.findExisting(tx, line.sku, line.name);
                if (existing) {
                    productId = existing;
                }
                else {
                    if (codeCounter === null) {
                        const rows = await tx.$queryRaw `
              SELECT MAX(CAST(code AS BIGINT)) AS max FROM "Product" WHERE code ~ '^[0-9]{1,15}$'`;
                        codeCounter = Math.max(999, Number(rows[0]?.max ?? 999));
                    }
                    codeCounter += 1;
                    productId = await this.createProduct(tx, line, String(codeCounter), relationCache);
                    createdProduct = true;
                    created += 1;
                }
            }
            const product = await tx.product.findUnique({
                where: { id: productId },
                select: { id: true, name: true, purchase_rate: true },
            });
            if (!product)
                throw new apiError_1.AppError(400, `Row ${line.row_no}: product not found`);
            // Decide the cost: file cost when asked to update, or to fill a missing cost.
            const oldCost = (0, helpers_1.asNumber)(product.purchase_rate);
            const fileCost = line.unit_cost === null ? null : (0, helpers_1.asNumber)(line.unit_cost);
            let cost = oldCost;
            let previousCost = null;
            let revaluation = 0;
            if (fileCost !== null && !createdProduct && Math.abs(fileCost - oldCost) >= 0.005 && (batch.update_cost || oldCost <= 0)) {
                cost = fileCost;
                previousCost = oldCost;
                await tx.product.update({ where: { id: productId }, data: { purchase_rate: fileCost } });
                await tx.productPriceHistory.create({
                    data: {
                        product_id: productId,
                        field: 'purchase_rate',
                        old_value: oldCost,
                        new_value: fileCost,
                        source: 'STOCK_IMPORT',
                        changed_by: userId,
                    },
                });
                // Inventory is valued at the product cost, so stock already on hand
                // everywhere is revalued too — keep the journal in step with that.
                const onHand = await tx.stock.aggregate({
                    where: { product_id: productId, current_quantity: { gt: 0 } },
                    _sum: { current_quantity: true },
                });
                revaluation = round2((0, helpers_1.asNumber)(onHand._sum.current_quantity ?? 0) * (fileCost - oldCost));
            }
            else if (createdProduct) {
                cost = fileCost ?? 0;
            }
            const stock = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: line.branch_id } },
                select: { current_quantity: true },
            });
            const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
            const qty = (0, helpers_1.asNumber)(line.quantity);
            const newQty = round3(batch.mode === 'ADD' ? previousQty + qty : qty);
            const change = round3(newQty - previousQty);
            const value = round2(change * cost + revaluation);
            if (change !== 0) {
                if (stock) {
                    await tx.stock.update({
                        where: { product_id_branch_id: { product_id: productId, branch_id: line.branch_id } },
                        data: { current_quantity: newQty },
                    });
                }
                else {
                    await tx.stock.create({ data: { product_id: productId, branch_id: line.branch_id, current_quantity: newQty } });
                }
                await tx.stockMovement.create({
                    data: {
                        product_id: productId,
                        branch_id: line.branch_id,
                        movement_type: 'ADJUSTMENT',
                        reference_id: batch.id,
                        reference_type: 'stock_import',
                        quantity_change: change,
                        previous_qty: previousQty,
                        new_qty: newQty,
                        unit_cost: cost,
                        notes: `Opening stock import ${batch.reference} (row ${line.row_no})`,
                        created_by: userId,
                        created_at: batch.stock_date,
                    },
                });
            }
            await tx.stockImportLine.update({
                where: { id: line.id },
                data: {
                    product_id: productId,
                    created_product: createdProduct,
                    status: 'APPLIED',
                    previous_qty: previousQty,
                    new_qty: newQty,
                    applied_change: change,
                    applied_value: value,
                    previous_cost: previousCost,
                    error: null,
                },
            });
            applied += 1;
        }
        await tx.stockImportBatch.update({
            where: { id: batch.id },
            data: { applied_lines: { increment: applied }, created_products: { increment: created } },
        });
    }
    async findExisting(tx, sku, name) {
        if (sku) {
            const bySku = await tx.product.findFirst({
                where: {
                    OR: [
                        { sku: { equals: sku, mode: 'insensitive' } },
                        { code: { equals: sku, mode: 'insensitive' } },
                        { custom_code: { equals: sku, mode: 'insensitive' } },
                        { label_barcode: { equals: sku, mode: 'insensitive' } },
                    ],
                },
                select: { id: true },
            });
            if (bySku)
                return bySku.id;
        }
        if (name) {
            const byName = await tx.product.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
            if (byName)
                return byName.id;
        }
        return null;
    }
    async createProduct(tx, line, code, relationCache) {
        if (!line.name)
            throw new apiError_1.AppError(400, `Row ${line.row_no}: a product name is needed to create it`);
        // Old-POS codes are rarely 9-digit barcodes: keep them as the merchant code
        // (searchable at the till and matched on re-import) and generate a SKU.
        const fileSku = line.sku?.trim() || null;
        const useAsSku = fileSku && (0, numericBarcodeSku_1.isNineDigitNumericSku)(fileSku);
        const sku = useAsSku ? fileSku : await (0, numericBarcodeSku_1.generateUniqueNumericSku)(tx);
        const relKey = JSON.stringify([line.category_name, line.brand_name, line.size_name, line.color_name].map(normKey));
        let relations = relationCache.get(relKey);
        if (!relations) {
            relations = await this.products.buildRelationsFromNames({
                category_name: line.category_name || undefined,
                brand_name: line.brand_name || undefined,
                size_name: line.size_name || undefined,
                color_name: line.color_name || undefined,
            }, tx);
            relationCache.set(relKey, relations);
        }
        const cost = line.unit_cost === null ? 0 : (0, helpers_1.asNumber)(line.unit_cost);
        const price = line.sale_price === null ? 0 : (0, helpers_1.asNumber)(line.sale_price);
        const product = await tx.product.create({
            data: {
                ...relations,
                name: line.name,
                code,
                sku,
                custom_code: useAsSku ? null : fileSku,
                purchase_rate: cost,
                sales_rate_exc_dis_and_tax: price,
                sales_rate_inc_dis_and_tax: price,
                min_qty: 0,
                max_qty: 0,
            },
            select: { id: true },
        });
        return product.id;
    }
    /** Totals + journal once every line has been handled. */
    async finalize(batchId, userId) {
        const batch = await client_2.prisma.stockImportBatch.findUnique({ where: { id: batchId } });
        if (!batch || batch.status !== 'PROCESSING')
            return;
        const [totals, errors, branchIds] = await Promise.all([
            client_2.prisma.stockImportLine.aggregate({
                where: { batch_id: batchId, status: 'APPLIED' },
                _sum: { applied_change: true, applied_value: true },
            }),
            client_2.prisma.stockImportLine.count({ where: { batch_id: batchId, status: 'ERROR' } }),
            client_2.prisma.stockImportLine.findMany({ where: { batch_id: batchId, status: 'APPLIED' }, distinct: ['branch_id'], select: { branch_id: true } }),
        ]);
        const totalQty = round3((0, helpers_1.asNumber)(totals._sum.applied_change ?? 0));
        const totalValue = round2((0, helpers_1.asNumber)(totals._sum.applied_value ?? 0));
        const voucherId = await this.postVoucher({
            reference: `${chart_of_accounts_service_1.STOCK_IMPORT_VOUCHER_PREFIX}:${batch.id}`,
            date: batch.stock_date,
            amount: totalValue,
            narration: `Opening stock import ${batch.reference}${batch.source_reference ? ` — ${batch.source_reference}` : ''}`,
            branchId: branchIds.length === 1 ? branchIds[0].branch_id : null,
            userId,
        });
        await client_2.prisma.stockImportBatch.update({
            where: { id: batchId },
            data: {
                status: 'COMMITTED',
                committed_at: new Date(),
                total_qty: totalQty,
                total_value: totalValue,
                error_lines: errors,
                journal_voucher_id: voucherId,
            },
        });
        await (0, audit_service_1.audit)({
            action: 'inventory.stock_import.commit',
            category: 'inventory',
            entity: 'StockImportBatch',
            entityId: batch.id,
            summary: `Opening stock import ${batch.reference} saved — ${batch.applied_lines} lines, ${totalQty} units, Rs ${totalValue}`,
            userId,
        });
    }
    /**
     * Dr Inventory / Cr Opening Balance Equity for a positive amount (reversed
     * for negative). Idempotent by reference. Returns the voucher id, or null
     * when there is nothing to post.
     */
    async postVoucher(p) {
        const amount = round2(p.amount);
        if (Math.abs(amount) < 0.01)
            return null;
        await this.accounts.ensureSetup();
        const [inventory, equity] = await Promise.all([
            client_2.prisma.transactionalAccount.findUnique({ where: { system_key: 'INVENTORY' }, select: { id: true } }),
            client_2.prisma.transactionalAccount.findUnique({ where: { system_key: 'OPENING_EQUITY' }, select: { id: true } }),
        ]);
        if (!inventory || !equity)
            throw new apiError_1.AppError(500, 'Chart of Accounts is missing Inventory or Opening Balance Equity');
        const abs = Math.abs(amount);
        const lines = amount > 0
            ? [
                { account_id: inventory.id, debit: abs, credit: 0, description: 'Opening stock brought in' },
                { account_id: equity.id, debit: 0, credit: abs, description: 'Opening stock brought in' },
            ]
            : [
                { account_id: equity.id, debit: abs, credit: 0, description: 'Opening stock taken out' },
                { account_id: inventory.id, debit: 0, credit: abs, description: 'Opening stock taken out' },
            ];
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const voucher = await client_2.prisma.$transaction(async (tx) => {
                    const exists = await tx.journalVoucher.findFirst({ where: { reference: p.reference }, select: { id: true } });
                    if (exists)
                        return exists;
                    return tx.journalVoucher.create({
                        data: {
                            voucher_no: await nextVoucherNo(tx),
                            voucher_date: p.date,
                            narration: p.narration,
                            reference: p.reference,
                            branch_id: p.branchId,
                            total: abs,
                            created_by: p.userId,
                            lines: { create: lines },
                        },
                        select: { id: true },
                    });
                });
                return voucher.id;
            }
            catch (error) {
                if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2)
                    continue;
                throw error;
            }
        }
        return null;
    }
    /* =========================== reverse =========================== */
    async reverse(batchId, userId) {
        const batch = await client_2.prisma.stockImportBatch.findUnique({ where: { id: batchId } });
        if (!batch)
            throw new apiError_1.AppError(404, 'Import not found');
        if (batch.status === 'REVERSED')
            throw new apiError_1.AppError(400, 'This import was already undone');
        await (0, period_lock_service_1.assertPeriodOpen)(batch.stock_date, 'undoing an opening stock import');
        const lines = await client_2.prisma.stockImportLine.findMany({
            where: { batch_id: batchId, status: 'APPLIED' },
            include: { product: { select: { name: true, purchase_rate: true } }, branch: { select: { name: true } } },
        });
        // Refuse if undoing would push stock below zero (items sold since, etc.).
        const net = new Map();
        for (const l of lines) {
            const key = `${l.product_id}:${l.branch_id}`;
            net.set(key, (net.get(key) || 0) + (0, helpers_1.asNumber)(l.applied_change ?? 0));
        }
        const stocks = lines.length
            ? await client_2.prisma.stock.findMany({
                where: { product_id: { in: [...new Set(lines.map((l) => l.product_id))] } },
                select: { product_id: true, branch_id: true, current_quantity: true },
            })
            : [];
        const current = new Map(stocks.map((s) => [`${s.product_id}:${s.branch_id}`, (0, helpers_1.asNumber)(s.current_quantity)]));
        const conflicts = [];
        for (const l of lines) {
            const key = `${l.product_id}:${l.branch_id}`;
            if (!net.has(key))
                continue;
            const after = round3((current.get(key) ?? 0) - net.get(key));
            if (after < 0)
                conflicts.push(`${l.product?.name || 'Product'} @ ${l.branch.name}: would go to ${after}`);
            net.delete(key);
        }
        if (conflicts.length) {
            throw new apiError_1.AppError(409, `Can't undo — ${conflicts.length} item${conflicts.length === 1 ? '' : 's'} would go below zero (sold or moved since the import). Adjust those first.`, conflicts.slice(0, 50).map((message) => ({ message })));
        }
        const now = new Date();
        for (let i = 0; i < lines.length; i += 100) {
            const chunk = lines.slice(i, i + 100);
            await client_2.prisma.$transaction(async (tx) => {
                for (const l of chunk) {
                    const change = (0, helpers_1.asNumber)(l.applied_change ?? 0);
                    if (change !== 0) {
                        const stock = await tx.stock.findUnique({
                            where: { product_id_branch_id: { product_id: l.product_id, branch_id: l.branch_id } },
                            select: { current_quantity: true },
                        });
                        const before = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
                        const after = round3(before - change);
                        await tx.stock.upsert({
                            where: { product_id_branch_id: { product_id: l.product_id, branch_id: l.branch_id } },
                            update: { current_quantity: after },
                            create: { product_id: l.product_id, branch_id: l.branch_id, current_quantity: after },
                        });
                        await tx.stockMovement.create({
                            data: {
                                product_id: l.product_id,
                                branch_id: l.branch_id,
                                movement_type: 'ADJUSTMENT',
                                reference_id: batch.id,
                                reference_type: 'stock_import_reversal',
                                quantity_change: -change,
                                previous_qty: before,
                                new_qty: after,
                                unit_cost: l.product?.purchase_rate ?? null,
                                notes: `Undo opening stock import ${batch.reference} (row ${l.row_no})`,
                                created_by: userId,
                            },
                        });
                    }
                    // Put the old cost back, unless someone has changed it since.
                    if (l.previous_cost !== null &&
                        l.unit_cost !== null &&
                        l.product &&
                        Math.abs((0, helpers_1.asNumber)(l.product.purchase_rate) - (0, helpers_1.asNumber)(l.unit_cost)) < 0.005) {
                        await tx.product.update({ where: { id: l.product_id }, data: { purchase_rate: l.previous_cost } });
                        await tx.productPriceHistory.create({
                            data: {
                                product_id: l.product_id,
                                field: 'purchase_rate',
                                old_value: l.unit_cost,
                                new_value: l.previous_cost,
                                source: 'STOCK_IMPORT_UNDO',
                                changed_by: userId,
                            },
                        });
                    }
                    await tx.stockImportLine.update({ where: { id: l.id }, data: { status: 'REVERSED' } });
                }
            }, { maxWait: 20000, timeout: 120000 });
        }
        // Remove products this import created, when nothing else refers to them.
        const createdIds = [...new Set(lines.filter((l) => l.created_product && l.product_id).map((l) => l.product_id))];
        let removedProducts = 0;
        for (const productId of createdIds) {
            const [sales, orders, purchases, poItems, returns, adjustments, transfers, otherMoves] = await Promise.all([
                client_2.prisma.saleItem.count({ where: { product_id: productId } }),
                client_2.prisma.orderItem.count({ where: { product_id: productId } }),
                client_2.prisma.purchase.count({ where: { product_id: productId } }),
                client_2.prisma.purchaseOrderItem.count({ where: { product_id: productId } }),
                client_2.prisma.purchaseReturnItem.count({ where: { product_id: productId } }),
                client_2.prisma.stockAdjustment.count({ where: { product_id: productId } }),
                client_2.prisma.transfer.count({ where: { product_id: productId } }),
                client_2.prisma.stockMovement.count({ where: { product_id: productId, reference_id: { not: batch.id } } }),
            ]);
            if (sales + orders + purchases + poItems + returns + adjustments + transfers + otherMoves > 0)
                continue;
            try {
                await client_2.prisma.$transaction([
                    client_2.prisma.stockMovement.deleteMany({ where: { product_id: productId } }),
                    client_2.prisma.stock.deleteMany({ where: { product_id: productId } }),
                    client_2.prisma.productImage.deleteMany({ where: { product_id: productId } }),
                    client_2.prisma.product.delete({ where: { id: productId } }),
                ]);
                removedProducts += 1;
            }
            catch {
                // Still referenced somewhere we didn't check — leave it in place.
            }
        }
        const reversalVoucherId = batch.journal_voucher_id
            ? await this.postVoucher({
                reference: `${chart_of_accounts_service_1.STOCK_IMPORT_VOUCHER_PREFIX}-REV:${batch.id}`,
                date: now,
                amount: -(0, helpers_1.asNumber)(batch.total_value),
                narration: `Undo opening stock import ${batch.reference}`,
                branchId: null,
                userId,
            })
            : null;
        await client_2.prisma.stockImportBatch.update({
            where: { id: batchId },
            data: {
                status: 'REVERSED',
                reversed_by: userId,
                reversed_at: now,
                reversal_voucher_id: reversalVoucherId,
            },
        });
        await client_2.prisma.stockImportLine.updateMany({ where: { batch_id: batchId, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Import undone' } });
        await (0, audit_service_1.audit)({
            action: 'inventory.stock_import.reverse',
            category: 'inventory',
            entity: 'StockImportBatch',
            entityId: batch.id,
            summary: `Undid opening stock import ${batch.reference} — ${lines.length} lines reversed, ${removedProducts} created products removed`,
            userId,
        });
        return { reversedLines: lines.length, removedProducts };
    }
    /* =========================== read =========================== */
    async progress(batchId) {
        const batch = await client_2.prisma.stockImportBatch.findUnique({ where: { id: batchId } });
        if (!batch)
            throw new apiError_1.AppError(404, 'Import not found');
        const grouped = await client_2.prisma.stockImportLine.groupBy({ by: ['status'], where: { batch_id: batchId }, _count: true });
        const counts = { PENDING: 0, APPLIED: 0, SKIPPED: 0, ERROR: 0, REVERSED: 0 };
        for (const g of grouped)
            counts[g.status] = g._count;
        return {
            id: batch.id,
            reference: batch.reference,
            status: batch.status,
            totalLines: batch.total_lines,
            pending: counts.PENDING,
            applied: counts.APPLIED,
            errors: counts.ERROR,
            createdProducts: batch.created_products,
            totalQty: (0, helpers_1.asNumber)(batch.total_qty),
            totalValue: (0, helpers_1.asNumber)(batch.total_value),
            done: batch.status !== 'PROCESSING',
        };
    }
    async list(q) {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(q);
        const [total, rows] = await Promise.all([
            client_2.prisma.stockImportBatch.count(),
            client_2.prisma.stockImportBatch.findMany({
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
                include: {
                    creator: { select: { email: true, name: true } },
                    reverser: { select: { email: true, name: true } },
                },
            }),
        ]);
        const voucherIds = rows.flatMap((r) => [r.journal_voucher_id, r.reversal_voucher_id]).filter((x) => !!x);
        const vouchers = voucherIds.length
            ? await client_2.prisma.journalVoucher.findMany({ where: { id: { in: voucherIds } }, select: { id: true, voucher_no: true } })
            : [];
        const voucherNo = new Map(vouchers.map((v) => [v.id, v.voucher_no]));
        return {
            data: rows.map((r) => ({
                id: r.id,
                reference: r.reference,
                fileName: r.file_name,
                sourceReference: r.source_reference,
                notes: r.notes,
                mode: r.mode,
                status: r.status,
                updateCost: r.update_cost,
                stockDate: r.stock_date,
                totalLines: r.total_lines,
                appliedLines: r.applied_lines,
                errorLines: r.error_lines,
                createdProducts: r.created_products,
                totalQty: (0, helpers_1.asNumber)(r.total_qty),
                totalValue: (0, helpers_1.asNumber)(r.total_value),
                voucherNo: r.journal_voucher_id ? voucherNo.get(r.journal_voucher_id) || null : null,
                reversalVoucherNo: r.reversal_voucher_id ? voucherNo.get(r.reversal_voucher_id) || null : null,
                createdBy: r.creator?.name || r.creator?.email || null,
                reversedBy: r.reverser?.name || r.reverser?.email || null,
                reversedAt: r.reversed_at,
                createdAt: r.created_at,
                committedAt: r.committed_at,
            })),
            meta: (0, pagination_1.paginationMeta)(total, page, limit),
        };
    }
    async lines(batchId, q) {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(q);
        const where = { batch_id: batchId };
        if (q.status && ['PENDING', 'APPLIED', 'SKIPPED', 'ERROR', 'REVERSED'].includes(q.status)) {
            where.status = q.status;
        }
        const [total, rows] = await Promise.all([
            client_2.prisma.stockImportLine.count({ where }),
            client_2.prisma.stockImportLine.findMany({
                where,
                orderBy: { row_no: 'asc' },
                skip,
                take: limit,
                include: { product: { select: { name: true, sku: true } }, branch: { select: { name: true } } },
            }),
        ]);
        return {
            data: rows.map((l) => ({
                id: l.id,
                rowNo: l.row_no,
                status: l.status,
                branch: l.branch.name,
                productId: l.product_id,
                productName: l.product?.name || l.name,
                productSku: l.product?.sku || null,
                fileSku: l.sku,
                fileName: l.name,
                quantity: (0, helpers_1.asNumber)(l.quantity),
                unitCost: l.unit_cost === null ? null : (0, helpers_1.asNumber)(l.unit_cost),
                previousQty: l.previous_qty === null ? null : (0, helpers_1.asNumber)(l.previous_qty),
                newQty: l.new_qty === null ? null : (0, helpers_1.asNumber)(l.new_qty),
                change: l.applied_change === null ? null : (0, helpers_1.asNumber)(l.applied_change),
                value: l.applied_value === null ? null : (0, helpers_1.asNumber)(l.applied_value),
                createdProduct: l.created_product,
                error: l.error,
            })),
            meta: (0, pagination_1.paginationMeta)(total, page, limit),
        };
    }
    /* ===================== barcode stock count ===================== */
    /** Resolves a scanned code the way the till does: exact codes, then CODE-PRICE labels. */
    async lookup(code, branchId) {
        const raw = code.trim();
        if (!raw)
            throw new apiError_1.AppError(400, 'Scan or type a code');
        const select = { id: true, name: true, sku: true, code: true, custom_code: true, purchase_rate: true };
        const exact = (value) => client_2.prisma.product.findFirst({
            where: {
                OR: [
                    { sku: { equals: value, mode: 'insensitive' } },
                    { label_barcode: { equals: value, mode: 'insensitive' } },
                    { code: { equals: value, mode: 'insensitive' } },
                    { custom_code: { equals: value, mode: 'insensitive' } },
                ],
            },
            select,
        });
        let product = await exact(raw);
        if (!product && raw.includes('-'))
            product = await exact(raw.slice(0, raw.lastIndexOf('-')));
        if (!product)
            throw new apiError_1.AppError(404, `No product for "${raw}"`);
        const stock = branchId
            ? await client_2.prisma.stock.findUnique({
                where: { product_id_branch_id: { product_id: product.id, branch_id: branchId } },
                select: { current_quantity: true },
            })
            : null;
        return {
            id: product.id,
            name: product.name,
            sku: product.sku,
            code: product.custom_code || product.code,
            cost: (0, helpers_1.asNumber)(product.purchase_rate),
            systemQty: stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0,
        };
    }
}
exports.StockImportService = StockImportService;
//# sourceMappingURL=stock-import.service.js.map