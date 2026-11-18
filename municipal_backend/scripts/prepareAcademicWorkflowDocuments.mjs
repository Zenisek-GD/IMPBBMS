import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { documents, documentHtml } from "./academicWorkflowDocuments.mjs";
import { closeBrowser, renderPdf } from "../services/pdfRenderer.js";

const directory = process.argv[2];
if (!directory) throw new Error("Supply an output directory for the project documents.");
await mkdir(directory, { recursive: true });
try {
  for (const record of documents) {
    const pdf = await renderPdf(documentHtml(record));
    await writeFile(join(directory, record.filename), pdf);
  }
  console.log("Prepared " + documents.length + " PDF records.");
} finally {
  await closeBrowser();
}
