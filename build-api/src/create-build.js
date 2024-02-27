const sdk_node = require('@depot/sdk-node');
const { exec } = require('child_process');


const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
}


// Calls BuildService.createBuild API to create build, then runs build by
// attaching it to Depot CLI
async function runBuild(project_id) {
  const result = await sdk_node.depot.build.v1.BuildService.createBuild(
    {
      projectId: project_id
    },
    {headers}
  )

  // Set env variables based on output from API call to run Depot CLI binary
  process.env.DEPOT_PROJECT_ID  = project_id;
  process.env.DEPOT_BUILD_ID    = result.buildId;
  process.env.DEPOT_TOKEN       = result.buildToken;

  // Execute Depot CLI binary to run build using previously set env variables
  // If the environment variables above are not properly set, the Depot CLI
  // will not know which build to attach to
  exec("depot build --load .", (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing the binary: ${error}`);
      return;
    }

    console.log(`stdout:\n${stdout}`);
    console.error(`stderr:\n${stderr}`);
  });
}


// Check if arguments provided are valid
const args = process.argv.slice(2); // 2nd index is beginning of args
if (args.length !== 1) {
    console.log('Usage: node create-build.js <project-id>');
    process.exit(1); // Exit with error code 1
}


// Extract the first argument
const project_id = args[0];


// Run build
runBuild(project_id);

