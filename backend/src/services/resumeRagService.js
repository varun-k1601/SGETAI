const { v4: uuidv4 } = require("uuid");
const Resume = require("../models/Resume");
const ResumeChunk = require("../models/ResumeChunk");
const { extractResumeText, cleanText, getResumeTextQuality } = require("../utils/resumeTextExtractor");
const { generateEmbedding, analyzeResumeMatch } = require("./ollamaService");

async function uploadAndProcessResume({ userId, file, isDraft = false }) {
  if (!file) {
    throw new Error("No file provided");
  }

  const fileType = getFileType(file.originalname);
  if (!["pdf", "docx", "doc", "txt", "pptx"].includes(fileType)) {
    throw new Error("Invalid file type. Supported: PDF, DOCX, TXT, PPTX");
  }

  let extractedText = "";
  try {
    extractedText = await extractResumeText(file);
  } catch (error) {
    console.error("[Resume Upload] Text extraction failed:", error.message);
    throw new Error("Could not extract text from this file. Please upload a valid PDF/DOCX/TXT.");
  }

  const cleanedText = cleanText(extractedText);
  if (!cleanedText || cleanedText.length < 80) {
    throw new Error("Extracted resume text is too short or empty. Please upload a valid resume.");
  }

  const textQuality = getResumeTextQuality(cleanedText);
  if (!textQuality.isReadable) {
    throw new Error("Resume text quality is too low. Please upload a readable PDF/DOCX/TXT.");
  }

  const resumeId = uuidv4();
  const resume = new Resume({
    resumeId,
    userId,
    filename: file.originalname,
    fileType,
    originalText: cleanedText,
    textQuality,
    isDraft,
    status: "Processing"
  });

  await resume.save();

  setImmediate(() => {
    processResumeAsync(resumeId, userId, cleanedText).catch((error) => {
      console.error(`[Resume Processing] Failed for resumeId ${resumeId}:`, error.message);
    });
  });

  return {
    resumeId,
    status: "Processing",
    message: "Resume uploaded successfully. Processing in background..."
  };
}

async function processResumeAsync(resumeId, userId, resumeText) {
  try {
    const chunks = await chunkResume(resumeText);

    const chunkDocs = chunks.map((chunk, index) => ({
      chunkId: uuidv4(),
      resumeId,
      userId,
      sectionType: chunk.sectionType,
      text: chunk.text,
      chunkIndex: index,
      embeddingStatus: "Pending"
    }));

    await ResumeChunk.insertMany(chunkDocs);

    await generateChunkEmbeddings(resumeId);

    await Resume.findOneAndUpdate(
      { resumeId },
      {
        status: "Ready",
        totalChunks: chunks.length,
        updatedAt: new Date()
      }
    );

    console.log(`[Resume Processing] Completed for resumeId ${resumeId}`);
  } catch (error) {
    console.error(`[Resume Processing] Error for resumeId ${resumeId}:`, error.message);
    await Resume.findOneAndUpdate(
      { resumeId },
      {
        status: "Failed",
        errorMessage: error.message,
        updatedAt: new Date()
      }
    );
  }
}

function getFileType(filename) {
  if (!filename) return "txt";
  const ext = filename.split(".").pop().toLowerCase();
  return ["pdf", "docx", "doc", "txt", "pptx"].includes(ext) ? ext : "txt";
}

async function chunkResume(resumeText) {
  const sectionPatterns = {
    Experience: /(?:work.*experience|employment|professional.*experience|experience|position|job)[:\s]*/gi,
    Education: /(?:education|degree|university|college|school|academic)[:\s]*/gi,
    Skills: /(?:technical.*skills|skills|proficiencies|core.*competencies|technical)[:\s]*/gi,
    Projects: /(?:project|portfolio|github|github.*project|side.*project)[:\s]*/gi,
    Certifications: /(?:certification|license|credential|certificate)[:\s]*/gi,
    Achievements: /(?:achievement|award|recognition|honor)[:\s]*/gi,
    Research: /(?:research|publication|paper)[:\s]*/gi
  };

  const sections = {};
  let currentSection = "Other";
  let currentText = "";

  const lines = resumeText.split("\n");

  for (const line of lines) {
    let sectionFound = false;

    for (const [sectionType, pattern] of Object.entries(sectionPatterns)) {
      if (pattern.test(line)) {
        if (currentText.trim()) {
          if (!sections[currentSection]) sections[currentSection] = [];
          sections[currentSection].push(currentText.trim());
        }
        currentSection = sectionType;
        currentText = "";
        sectionFound = true;
        pattern.lastIndex = 0;
        break;
      }
    }

    if (!sectionFound) {
      currentText += line + "\n";
    }
  }

  if (currentText.trim()) {
    if (!sections[currentSection]) sections[currentSection] = [];
    sections[currentSection].push(currentText.trim());
  }

  const chunks = [];

  for (const [sectionType, sectionTexts] of Object.entries(sections)) {
    for (const sectionText of sectionTexts) {
      const subChunks = splitIntoChunks(sectionText, 300, 500);
      for (const chunk of subChunks) {
        chunks.push({
          sectionType,
          text: chunk
        });
      }
    }
  }

  return chunks.length > 0 ? chunks : [{ sectionType: "Other", text: resumeText }];
}

