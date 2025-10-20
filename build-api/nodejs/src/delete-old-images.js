const { depot } = require("@depot/sdk-node");

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
};

// Configuration: Add image tags you want to exclude from deletion
// These images will not be deleted, regardless of age
//
// Supported formats:
//   1. "tagName" - Excludes this tag from ALL projects (e.g., "latest", "stable")
//   2. "projectId:tagName" - Excludes this tag only from a specific project
//      (e.g., "0m8b32xvgm:staging", "ps6ph7mcnp:v1.0.0")
//
// Examples:
//   "latest"              - Excludes "latest" from all projects
//   "0m8b32xvgm:dev"      - Excludes "dev" tag only from project 0m8b32xvgm
const EXCLUDED_IMAGES = ["latest", "stable", "production"];

/**
 * List all projects
 *
 * @returns {Promise<Array>} - Array of projects
 */
async function listAllProjects() {
  console.log("Fetching all projects...");
  const result = await depot.core.v1.ProjectService.listProjects(
    {},
    { headers }
  );
  console.log(`Found ${result.projects.length} projects\n`);
  return result.projects;
}

/**
 * List all images for a project with pagination support
 *
 * @param {string} projectId - The project ID to list images for
 * @returns {Promise<Array>} - Array of images
 */
async function listAllImages(projectId) {
  let allImages = [];
  let pageToken = undefined;
  let hasMore = true;

  console.log(`Fetching images for project ${projectId}...`);

  while (hasMore) {
    const result = await depot.build.v1.RegistryService.listImages(
      {
        projectId: projectId,
        pageSize: 100,
        pageToken: pageToken,
      },
      { headers }
    );

    if (result.images && result.images.length > 0) {
      allImages = allImages.concat(result.images);
      console.log(
        `Fetched ${result.images.length} images (total: ${allImages.length})`
      );
    }

    if (result.nextPageToken) {
      pageToken = result.nextPageToken;
    } else {
      hasMore = false;
    }
  }

  console.log(`Total images fetched: ${allImages.length}\n`);
  return allImages;
}

/**
 * Filter images older than specified days and not in exclusion list
 *
 * @param {Array} images - Array of image objects
 * @param {number} daysOld - Number of days to consider an image old
 * @param {string} projectId - The project ID being processed
 * @param {Array} excludedTags - Array of image tags to exclude (supports "tag" or "projectId:tag" format)
 * @returns {Object} - Object with {imagesToDelete: Array, digestsToDelete: Array}
 */
function filterOldImages(images, daysOld, projectId, excludedTags) {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);

  console.log(
    `Filtering images older than ${daysOld} days (before ${cutoffDate.toISOString()})`
  );
  console.log(`Excluded tags: ${excludedTags.join(", ")}\n`);

  const imagesToDelete = [];
  const digestsToDelete = new Set();
  const digestsToKeep = new Set();

  images.forEach((image) => {
    // Skip if no tag
    if (!image.tag) {
      console.log(
        `⊗ Skipping image with no tag. Image digest: ${
          image.digest || "unknown"
        }`
      );
      return;
    }

    // Extract the tag portion from the full registry path
    // Format: registry.depot.dev/projectId:tagName
    const tagParts = image.tag.split(":");
    const imageTag =
      tagParts.length > 1 ? tagParts[tagParts.length - 1] : image.tag;

    // Check if tag is in the exclusion list
    // Support two formats:
    //   1. Plain tag: "latest" (applies to all projects)
    //   2. Project-specific: "projectId:tag" (applies only to specific project)
    const isExcludedGlobally = excludedTags.includes(imageTag);
    const isExcludedForProject = excludedTags.includes(
      `${projectId}:${imageTag}`
    );

    if (isExcludedGlobally || isExcludedForProject) {
      const reason = isExcludedGlobally
        ? "globally excluded"
        : `excluded for project ${projectId}`;
      console.log(`⊗ Excluding image: ${imageTag} (${reason})`);
      // Track digest as one to keep
      if (image.digest) {
        digestsToKeep.add(image.digest);
      }
      return;
    }

    // Parse the pushed date
    let pushedDate;
    if (image.pushedAt) {
      if (image.pushedAt.seconds) {
        pushedDate = new Date(Number(image.pushedAt.seconds) * 1000);
      } else if (image.pushedAt.toDate) {
        pushedDate = image.pushedAt.toDate();
      } else {
        pushedDate = new Date(image.pushedAt);
      }

      // Check if image is older than or equal to cutoff date
      if (pushedDate <= cutoffDate) {
        console.log(
          `✓ Marking for deletion: ${imageTag} (pushed: ${pushedDate.toLocaleDateString()})`
        );
        // Store tag for deletion
        imagesToDelete.push({
          displayTag: imageTag,
          digest: image.digest,
        });
        // Track digest as candidate for deletion
        if (image.digest) {
          digestsToDelete.add(image.digest);
        }
      } else {
        console.log(
          `⊗ Keeping image: ${imageTag} (pushed: ${pushedDate.toLocaleDateString()}, too recent)`
        );
        // Track digest as one to keep
        if (image.digest) {
          digestsToKeep.add(image.digest);
        }
      }
    } else {
      console.log(`⚠️  Warning: Image ${imageTag} has no pushedAt date`);
      // If no date, keep it to be safe
      if (image.digest) {
        digestsToKeep.add(image.digest);
      }
    }
  });

  // Only delete digests that have NO remaining tag references
  // Remove any digest from deletion list if it's also in the keep list
  const safeDigestsToDelete = Array.from(digestsToDelete).filter(
    (digest) => !digestsToKeep.has(digest)
  );

  if (safeDigestsToDelete.length < digestsToDelete.size) {
    const skipped = digestsToDelete.size - safeDigestsToDelete.length;
    console.log(
      `\nℹ️  Skipping ${skipped} digest(s) that are still referenced by other tags\n`
    );
  }

  return {
    imagesToDelete,
    digestsToDelete: safeDigestsToDelete,
  };
}

