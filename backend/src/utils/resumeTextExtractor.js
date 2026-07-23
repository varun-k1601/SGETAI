const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const zlib = require("zlib");
const ApiError = require("./ApiError");

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getResumeTextQuality(value) {
  const text = String(value || "");
  const words = text.match(/\b[A-Za-z][A-Za-z+#.]{2,}\b/g) || [];
  const signalMatches = text.match(
    /\b(education|experience|project|projects|skills|technical|certification|achievement|developer|engineer|python|java|javascript|react|node|mongodb|github|linkedin|email)\b/gi
  ) || [];
  const pdfJunkMatches = text.match(
    /\b(endstream|endobj|xref|obj|flatedecode|mediabox|fontdescriptor)\b/gi
  ) || [];

  return {
    wordCount: words.length,
    signalCount: signalMatches.length,
    pdfJunkCount: pdfJunkMatches.length,
    isReadable:
      text.length >= 80 &&
      words.length >= 30 &&
      signalMatches.length >= 2 &&
      pdfJunkMatches.length < 12
  };
}

function isReadableResumeText(value) {
  return getResumeTextQuality(value).isReadable;
}

async function extractTextFromPdfBuffer(buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return cleanText(result.text || "");
  } catch (error) {
    return "";
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromDocxBuffer(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value || "");
  } catch (error) {
    return "";
  }
}

async function extractTextFromDocBuffer(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value || "");
  } catch (error) {
    return "";
  }
}

function extractTextFromPptxBuffer(buffer) {
  try {
    let offset = 0;
    const texts = [];

    while (offset < buffer.length - 30) {
      const signature = buffer.readUInt32LE(offset);

      if (signature !== 0x04034b50) {
        offset += 1;
        continue;
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const fileNameStart = offset + 30;
      const fileNameEnd = fileNameStart + fileNameLength;
      const fileName = buffer.slice(fileNameStart, fileNameEnd).toString("utf8");
      const dataStart = fileNameEnd + extraLength;
      const dataEnd = dataStart + compressedSize;

      if (
        fileName.startsWith("ppt/slides/slide") &&
        fileName.endsWith(".xml") &&
        compressedSize > 0
      ) {
        const compressed = buffer.slice(dataStart, dataEnd);
        const xml =
          compressionMethod === 8
            ? zlib.inflateRawSync(compressed).toString("utf8")
            : compressed.toString("utf8");

        const slideText = xml
          .replace(/<a:br\/>/g, "\n")
          .replace(/<\/a:p>/g, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (slideText) {
          texts.push(slideText);
        }
      }

      offset = Math.max(dataEnd, offset + 30);
    }

    return cleanText(texts.join("\n\n"));
  } catch (error) {
    return "";
  }
}

async function extractResumeText(file) {
  if (!file?.buffer) {
    return "";
  }

  const mimeType = String(file.mimetype || "").toLowerCase();
  const originalName = String(file.originalname || "").toLowerCase();

  if (mimeType === "text/plain" || originalName.endsWith(".txt")) {
    return cleanText(file.buffer.toString("utf8"));
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    originalName.endsWith(".docx")
  ) {
    return extractTextFromDocxBuffer(file.buffer);
  }

  if (mimeType === "application/msword" || originalName.endsWith(".doc")) {
    return extractTextFromDocBuffer(file.buffer);
  }

  if (mimeType === "application/pdf" || originalName.endsWith(".pdf")) {
    return extractTextFromPdfBuffer(file.buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    originalName.endsWith(".pptx")
  ) {
    return extractTextFromPptxBuffer(file.buffer);
  }

  return "";
}

module.exports = {
  extractResumeText,
  cleanText,
  getResumeTextQuality,
  isReadableResumeText
};
