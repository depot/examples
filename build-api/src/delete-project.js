const sdk_node = require('@depot/sdk-node');


const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
}


// Calls ProjectService.deleteProject API to delete a project
async function deleteProject(project_id) {
  await sdk_node.depot.core.v1.ProjectService.deleteProject(
    {
      projectId: project_id,
    },
    {headers}
  )
}


// Check if arguments provided are valid
const args = process.argv.slice(2); // 2nd index is beginning of args
if (args.length !== 1) {
    console.log('Usage: node delete-project.js <project-id>');
    process.exit(1); // Exit with error code 1
}


// Extract the first argument
const project_id = args[0];


// Delete a project
deleteProject(project_id);

