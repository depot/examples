const { depot } = require("@depot/sdk-node");

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
};

async function listProjects() {
  const result = await depot.core.v1.ProjectService.listProjects(
    {},
    { headers }
  );
  console.log(result.projects);
}

listProjects();
