const fs = require("fs");

async function extractPdf(filePath) {
  // Use pdfjs-dist — no hanging bug, works well in memory-limited envs
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
  pdfjsLib.GlobalWorkerOptions.workerSrc = false; // disable worker thread

  const data  = new Uint8Array(fs.readFileSync(filePath));
  const doc   = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items.map(item => item.str).join(" ");
    pages.push(text);
  }

  return pages.join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

module.exports = { extractPdf };
