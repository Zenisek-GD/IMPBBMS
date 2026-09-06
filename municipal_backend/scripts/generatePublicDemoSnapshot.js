// Generate the published-record fallback bundled with the Worker. It contains
// only the same fields exposed by the anonymous public API, never accounts,
// passwords, sessions, drafts, or internal remarks.
//
// Run from municipal_backend with the local database available:
//   node --env-file=.env scripts/generatePublicDemoSnapshot.js
import { writeFile } from "node:fs/promises";
import { Department } from "../models/departmentModel.js";
import { sequelize } from "../models/db.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { listPublicProjects, getPublicSummary, PROJECT_CATEGORIES } from "../services/projectLifecycle.js";
import { publicProjectView, assertPublicSnapshot } from "../services/publicSnapshotSafety.js";

try {
  const [projects, detailedProjects, overview, lgu, departments] = await Promise.all([
    listPublicProjects(),
    listPublicProjects({ detailed: true }),
    getPublicSummary(),
    getLguProfile(),
    Department.findAll({ where: { status: "active" }, order: [["name", "ASC"]] }),
  ]);

  const snapshot = {
    projects,
    detailedProjects: detailedProjects.map(publicProjectView),
    overview: { lgu, ...overview },
    filters: {
      lgu,
      categories: PROJECT_CATEGORIES,
      departments: departments.map((department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
      })),
      fiscalYears: [...new Set(projects.map((project) => project.fiscalYear).filter(Boolean))].sort((a, b) => b - a),
    },
  };

  assertPublicSnapshot(snapshot);
  await writeFile(
    new URL("../public-demo-snapshot.json", import.meta.url),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8"
  );
  console.log(`Created public demo snapshot with ${projects.length} projects.`);
} finally {
  await sequelize.close();
}
