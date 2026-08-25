const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

/* mediaUrlService's only dependency is supabaseService, which needs live credentials. It is stubbed
   here so these assertions describe the SIGNING RULE and the BATCHING, not Supabase. `calls` records
   every batch so the "one signature per distinct filePath" claim is asserted rather than assumed. */
const calls = [];
let batchBehaviour = (filePaths) =>
  new Map(filePaths.map((filePath) => [filePath, `https://signed.test/${filePath}?token=jwt`]));

const originalLoad = Module._load;
Module._load = function stubbedLoad(request, parent, isMain) {
  if (request === "../utils/supabaseService") {
    return {
      getSignedFileUrl: async (filePath) => {
        calls.push([filePath]);
        return batchBehaviour([filePath]).get(filePath) || "";
      },
      getSignedFileUrls: async (filePaths) => {
        const distinct = [...new Set(filePaths)];
        calls.push(distinct);
        return batchBehaviour(distinct);
      }
    };
  }
  return originalLoad(request, parent, isMain);
};

const {
  attachOrganizationLogos,
  attachPopulatedOrganizationLogos
} = require("../mediaUrlService");

Module._load = originalLoad;

const DEAD_URL =
  "https://gnclmzdjxofuukvwhadl.supabase.co/storage/v1/object/public/get-ai-uploads/organization-logos/a.jpeg";

function application(companyName, filePath) {
  return {
    _id: `app-${companyName}-${filePath}`,
    status: "Pending",
    organizationId: filePath
      ? { companyName, logo: { filePath, fileType: "image", url: DEAD_URL } }
      : { companyName }
  };
}

test.beforeEach(() => {
  calls.length = 0;
  batchBehaviour = (filePaths) =>
    new Map(filePaths.map((filePath) => [filePath, `https://signed.test/${filePath}?token=jwt`]));
});

test("the stale public url is replaced by a signed one", async () => {
  const [row] = await attachPopulatedOrganizationLogos([application("aifagenlabs", "logos/a.jpeg")]);

  assert.equal(row.organizationId.logo.url, "https://signed.test/logos/a.jpeg?token=jwt");
  assert.equal(row.organizationId.logo.filePath, "logos/a.jpeg", "filePath survives");
  assert.equal(row.organizationId.companyName, "aifagenlabs", "sibling org fields survive");
  assert.equal(row.status, "Pending", "sibling record fields survive");
});

test("distinct filePaths are signed ONCE for the whole page, not once per row", async () => {
  const rows = await attachPopulatedOrganizationLogos([
    application("aifagenlabs", "logos/a.jpeg"),
    application("aifagenlabs", "logos/a.jpeg"),
    application("Kribud Webtech", "logos/k.jpeg"),
    application("Kribud Webtech", "logos/k.jpeg")
  ]);

  assert.equal(calls.length, 1, "four applications must cost ONE Supabase round-trip");
  assert.deepEqual(calls[0], ["logos/a.jpeg", "logos/k.jpeg"], "and two distinct signatures");
  assert.equal(rows.length, 4);
  assert.equal(rows[0].organizationId.logo.url, rows[1].organizationId.logo.url);
});

test("an organization with no logo is returned untouched, so CompanyLogo shows the initial", async () => {
  const [row] = await attachPopulatedOrganizationLogos([application("No Logo Ltd", "")]);

  assert.deepEqual(row.organizationId, { companyName: "No Logo Ltd" });
  assert.equal(calls.length, 0, "nothing to sign means no Supabase call at all");
});

test("an un-populated organizationId (bare id) passes through", async () => {
  const [row] = await attachPopulatedOrganizationLogos([
    { _id: "app-1", organizationId: "6a5e017cbdefbfcb1be6f774" }
  ]);

  assert.equal(row.organizationId, "6a5e017cbdefbfcb1be6f774");
  assert.equal(calls.length, 0);
});

test("a signing failure DROPS the stale url rather than re-serving a broken image", async () => {
  batchBehaviour = () => new Map();

  const [row] = await attachPopulatedOrganizationLogos([application("aifagenlabs", "logos/a.jpeg")]);

  assert.equal(row.organizationId.logo.url, undefined, "the dead public url must not survive");
  assert.equal("url" in row.organizationId.logo, false, "the key is omitted, never set to \"\"");
  assert.equal(row.organizationId.logo.filePath, "logos/a.jpeg", "filePath is kept so a retry works");
});

test("a whole-batch throw degrades to initials instead of failing the request", async () => {
  batchBehaviour = () => {
    throw new Error("supabase down");
  };

  const rows = await attachPopulatedOrganizationLogos([application("aifagenlabs", "logos/a.jpeg")]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].organizationId.logo.url, undefined);
});

test("mongoose documents are converted exactly once", async () => {
  let toObjectCalls = 0;
  const doc = {
    toObject() {
      toObjectCalls += 1;
      return application("aifagenlabs", "logos/a.jpeg");
    }
  };

  const [row] = await attachPopulatedOrganizationLogos([doc]);

  assert.equal(toObjectCalls, 1, "the caller must not need to call toObject() as well");
  assert.equal(row.organizationId.logo.url, "https://signed.test/logos/a.jpeg?token=jwt");
});

test("attachOrganizationLogos keeps its own contract (shared implementation)", async () => {
  const [organization] = await attachOrganizationLogos([
    { companyName: "aifagenlabs", logo: { filePath: "logos/a.jpeg", url: DEAD_URL } }
  ]);

  assert.equal(organization.logo.url, "https://signed.test/logos/a.jpeg?token=jwt");
});
