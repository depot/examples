const { depot } = require("@depot/sdk-node");

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
};

/**
 * List builds for a project with pagination support
 * Allows fetching more than 30 builds (up to any number you specify)
 *
 * @param {string} projectId - The project ID to list builds for
 * @param {number} maxBuilds - Maximum number of builds to fetch (default: 100)
 * @returns {Promise<Array>} - Array of builds
 */
async function listBuilds(projectId, maxBuilds = 100) {
  let allBuilds = [];
  let pageToken = undefined;
  let hasMore = true;

  // First, get the project to retrieve the organization ID
  console.log(`Fetching project details...`);
  const projectResult = await depot.core.v1.ProjectService.getProject(
    { projectId: projectId },
    { headers }
  );
  const organizationId = projectResult.project.organizationId;

  console.log(`Fetching up to ${maxBuilds} builds for project ${projectId}...`);

  while (hasMore && allBuilds.length < maxBuilds) {
    // Calculate how many more builds we need
    const pageSize = Math.min(100, maxBuilds - allBuilds.length);

    const result = await depot.core.v1.BuildService.listBuilds(
      {
        projectId: projectId,
        pageSize: pageSize,
        pageToken: pageToken,
      },
      { headers }
    );

    if (result.builds && result.builds.length > 0) {
      allBuilds = allBuilds.concat(result.builds);
      console.log(
        `Fetched ${result.builds.length} builds (total: ${allBuilds.length})`
      );
    }

    // Check if there are more pages
    if (result.nextPageToken) {
      pageToken = result.nextPageToken;
    } else {
      hasMore = false;
      console.log("No more builds available");
    }
  }

  console.log(`\nTotal builds fetched: ${allBuilds.length}`);
  return { builds: allBuilds, organizationId, projectId };
}

// Command line usage
const args = process.argv.slice(2);
const projectId = args[0];
const maxBuilds = args[1] ? parseInt(args[1]) : 100;

if (!projectId) {
  console.error("Usage: node list-builds.js <project-id> [max-builds]");
  console.error("\nExamples:");
  console.error(
    "  node list-builds.js abc123           # Fetch up to 100 builds"
  );
  console.error(
    "  node list-builds.js abc123 50        # Fetch up to 50 builds"
  );
  console.error(
    "  node list-builds.js abc123 200       # Fetch up to 200 builds"
  );
  console.error(
    "  node list-builds.js abc123 500       # Fetch up to 500 builds"
  );
  process.exit(1);
}

// Map status enum to signal/emoji
// https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.Build.Status
function getStatusSignal(status) {
  const statusMap = {
    0: "❓", // STATUS_UNSPECIFIED
    1: "⏳", // STATUS_RUNNING
    2: "❌", // STATUS_FAILED
    3: "✅", // STATUS_SUCCESS
    4: "⚠️ ", // STATUS_ERROR
    5: "🚫", // STATUS_CANCELLED
  };
  return statusMap[status] || "❓";
}

listBuilds(projectId, maxBuilds)
  .then((result) => {
    const { builds, organizationId, projectId } = result;
    console.log("\n=== Build Details ===");
    builds.forEach((build, index) => {
      const buildUrl = `https://depot.dev/orgs/${organizationId}/projects/${projectId}/builds/${build.buildId}`;
      console.log(
        `\n${index + 1}. Build ID: ${build.buildId || "N/A"}`
      );
      console.log(`   URL: ${buildUrl}`);
      if (build.createdAt) {
        // Convert protobuf Timestamp to JavaScript Date
        // Protobuf timestamps have seconds and nanos fields
        const timestamp = build.createdAt.seconds
          ? new Date(Number(build.createdAt.seconds) * 1000)
          : build.createdAt.toDate
          ? build.createdAt.toDate()
          : new Date(build.createdAt);
        console.log(`   Created: ${timestamp.toLocaleString()}`);
      }
      if (build.startedAt) {
        const timestamp = build.startedAt.seconds
          ? new Date(Number(build.startedAt.seconds) * 1000)
          : build.startedAt.toDate
          ? build.startedAt.toDate()
          : new Date(build.startedAt);
        console.log(`   Started: ${timestamp.toLocaleString()}`);
      }
      if (build.finishedAt) {
        const timestamp = build.finishedAt.seconds
          ? new Date(Number(build.finishedAt.seconds) * 1000)
          : build.finishedAt.toDate
          ? build.finishedAt.toDate()
          : new Date(build.finishedAt);
        console.log(`   Finished: ${timestamp.toLocaleString()}`);
      }
      if (build.status !== undefined) {
        console.log(`   Status: ${getStatusSignal(build.status)}`);
      }
      if (build.buildDurationSeconds) {
        console.log(`   Duration: ${build.buildDurationSeconds}s`);
      }
    });
  })
  .catch((error) => {
    console.error("Error fetching builds:", error.message);
    process.exit(1);
  });
