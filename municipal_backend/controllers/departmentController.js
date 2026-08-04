import { Op, fn, col } from "sequelize";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";

const serialize = (department) => ({
  id: department.id,
  name: department.name,
  code: department.code,
  type: department.type,
  status: department.status,
  headUserId: department.headUserId ?? null,
  userCount: Number(department.get("userCount") ?? 0),
});

export const listDepartments = async (req, res) => {
  const { search, type, status } = req.query;

  const where = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { code: { [Op.like]: `%${search}%` } },
    ];
  }
  if (type) where.type = type;
  if (status) where.status = status;

  const departments = await Department.findAll({
    where,
    attributes: {
      include: [[fn("COUNT", col("Users.id")), "userCount"]],
    },
    include: [{ model: User, attributes: [] }],
    group: ["Department.id"],
    order: [["name", "ASC"]],
    subQuery: false,
  });

  res.json(departments.map(serialize));
};

export const createDepartment = async (req, res) => {
  const { name, code, type } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: "Name and code are required." });
  }

  const normalizedCode = code.trim().toUpperCase();
  if (await Department.findOne({ where: { code: normalizedCode } })) {
    return res.status(409).json({ message: "A department with that code already exists." });
  }

  const department = await Department.create({
    name: name.trim(),
    code: normalizedCode,
    type: type || "endUser",
    status: "active",
  });

  res.status(201).json(serialize(department));
};

export const updateDepartment = async (req, res) => {
  const { name, code, type, status, headUserId } = req.body;
  const department = await Department.findByPk(req.params.id);
  if (!department) return res.status(404).json({ message: "Department not found." });

  if (code) {
    const normalizedCode = code.trim().toUpperCase();
    const taken = await Department.findOne({
      where: { code: normalizedCode, id: { [Op.ne]: department.id } },
    });
    if (taken) return res.status(409).json({ message: "A department with that code already exists." });
    department.code = normalizedCode;
  }

  // Deactivating an office that still has staff attached would strand those
  // accounts against an inactive unit, so require them to be moved first.
  if (status === "inactive" && department.status === "active") {
    const assigned = await User.count({ where: { departmentId: department.id, status: "active" } });
    if (assigned > 0) {
      return res.status(409).json({
        message: `Reassign the ${assigned} active user(s) in this department before deactivating it.`,
      });
    }
  }

  // The head must actually belong to the department they head.
  if (headUserId !== undefined) {
    if (headUserId === null) {
      department.headUserId = null;
    } else {
      const head = await User.findByPk(headUserId);
      if (!head || head.departmentId !== department.id) {
        return res.status(400).json({ message: "The department head must be a member of that department." });
      }
      department.headUserId = head.id;
    }
  }

  if (name) department.name = name.trim();
  if (type) department.type = type;
  if (status) department.status = status;
  await department.save();

  res.json(serialize(department));
};
