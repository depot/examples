# VS Code in a box, on a Depot sandbox

Boot a fresh [Depot sandbox](https://depot.dev/docs/api/sandbox-sdk-reference), clone a set of
GitHub repos into it, open them as a multi-root VS Code workspace, and reach the editor from any
browser over a public HTTPS URL — in about 15 seconds, from a single TypeScript file.

It starts from Depot's plain base image (no prebuilt image to maintain) and uses the
[`@depot/sandbox`](https://www.npmjs.com/package/@depot/sandbox) SDK to do everything live:

- **`Sandbox.create()`** boots a microVM from the base image.
- **`sandbox.fs()`** writes config over a `node:fs/promises`-style filesystem — the repo list, and a
  GitHub token for private repos.
- **`sandbox.runCommand()`** clones the repos, installs [code-server](https://github.com/coder/code-server)
  and [cloudflared](https://github.com/cloudflare/cloudflared), and streams the output back live.
- **`{detached: true}`** keeps the editor, the Cloudflare tunnel, and the background `npm install`
  running after the script exits.

## Run it

For private repos, set `GITHUB_TOKEN` — or just be logged in with the `gh` CLI (`gh auth login`) and
the script will use that token automatically.

```bash
pnpm install

DEPOT_TOKEN=...                       \
REPOS="depot/cli sindresorhus/ky"     \
  pnpm start
```

It prints a `https://<random>.trycloudflare.com` URL and a generated password. Open the URL, enter
the password, and you're in your repos. `npm install` finishes in the background while you work.

### Environment variables

| Variable        | Required | Description                                                                    |
| --------------- | -------- | ------------------------------------------------------------------------------ |
| `DEPOT_TOKEN`   | yes      | Your Depot API token.                                                          |
| `REPOS`         | yes      | `owner/repo` entries, separated by spaces, commas, or newlines.               |
| `GITHUB_TOKEN`  | no       | GitHub token for private repos. Falls back to `gh auth token` if unset.        |
| `DEPOT_ORG_ID`  | no       | Organization id, for app/service tokens or multi-org user tokens.             |

## Tear it down

Sandboxes stop themselves at their timeout (4 hours here), but you can kill one immediately:

```ts
import {createClient, Sandbox} from '@depot/sandbox'
const client = createClient({token: process.env.DEPOT_TOKEN!})
await Sandbox.get(client, 'your-sandbox-id').then((s) => s.kill())
```

> The Sandbox SDK is in private beta. [Contact us](https://depot.dev/help) to request access for
> your organization.
