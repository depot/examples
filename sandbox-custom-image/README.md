# Custom sandbox images, baked by Depot CI

Sandboxes boot from Depot's base image by default. If your workload needs tools that aren't in it,
you can install them at boot — or bake them in once and boot a sandbox that's already ready.

This example does the second, in two steps:

1. **[`../.depot/workflows/build-sandbox-image.yml`](../.depot/workflows/build-sandbox-image.yml)** —
   a Depot CI workflow that installs `ffmpeg`, `ripgrep`, and `pandoc`, then snapshots the whole
   sandbox filesystem into your org's Depot registry.
2. **[`boot-custom-image.ts`](./boot-custom-image.ts)** — a Sandbox SDK script that boots that
   snapshot with `runtime: {imageRef: ...}`, alongside a control sandbox on the stock base image, and
   prints which tools each one shipped with plus what the base image spends installing them.

The image lives in your org's Depot registry, so the SDK pulls it with your Depot token — no
registry credentials to wire up.

## 1. Build the image

One key does it. [`snapshot`](https://depot.dev/docs/ci/how-to-guides/custom-images) captures the
sandbox after the job's steps finish and pushes it as a reusable image:

```yaml
jobs:
  build-image:
    runs-on: depot-ubuntu-latest
    snapshot: sandbox-toolbox:v1
    steps:
      - name: Install the tools to bake in
        run: sudo apt-get update && sudo apt-get install -y ffmpeg ripgrep pandoc
```

Depot CI workflows live in `.depot/workflows/`, not `.github/workflows/` — they run on Depot CI, not
GitHub Actions. Once it's on your default branch you can dispatch it from the Depot dashboard or with
`depot ci dispatch`. Before that, run it straight off your working tree, no commit needed:

```bash
depot ci run --workflow .depot/workflows/build-sandbox-image.yml --follow
```

Snapshot jobs check for the tag first and skip the whole job if it already exists — so bump the
version when the tool list changes. The result lands at:

```
<org-id>.registry.depot.dev/depot/snapshots/sandbox-toolbox:v1
```

(plus a `:latest` tag pointing at the same digest). `depot org list` prints your org id, or copy it
from <https://depot.dev/orgs>.

> **The snapshot captures the filesystem, not the shell.** `apt` packages land on the default `PATH`
> and survive as-is. Anything that depends on an exported environment variable — a `PATH` entry added
> by an installer, a `.bashrc` line sourced only for interactive shells — does not. Install to a
> directory already on `PATH` (like `/usr/local/bin`) instead.

> **Match the disk size when you boot it.** A snapshot carries the disk size of the CI sandbox it was
> taken on — 150 GiB on `depot-ubuntu-latest` — and a sandbox can grow a disk but never shrink one.
> Booting this image on the SDK's 100 GiB default fails with `disk shrinking is not supported`, so
> pass `resources: {diskGb: 150}`.

## 2. Boot it

```bash
pnpm install

DEPOT_TOKEN=...                                                                \
SANDBOX_IMAGE=<org-id>.registry.depot.dev/depot/snapshots/sandbox-toolbox:v1   \
  pnpm start
```

The whole custom-image surface is one field on `Sandbox.create()`:

```ts
const box = await Sandbox.create(client, {
  runtime: {imageRef: '<org-id>.registry.depot.dev/depot/snapshots/sandbox-toolbox:v1'},
  resources: {diskGb: 150},
})
```

Omit `runtime` and you get the base image — which is exactly what the control sandbox in the script
does, so you can see the difference side by side:

```
  tool      custom image    base image
  ffmpeg    present         missing
  rg        present         missing
  pandoc    present         missing

  The snapshot booted ready to work — all 3 tools already on PATH
  custom 5.8s to usable   ·   base 74.4s (3.3s boot + 71.1s install)
```

### Environment variables

| Variable        | Required | Description                                                        |
| --------------- | -------- | ------------------------------------------------------------------ |
| `DEPOT_TOKEN`   | yes      | Your Depot API token.                                              |
| `SANDBOX_IMAGE` | yes      | The image the workflow pushed.                                     |
| `DEPOT_ORG_ID`  | no       | Organization id, for app/service tokens or multi-org user tokens.  |

## Which images can a sandbox boot?

Images in your own Depot registry (`<org-id>.registry.depot.dev/...`) and public registry images.
Private third-party registries aren't supported — there's nowhere to hand Depot those credentials.
An image that can't be pulled fails the boot rather than silently falling back.

Build for **amd64**: Depot's sandbox pool is x86_64, and `depot-ubuntu-latest` matches, so a snapshot
taken there boots as-is.

> The Sandbox SDK is in private beta. [Contact us](https://depot.dev/help) to request access for
> your organization.
