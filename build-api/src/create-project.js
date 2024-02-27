const sdk_node = require('@depot/sdk-node');


const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
}


// Calls ProjectService.createProject API to create a new project
async function createProject(project_name, organization_id) {
  const result = await sdk_node.depot.core.v1.ProjectService.createProject(
    {
      name:           project_name,
      organizationId: organization_id,
      regionId:       'us-east-1',
//      cachePolicy:    {keepBytes: 50 * 1024 * 1024 * 1024, keepDays: 14},
    },
    {headers},
  )
  console.log(result.project)
}


// Check if arguments provided are valid
const args = process.argv.slice(2); // 2nd index is beginning of args
if (args.length !== 2) {
    console.log('Usage: node create-project.js <project-name> <organization-id>');
    process.exit(1); // Exit with error code 1
}


// Extract the first argument
const project_name    = args[0];
const organization_id = args[1];


// Create a new project
createProject(project_name, organization_id);

