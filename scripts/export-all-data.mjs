// Export all SQLite data to JSON using raw sqlite3 (no dependencies needed)
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";

const DB_PATH = resolve("prisma/dev.db");

// Use sqlite3 CLI via npx prisma to query tables
// Since we can't import better-sqlite3, let's use a different approach
// We'll use Prisma's built-in SQLite query engine temporarily

const tables = [
  "schools",
  "students",
  "admins",
  "passages",
  "passage_analyses",
  "passage_notes",
  "vocabulary_lists",
  "vocabulary_items",
  "vocab_test_results",
  "wrong_vocab_answers",
  "exams",
  "exam_questions",
  "question_explanations",
  "teacher_prompts",
  "ai_conversations",
  "study_progress",
];

async function exportAll() {
  // Use a quick sqlite3 approach via node's native addon
  // Install better-sqlite3 temporarily
  console.log("Installing better-sqlite3 temporarily...");
  execSync("npm install better-sqlite3 --no-save", { stdio: "inherit" });

  const Database = (await import("better-sqlite3")).default;
  const db = new Database(DB_PATH, { readonly: true });

  const data = {};
  for (const table of tables) {
    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      data[table] = rows;
      console.log(`  ${table}: ${rows.length} records`);
    } catch (e) {
      console.log(`  ${table}: skipped (${e.message})`);
      data[table] = [];
    }
  }

  db.close();

  writeFileSync(
    "scripts/sqlite-export.json",
    JSON.stringify(data, null, 2),
    "utf-8"
  );
  console.log("\nExported to scripts/sqlite-export.json");
}

exportAll().catch(console.error);
