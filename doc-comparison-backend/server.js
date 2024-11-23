const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const cors = require("cors");
const { diffWords } = require("diff");
const fs = require("fs");

const app = express();

// Set up multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10 MB
});
app.use(bodyParser.json());
app.use(cors());

// Path to the standard PDF file
const STANDARD_FILE_PATH = "./standard_file.pdf";
let standardText = "";

// Log that the PDF.js module loaded successfully
console.log("PDF.js module loaded successfully", pdfjsLib);

// Function to extract text from a PDF buffer
const extractPdfText = async (buffer) => {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    text += pageText + "\n";
  }

  return text;
};

// Load and extract text from the standard PDF file
const loadStandardPdf = async () => {
  try {
    const buffer = fs.readFileSync(STANDARD_FILE_PATH);
    standardText = await extractPdfText(buffer);
    console.log("Standard document loaded successfully.");
  } catch (error) {
    console.error("Error loading standard document:", error);
  }
};

// Call the function to load the standard PDF when the server starts
loadStandardPdf();

// Function to extract text from a Word file
const extractWordText = async (buffer) => {
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
};

// Handle file upload and comparison
app.post("/compare", upload.single("file"), async (req, res) => {
  const uploadedFile = req.file;

  if (!uploadedFile) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    let uploadedText = "";

    // Extract text based on the file type
    if (uploadedFile.mimetype === "application/pdf") {
      uploadedText = await extractPdfText(uploadedFile.buffer);
    } else if (
      uploadedFile.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      uploadedText = await extractWordText(uploadedFile.buffer);
    } else if (uploadedFile.mimetype === "text/plain") {
      uploadedText = uploadedFile.buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // Generate diff between standard text and uploaded text
    const diff = diffWords(standardText, uploadedText);

    // Extract missing and additional points
    const missingPoints = diff
      .filter((part) => part.removed)
      .map((part) => part.value.trim());
    const additionalPoints = diff
      .filter((part) => part.added)
      .map((part) => part.value.trim());

    res.json({
      diff,
      missingPoints,
      additionalPoints,
      standardText,
      uploadedText,
    });
  } catch (error) {
    console.error("Error during comparison:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server on port 5000
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
