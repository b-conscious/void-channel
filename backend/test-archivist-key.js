/**
 * Verifies your ANTHROPIC_API_KEY is installed correctly and makes ONE cheap Haiku
 * call (the same model the Archivist uses). Run from the backend folder:
 *
 *   npm run test:key
 *
 * It reads the key from backend/.env — you never type it on the command line.
 */
require("dotenv").config();

const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.ARCHIVIST_MODEL || "claude-haiku-4-5-20251001";

if (!key) {
  console.error("\n❌ No ANTHROPIC_API_KEY found in backend/.env");
  console.error("   Add a line to backend/.env like:  ANTHROPIC_API_KEY=sk-ant-api03-...\n");
  process.exit(1);
}
if (!key.startsWith("sk-ant-")) {
  console.error("\n❌ That value doesn't look like an Anthropic key (should start with 'sk-ant-').\n");
  process.exit(1);
}

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: key });

async function tryModel(m) {
  const r = await client.messages.create({
    model: m,
    max_tokens: 20,
    messages: [{ role: "user", content: "Reply with exactly: VOID ONLINE" }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

(async () => {
  console.log(`\n⏳ Testing your key against model "${model}" ...`);
  try {
    const text = await tryModel(model);
    console.log(`\n✅ SUCCESS — your key works. Model "${model}" replied: "${text}"`);
    console.log("   The Archivist will work once this same key is set on Render too.\n");
    return;
  } catch (e) {
    if (e.status === 401) { console.error("\n❌ 401 = the key is invalid or revoked. Make a fresh one.\n"); process.exit(1); }
    if (e.status === 402 || /credit|billing|balance/i.test(e.message || "")) { console.error("\n❌ No credits. Add billing at console.anthropic.com/settings/billing\n"); process.exit(1); }
    // Model not found (or similar) — list what's available and auto-retry with a Haiku.
    console.log(`   "${model}" not available (${e.status}). Asking your account which models it has...`);
  }

  let models = [];
  try {
    const resp = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    const json = await resp.json();
    models = (json.data || []).map((m) => m.id);
  } catch (e) {
    console.error(`\n❌ Couldn't list models: ${e.message}\n`);
    process.exit(1);
  }

  console.log("\n   Models on your account:");
  models.forEach((id) => console.log("     - " + id));

  const haiku = models.find((id) => /haiku/i.test(id));
  const pick = haiku || models.find((id) => /sonnet/i.test(id)) || models[0];
  if (!pick) { console.error("\n❌ No models available on this account.\n"); process.exit(1); }

  console.log(`\n⏳ Retrying with "${pick}" ...`);
  try {
    const text = await tryModel(pick);
    console.log(`\n✅ SUCCESS — your key works. Use this model: ${pick}`);
    console.log(`   → Add this line to backend/.env (and Render):  ARCHIVIST_MODEL=${pick}`);
    console.log(`   (Model replied: "${text}")\n`);
  } catch (e) {
    console.error(`\n❌ Retry failed (${e.status}): ${e.message}\n`);
    process.exit(1);
  }
})();
