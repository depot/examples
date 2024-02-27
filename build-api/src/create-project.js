const { depot } = require("@depot/sdk-node");

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
};

async function createProject(project_name, organization_id) {
  const result = await depot.core.v1.ProjectService.createProject(
    {
      name: project_name,
      organizationId: organization_id,
      regionId: "us-east-1",
      cachePolicy: { keepBytes: 50 * 1024 * 1024 * 1024, keepDays: 14 }, // 50GB and 14 days
    },
    { headers }
  );
  console.log(result.project);
}

const project_name = args[0];
const organization_id = args[1];

createProject(project_name, organization_id);
