const { depot } = require("@depot/sdk-node");
const { exec } = require("child_process");

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
};

async function runBuildAndSave(projectID) {
  const result = await depot.build.v1.BuildService.createBuild(
    {
      projectId: projectID,
    },
    { headers }
  );

  /*
    Execute Depot CLI binary to build and save to Depot registry.
    --save stores the image to Depot's ephemeral registry, while --push is for external registries.
  */
  exec(
    "depot build --save .",
    {
      env: {
        ...process.env,
        DEPOT_PROJECT_ID: projectID,
        DEPOT_BUILD_ID: result.buildId,
        DEPOT_TOKEN: result.buildToken,
      },
    },
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing the binary: ${error}`);
        return;
      }

      console.log(`stdout:\n${stdout}`);
      console.error(`stderr:\n${stderr}`);
    }
  );
}

const args = process.argv.slice(2);
const projectID = args[0];

if (!projectID) {
  console.error("Usage: node create-build-with-save.js <project-id>");
  process.exit(1);
}

runBuildAndSave(projectID);