/**
 * Delete images by their tags and safe digests
 * Uses deleteImage API (one image at a time)
 *
 * @param {string} projectId - The project ID
 * @param {Array} imageTags - Array of {displayTag} objects
 * @param {Array} safeDigests - Array of digest strings safe to delete
 * @param {boolean} dryRun - If true, don't actually delete (default: true)
 * @returns {Object} - Object with successCount and errorCount
 */
async function deleteImages(projectId, imageTags, safeDigests, dryRun = true) {
  if (imageTags.length === 0) {
    console.log("No images to delete for this project.");
    return { successCount: 0, errorCount: 0 };
  }

  console.log(`\n=== ${dryRun ? "DRY RUN" : "DELETING"} ===`);
  console.log(`Images to delete: ${imageTags.length}`);
  imageTags.forEach((img) => console.log(`  - ${img.displayTag}`));

  if (safeDigests.length > 0) {
    console.log(
      `Digests to delete: ${safeDigests.length} (only those with no remaining references)`
    );
  }

  if (dryRun) {
    return { successCount: 0, errorCount: 0 };
  }

  // Actually delete the images
  // Note: deleteImage accepts imageTags as an array (can be tags or digests)
  console.log("\nDeleting images...");
  const tagsToDelete = imageTags.map((img) => img.displayTag);

  let successCount = 0;
  let errorCount = 0;

  // Step 1: Delete by tags
  if (tagsToDelete.length > 0) {
    try {
      console.log(`Deleting ${tagsToDelete.length} image tag(s)...`);
      await depot.build.v1.RegistryService.deleteImage(
        {
          projectId: projectId,
          imageTags: tagsToDelete,
        },
        { headers }
      );
      console.log(`✓ Successfully deleted ${tagsToDelete.length} tag(s)`);
      successCount += tagsToDelete.length;
    } catch (error) {
      console.error(`✗ Failed to delete tags: ${error.message}`);
      errorCount += tagsToDelete.length;
    }
  }

  // Step 2: Delete by digests to remove the manifests/blobs
  // Only delete digests that have no remaining tag references
  // Convert digest format from "sha256:abc..." to "sha256-abc..." (tag format)
  if (safeDigests.length > 0) {
    const digestTags = safeDigests.map((digest) => digest.replace(":", "-"));
    try {
      console.log(`Deleting ${digestTags.length} image digest(s)...`);
      await depot.build.v1.RegistryService.deleteImage(
        {
          projectId: projectId,
          imageTags: digestTags,
        },
        { headers }
      );
      console.log(`✓ Successfully deleted ${digestTags.length} digest(s)`);
    } catch (error) {
      console.error(`✗ Failed to delete digests: ${error.message}`);
      // Don't increment error count since we already deleted the tags
    }
  }

  return { successCount, errorCount };
}

/**
 * Process a single project: list images, filter old ones, and delete them
 *
 * @param {string} projectId - The project ID
 * @param {string} projectName - The project name (for display)
 * @param {number} daysOld - Number of days to consider an image old
 * @param {boolean} dryRun - If true, don't actually delete
 * @returns {Object} - Object with successCount and errorCount
 */
