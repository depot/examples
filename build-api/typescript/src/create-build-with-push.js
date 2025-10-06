const { depot } = require("@depot/sdk-node");
const { exec } = require("child_process");

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
};

async function runBuildAndPush(projectID, imageTag) {
  const result = await depot.build.v1.BuildService.createBuild(
    {
      projectId: projectID,
    },
    { headers }
  );

  /*
    Execute Depot CLI binary to build and push to external registry.
    The --push flag pushes to the registry specified in the --tag parameter.
    Make sure you've authenticated with the registry using `docker login` first.
  */
  exec(
    `depot build --push --tag ${imageTag} .`,
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
const imageTag = args[1] || "docker.io/myuser/myapp:latest";

if (!projectID) {
  console.error(
    "Usage: node create-build-with-push.js <project-id> [image-tag]"
  );
  console.error(
    'Example: node create-build-with-push.js abc123 "docker.io/myuser/myapp:latest"'
  );
  process.exit(1);
}

runBuildAndPush(projectID, imageTag);
