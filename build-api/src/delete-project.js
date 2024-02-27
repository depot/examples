const { depot } = require("@depot/sdk-node");

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
};

async function deleteProject(project_id) {
  await depot.core.v1.ProjectService.deleteProject(
    {
      projectId: project_id,
    },
    { headers }
  );
}

const project_id = args[0];

deleteProject(project_id);