async function processProject(projectId, projectName, daysOld, dryRun) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Processing project: ${projectName} (${projectId})`);
  console.log("=".repeat(80));

  try {
    // Fetch all images
    const images = await listAllImages(projectId);

    if (images.length === 0) {
      console.log("No images found for this project.");
      return { successCount: 0, errorCount: 0 };
    }

    // Filter old images
    const { imagesToDelete, digestsToDelete } = filterOldImages(
      images,
      daysOld,
      projectId,
      EXCLUDED_IMAGES
    );

    // Delete images (or dry run)
    return await deleteImages(
      projectId,
      imagesToDelete,
      digestsToDelete,
      dryRun
    );
  } catch (error) {
    console.error(`Error processing project ${projectName}: ${error.message}`);
    return { successCount: 0, errorCount: 0 };
  }
}

// Command line usage
const args = process.argv.slice(2);

// Parse arguments - handle both positional and optional project ID
let projectId = null;
let daysOld = 30;
let confirm = false;

// Check if first arg is --confirm or a number (days), meaning no project ID
if (args[0] && !args[0].startsWith("--") && isNaN(parseInt(args[0]))) {
  // First arg is project ID
  projectId = args[0];
  daysOld = args[1] && !args[1].startsWith("--") ? parseInt(args[1]) : 30;
  confirm = args.includes("--confirm");
} else {
  // No project ID provided
  daysOld = args[0] && !args[0].startsWith("--") ? parseInt(args[0]) : 30;
  confirm = args.includes("--confirm");
}

// Show help if invalid arguments
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: node delete-old-images.js [project-id] [days-old] [--confirm]"
  );
  console.log("\nDelete old images from Depot registry");
  console.log("\nArguments:");
  console.log(
    "  project-id    Optional. Project ID to process. If omitted, processes all projects."
  );
  console.log(
    "  days-old      Optional. Delete images older than this many days (default: 30)"
  );
  console.log(
    "  --confirm     Optional. Actually delete images (default is dry run)"
  );
  console.log("\nExamples:");
  console.log("  # Dry run for all projects (images older than 30 days)");
  console.log("  node delete-old-images.js");
  console.log("");
  console.log("  # Dry run for all projects (images older than 60 days)");
  console.log("  node delete-old-images.js 60");
  console.log("");
  console.log("  # Actually delete old images from all projects");
  console.log("  node delete-old-images.js 30 --confirm");
  console.log("");
  console.log("  # Dry run for specific project");
  console.log("  node delete-old-images.js abc123");
  console.log("");
  console.log("  # Dry run for specific project (60 days)");
  console.log("  node delete-old-images.js abc123 60");
  console.log("");
  console.log("  # Actually delete from specific project");
  console.log("  node delete-old-images.js abc123 30 --confirm");
  console.log(
    "\nNote: Edit the EXCLUDED_IMAGES array in the script to exclude specific tags from deletion"
  );
  process.exit(0);
}

if (isNaN(daysOld) || daysOld < 0) {
  console.error("Error: days-old must be a positive number");
  process.exit(1);
}

// Main execution
(async () => {
  try {
    let totalSuccess = 0;
    let totalErrors = 0;
    let totalProjects = 0;

    if (projectId) {
      // Process single project
      console.log(`=== Processing single project: ${projectId} ===\n`);
      const result = await processProject(
        projectId,
        projectId,
        daysOld,
        !confirm
      );
      totalSuccess = result.successCount;
      totalErrors = result.errorCount;
      totalProjects = 1;
    } else {
      // Process all projects
      console.log("=== Processing all projects ===\n");
      const projects = await listAllProjects();

      if (projects.length === 0) {
        console.log("No projects found.");
        process.exit(0);
      }

      for (const project of projects) {
        const result = await processProject(
          project.projectId,
          project.name || project.projectId,
          daysOld,
          !confirm
        );
        totalSuccess += result.successCount;
        totalErrors += result.errorCount;
        totalProjects++;
      }
    }

    // Final summary
    console.log(`\n${"=".repeat(80)}`);
    console.log("=== FINAL SUMMARY ===");
    console.log("=".repeat(80));
    console.log(`Projects processed: ${totalProjects}`);
    console.log(`Images deleted: ${totalSuccess}`);
    if (totalErrors > 0) {
      console.log(`Errors: ${totalErrors}`);
    }

    if (!confirm && (totalSuccess > 0 || totalErrors > 0)) {
      console.log("\n⚠️  This was a DRY RUN. No images were actually deleted.");
      console.log("To actually delete images, run with --confirm flag:");
      if (projectId) {
        console.log(
          `  node delete-old-images.js ${projectId} ${daysOld} --confirm`
        );
      } else {
        console.log(`  node delete-old-images.js ${daysOld} --confirm`);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
})();
