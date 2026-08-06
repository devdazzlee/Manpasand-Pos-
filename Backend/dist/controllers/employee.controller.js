"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importEmployees = exports.deleteDepartment = exports.updateDepartment = exports.listDepartments = exports.createDepartment = exports.deleteEmployee = exports.reactivateEmployee = exports.deactivateEmployee = exports.updateEmployee = exports.getEmployeeById = exports.listEmployees = exports.createEmployee = void 0;
const employee_service_1 = require("../services/employee.service");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const employeeService = new employee_service_1.EmployeeService();
exports.createEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.createEmployee(req.body, req.user?.branch_id);
    new apiResponse_1.ApiResponse(employee, 'Employee created successfully', 201).send(res);
});
exports.listEmployees = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, status, department_id, employee_type_id, employment_type, fetch_all, } = req.query;
    const result = await employeeService.listEmployees({
        branch_id: req.user?.branch_id,
        page: Number(page),
        limit: Number(limit),
        search: search,
        status: status,
        department_id: department_id,
        employee_type_id: employee_type_id,
        employment_type: employment_type,
        fetch_all: String(fetch_all) === 'true',
    });
    new apiResponse_1.ApiResponse(result.data, 'Employees fetched successfully', 200, true, result.meta).send(res);
});
exports.getEmployeeById = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.getEmployeeById(req.params.id);
    new apiResponse_1.ApiResponse(employee, 'Employee fetched successfully', 200).send(res);
});
exports.updateEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const updatedEmployee = await employeeService.updateEmployee(id, req.body);
    new apiResponse_1.ApiResponse(updatedEmployee, 'Employee updated successfully', 200).send(res);
});
exports.deactivateEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.deactivateEmployee(req.params.id, req.body);
    new apiResponse_1.ApiResponse(employee, 'Employee deactivated successfully', 200).send(res);
});
exports.reactivateEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.reactivateEmployee(req.params.id);
    new apiResponse_1.ApiResponse(employee, 'Employee reactivated successfully', 200).send(res);
});
exports.deleteEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    await employeeService.deleteEmployee(id);
    new apiResponse_1.ApiResponse(null, 'Employee deleted successfully', 200).send(res);
});
exports.createDepartment = (0, asyncHandler_1.default)(async (req, res) => {
    const department = await employeeService.createDepartment(req.body);
    new apiResponse_1.ApiResponse(department, 'Department created successfully', 201).send(res);
});
exports.listDepartments = (0, asyncHandler_1.default)(async (req, res) => {
    const raw = req.query.fetch_all;
    const fetch_all = raw === undefined || String(raw) === 'true';
    const departments = await employeeService.listDepartments(fetch_all);
    new apiResponse_1.ApiResponse(departments, 'Departments fetched successfully', 200).send(res);
});
exports.updateDepartment = (0, asyncHandler_1.default)(async (req, res) => {
    const department = await employeeService.updateDepartment(req.params.id, req.body);
    new apiResponse_1.ApiResponse(department, 'Department updated successfully', 200).send(res);
});
exports.deleteDepartment = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await employeeService.deleteDepartment(req.params.id);
    new apiResponse_1.ApiResponse(result, 'Department deleted successfully', 200).send(res);
});
exports.importEmployees = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await employeeService.importEmployees(req.body.rows, req.user?.branch_id);
    new apiResponse_1.ApiResponse(result, 'Employee import completed', 200).send(res);
});
//# sourceMappingURL=employee.controller.js.map