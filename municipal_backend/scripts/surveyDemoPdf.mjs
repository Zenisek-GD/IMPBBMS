// Zero-dependency valid PDF 1.4 builder for municipal procurement records.
// Produces crisp A4 documents readable in any browser or PDF viewer without
// requiring headless Chrome at seed time.

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 50;
const RIGHT = 545;
const CONTENT_WIDTH = RIGHT - LEFT;

const asciiText = (value) =>
  String(value ?? "")
    .replaceAll("₱", "PHP ")
    .replaceAll("—", " - ")
    .replaceAll("–", "-")
    .replaceAll("·", " | ")
    .replaceAll("×", "x")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapePdf = (text) =>
  asciiText(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const wrapText = (text, maxChars) => {
  const clean = asciiText(text);
  if (!clean) return [];
  const words = clean.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= maxChars) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

export function renderSurveyPdf({
  lguName = "Municipality of Roxas, Oriental Mindoro",
  office,
  title,
  reference,
  issuedDate,
  projectTitle,
  intro,
  rows = [],
  footer,
}) {
  const ops = [];
  let y = PAGE_HEIGHT - 54;

  const textLine = (font, size, x, baselineY, value, gray = 0.1) => {
    ops.push(`${gray.toFixed(2)} g BT /${font} ${size} Tf 1 0 0 1 ${x} ${baselineY} Tm (${escapePdf(value)}) Tj ET`);
  };

  // Header accent bar
  ops.push("0.11 0.21 0.32 rg");
  ops.push(`${LEFT} ${PAGE_HEIGHT - 36} ${CONTENT_WIDTH} 6 re f`);

  // LGU and issuing office
  textLine("F2", 9.5, LEFT, y, lguName.toUpperCase(), 0.15);
  y -= 14;
  textLine("F1", 9.5, LEFT, y, office, 0.28);
  y -= 24;

  // Document title
  for (const line of wrapText(title, 52)) {
    textLine("F2", 16, LEFT, y, line, 0.08);
    y -= 20;
  }
  textLine("F1", 9.5, LEFT, y, `${reference} | ${issuedDate}`, 0.35);
  y -= 14;

  // Divider line
  ops.push("0.78 0.82 0.86 RG 0.8 w");
  ops.push(`${LEFT} ${y} m ${RIGHT} ${y} l S`);
  y -= 22;

  // Project heading
  for (const line of wrapText(projectTitle, 74)) {
    textLine("F2", 11, LEFT, y, line, 0.1);
    y -= 15;
  }
  y -= 6;

  // Intro paragraph
  if (intro) {
    for (const line of wrapText(intro, 88)) {
      textLine("F1", 10, LEFT, y, line, 0.18);
      y -= 14;
    }
    y -= 10;
  }

  // Structured details table
  const labelWidth = 155;
  const valueX = LEFT + labelWidth + 10;
  for (const [label, value] of rows) {
    const labelLines = wrapText(label, 25);
    const valueLines = wrapText(value, 56);
    const rowLines = Math.max(labelLines.length, valueLines.length, 1);
    const rowHeight = rowLines * 13 + 10;
    if (y - rowHeight < 75) break;

    const top = y + 4;
    const bottom = top - rowHeight;
    ops.push("0.95 0.96 0.97 rg");
    ops.push(`${LEFT} ${bottom} ${labelWidth} ${rowHeight} re f`);
    ops.push("0.82 0.85 0.88 RG 0.5 w");
    ops.push(`${LEFT} ${bottom} ${CONTENT_WIDTH} ${rowHeight} re S`);
    ops.push(`${LEFT + labelWidth} ${bottom} m ${LEFT + labelWidth} ${top} l S`);

    for (let i = 0; i < labelLines.length; i++) {
      textLine("F2", 9.2, LEFT + 6, top - 13 - i * 13, labelLines[i], 0.15);
    }
    for (let i = 0; i < valueLines.length; i++) {
      textLine("F1", 9.2, valueX, top - 13 - i * 13, valueLines[i], 0.15);
    }
    y = bottom - 4;
  }

  // Footer note
  if (footer && y > 68) {
    y -= 12;
    for (const line of wrapText(footer, 92)) {
      if (y < 42) break;
      textLine("F1", 8.8, LEFT, y, line, 0.35);
      y -= 12;
    }
  }

  const streamBody = ops.join("\n") + "\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
    `6 0 obj\n<< /Length ${Buffer.byteLength(streamBody, "ascii")} >>\nstream\n${streamBody}endstream\nendobj\n`,
  ];

  const chunks = ["%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"];
  const offsets = [0];
  let byteOffset = Buffer.byteLength(chunks[0], "binary");
  for (const obj of objects) {
    offsets.push(byteOffset);
    chunks.push(obj);
    byteOffset += Buffer.byteLength(obj, "ascii");
  }

  const xrefStart = byteOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(xref, trailer);

  return Buffer.from(chunks.join(""), "binary");
}