function splitIntoChunks(text, minSize, maxSize) {
  if (!text || text.length < minSize) {
    return [text];
  }

  const chunks = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  let currentChunk = "";

  for (const sentence of sentences) {
    const sentenceWithPeriod = sentence.trim() + ".";

    if ((currentChunk + sentenceWithPeriod).length <= maxSize) {
      currentChunk += (currentChunk ? " " : "") + sentenceWithPeriod;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentenceWithPeriod;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => chunk.length >= minSize);
}

async function generateChunkEmbeddings(resumeId, retryCount = 0) {
  const maxRetries = 3;
  const backoffMs = Math.pow(2, retryCount) * 1000;

  if (retryCount > 0) {
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  const chunks = await ResumeChunk.find({ resumeId, embeddingStatus: "Pending" });

  if (chunks.length === 0) {
    return;
  }

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.text);

    if (embedding && embedding.length === 768) {
      await ResumeChunk.findByIdAndUpdate(chunk._id, {
        embedding,
        embeddingStatus: "Completed"
      });
    } else {
      if (retryCount < maxRetries) {
        await generateChunkEmbeddings(resumeId, retryCount + 1);
      } else {
        await ResumeChunk.findByIdAndUpdate(chunk._id, {
          embeddingStatus: "Failed"
        });
        console.warn(`[Embedding] Failed after ${maxRetries} retries for chunk ${chunk.chunkId}`);
      }
    }
  }
}

async function retrieveRelevantChunks({ resumeId, jobEmbedding, topK = 5 }) {
  if (!jobEmbedding || jobEmbedding.length !== 768) {
    console.warn("[Vector Search] Invalid job embedding");
    return [];
  }

  try {
    const chunks = await ResumeChunk.aggregate([
      {
        $match: {
          resumeId,
          embedding: { $exists: true },
          embeddingStatus: "Completed"
        }
      },
      {
        $search: {
          cosmosSearch: {
            vector: jobEmbedding,
            k: topK
          },
          returnStoredSource: true
        }
      },
      {
        $project: {
          chunkId: 1,
          sectionType: 1,
          text: 1,
          relevanceScore: { $meta: "searchScore" }
        }
      }
    ]);

    return chunks;
  } catch (error) {
    console.error("[Vector Search] Query failed:", error.message);
    return [];
  }
}

async function analyzeResumeJobMatch({ jobId, resumeId, jobDescription, jobEmbedding }) {
  if (!resumeId) {
    throw new Error("Resume ID is required");
  }

  const resume = await Resume.findOne({ resumeId }).select("+originalText");

  if (!resume) {
    throw new Error("Resume not found");
  }

  if (resume.status !== "Ready") {
    throw new Error(`Resume is still processing. Current status: ${resume.status}`);
  }

  if (!jobEmbedding) {
    jobEmbedding = await generateEmbedding(jobDescription);
    if (!jobEmbedding) {
      throw new Error("Could not generate job description embedding");
    }
  }

  const retrievedChunks = await retrieveRelevantChunks({ resumeId, jobEmbedding, topK: 5 });

  if (retrievedChunks.length === 0) {
    throw new Error("No relevant resume sections found for this job");
  }

  const analysis = await analyzeResumeMatch(jobDescription, retrievedChunks);

  if (!analysis) {
    throw new Error("Resume-to-job analysis failed. Please ensure Ollama is running.");
  }

  return {
    matchScore: analysis.matchScore || 0,
    matchTag: analysis.matchTag || "Low fit",
    skillsMatch: analysis.skillsMatch || {
      required: [],
      found: [],
      missing: [],
      matchPercentage: 0
    },
    strengths: analysis.strengths || [],
    weaknesses: analysis.weaknesses || [],
    recruiterSummary: analysis.recruiterSummary || "",
    retrievedChunks: retrievedChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      sectionType: chunk.sectionType,
      relevanceScore: chunk.relevanceScore || 0,
      text: chunk.text
    }))
  };
}

async function deleteResume(resumeId, userId) {
  const resume = await Resume.findOne({ resumeId, userId });

  if (!resume) {
    throw new Error("Resume not found");
  }

  await Resume.deleteOne({ resumeId });
  await ResumeChunk.deleteMany({ resumeId });

  return { success: true, message: "Resume deleted successfully" };
}

async function listUserResumes(userId, isDraft = false) {
  const query = { userId };
  if (isDraft !== null) {
    query.isDraft = isDraft;
  }

  const resumes = await Resume.find(query)
    .select("-originalText")
    .sort({ uploadedAt: -1 });

  return resumes;
}

async function getResumeStatus(resumeId, userId) {
  const resume = await Resume.findOne({ resumeId, userId }).select("-originalText");

  if (!resume) {
    throw new Error("Resume not found");
  }

  return {
    resumeId: resume.resumeId,
    status: resume.status,
    totalChunks: resume.totalChunks,
    uploadedAt: resume.uploadedAt,
    errorMessage: resume.errorMessage || null,
    filename: resume.filename,
    textQuality: resume.textQuality
  };
}

module.exports = {
  uploadAndProcessResume,
  processResumeAsync,
  chunkResume,
  generateChunkEmbeddings,
  retrieveRelevantChunks,
  analyzeResumeJobMatch,
  deleteResume,
  listUserResumes,
  getResumeStatus
};
