// VS Code in a box — a remote, multi-repo dev environment provisioned live on a
// Depot sandbox through the @depot/sandbox SDK, reachable from any browser via a
// Cloudflare quick tunnel. No prebuilt image: we boot Depot's plain base image
// and turn it into an authenticated, multi-repo VS Code in seconds.
//
//   DEPOT_TOKEN=...  \
//   REPOS="depot/cli sindresorhus/ky"  \
//     pnpm tsx vscode-workspace.ts
//
// For private repos it authenticates GitHub with a token — either GITHUB_TOKEN,
// or, if that's unset, whatever your local `gh` CLI is logged in as. With
// neither it clones public repos only.
//
// The SDK surface on display (all documented at
// https://depot.dev/docs/api/sandbox-sdk-reference):
//   Sandbox.create()      — boot a VM from the base image
//   sandbox.fs()          — a node:fs/promises-style filesystem, over RPC
//   sandbox.runCommand()  — run a command; stream .logs(), await .wait()/.output()
//   { detached: true }    — long-lived background processes (the editor, the tunnel)

import {execFile} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {promisify} from 'node:util'
import {createClient, Sandbox, type DirEntry} from '@depot/sandbox'

const execFileAsync = promisify(execFile)

// ── config, all from the environment — nothing about your laptop ───────────
const need = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

// `owner/repo` entries, separated by spaces, commas, or newlines.
const REPOS = need('REPOS')
  .split(/[\s,]+/)
  .filter(Boolean)
const client = createClient({token: need('DEPOT_TOKEN'), orgID: process.env.DEPOT_ORG_ID})

// A GitHub token for cloning private repos: GITHUB_TOKEN if set, otherwise ask
// the local gh CLI (`gh auth token` works whether gh stores the token in a file
// or the OS keyring). Undefined → clone public repos only.
const githubToken = async (): Promise<string | undefined> => {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  try {
    const {stdout} = await execFileAsync('gh', ['auth', 'token'])
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

const HOME = '/home/runner'
const PORT = 8080
const PASSWORD = randomBytes(12).toString('base64url')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── tiny ANSI palette (demo polish, no deps) ──────────────────────────────
const paint = (code: string) => (s: string | number) => `\x1b[${code}m${s}\x1b[0m`
const bold = paint('1')
const dim = paint('2')
const green = paint('32')
const yellow = paint('33')
const cyan = paint('36')
const step = (s: string) => console.log(`\n${cyan('▸')} ${bold(s)}`)
const ok = (s: string) => console.log(`  ${green('✓')} ${s}`)

const t0 = Date.now()
console.log(bold(`\n  Provisioning a ${REPOS.length}-repo VS Code workspace on a fresh Depot sandbox.`))

// Boot from the base image. No runtime → Depot's pre-cached default base image
// (Ubuntu 24.04), which runs natively on Depot's microVMs and boots in seconds.
step('Booting a sandbox from the base image')
const box = await Sandbox.create(client, {
  name: 'depot-workspace-box',
  resources: {vcpus: 8, memoryMb: 16384},
  timeoutMinutes: 240,
})
ok(`${box.sandboxId} — ${green(box.status ?? '?')} in ${yellow(`${Date.now() - t0}ms`)}`)

try {
  // The filesystem API mirrors node:fs/promises. Write the repo list, and (for
  // private repos) drop a token where gh expects it, so it never appears on a
  // command line. node:fs/promises shapes mean readFile/writeFile/mkdir, etc.
  step('Writing config with the fs module')
  const fs = box.fs()
  await fs.writeFile(`${HOME}/repos.txt`, REPOS.join('\n'))

  const token = await githubToken()
  if (token) {
    await fs.mkdir(`${HOME}/.config/gh`, {recursive: true})
    await fs.writeFile(`${HOME}/.config/gh/hosts.yml`, `github.com:\n    oauth_token: ${token}\n    git_protocol: https\n`)
    await fs.chmod(`${HOME}/.config/gh/hosts.yml`, 0o600)
    ok('repos.txt + hosts.yml written over RPC')
  } else {
    ok('repos.txt written over RPC (no token — cloning public repos)')
  }

  // gh and git already ship in the base image — just wire them up. runCommand
  // is a server-streaming call: iterate .logs() to watch output live, then
  // await .wait() for the command to finish.
  if (token) {
    step('Authenticating git')
    const auth = await box.runCommand({
      cmd: '/bin/bash',
      args: [
        '-c',
        'gh auth setup-git && git config --global user.name "$(gh api user --jq .name)" && echo "authed as $(gh api user --jq .login)"',
      ],
    })
    for await (const chunk of auth.logs()) process.stdout.write(dim(chunk.data))
    await auth.wait()
  }

  // Clone everything, shallow + parallel — watch it land repo by repo.
  step(`Cloning ${REPOS.length} repos (shallow, 8-way parallel)`)
  const clone = await box.runCommand({
    cmd: '/bin/bash',
    args: [
      '-c',
      `mkdir -p ${HOME}/ws && cd ${HOME}/ws
       xargs -P8 -I{} bash -c 'git clone --depth 1 https://github.com/{}.git >/dev/null 2>&1 && echo "  ${green('✓')} {}" || echo "  ${yellow('✗')} {}"' < ${HOME}/repos.txt`,
    ],
  })
  for await (const chunk of clone.logs()) process.stdout.write(chunk.data)
  await clone.wait()

  // Build the multi-root workspace file — fs again, this time readdir + write.
  step('Generating the .code-workspace')
  const entries = (await fs.readdir(`${HOME}/ws`, {withFileTypes: true})) as DirEntry[]
  const folders = entries
    .filter((e) => e.isDirectory())
    .map((e) => ({path: e.name, name: e.name}))
    .sort((a, b) => a.name.localeCompare(b.name))
  await fs.writeFile(
    `${HOME}/ws/workspace.code-workspace`,
    JSON.stringify({folders, settings: {'git.openRepositoryInParentFolders': 'always'}}, null, 2),
  )
  ok(`${folders.length} folders`)

  // ~/.local/bin isn't on the base PATH, so put it there for the editor's
  // terminal (fs.appendFile, no clobber) — that's where code-server lands.
  step('Wiring the terminal shell (PATH)')
  await fs.appendFile(`${HOME}/.bashrc`, '\n# depot workspace box\nexport PATH="$HOME/.local/bin:$PATH"\n')
  ok('~/.bashrc wired')

  // code-server is the editor; cloudflared exposes it over a public HTTPS quick
  // tunnel (no account, no DNS). Both are single static binaries: code-server's
  // installer auto-detects arch, and we map uname -m -> cloudflared's asset arch.
  step('Installing code-server + cloudflared')
  const install = await box.runCommand({
    cmd: '/bin/bash',
    args: [
      '-c',
      `set -e
       case "$(uname -m)" in x86_64) cfarch=amd64;; aarch64|arm64) cfarch=arm64;; *) cfarch=amd64;; esac
       curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=${HOME}/.local
       mkdir -p ${HOME}/.local/bin
       curl -fL --progress-bar "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$cfarch" -o ${HOME}/.local/bin/cloudflared
       chmod +x ${HOME}/.local/bin/cloudflared
       echo "  ${green('✓')} code-server + cloudflared (linux-$cfarch) installed"`,
    ],
  })
  for await (const chunk of install.logs()) process.stdout.write(chunk.data)
  await install.wait()

  // Long-lived processes run detached, so they outlive this script. detached is
  // still beta, so the SDK prints a notice per launch — we let it show.
  // code-server reads its password from $PASSWORD; binding to localhost is fine
  // because Cloudflare terminates TLS and proxies in.
  step('Serving the editor behind a Cloudflare quick tunnel (detached)')
  await box.runCommand({
    cmd: '/bin/bash',
    args: [
      '-c',
      `${HOME}/.local/bin/code-server --bind-addr 127.0.0.1:${PORT} --auth password ${HOME}/ws/workspace.code-workspace >/tmp/cs.log 2>&1`,
    ],
    env: {PASSWORD},
    detached: true,
  })
  await box.runCommand({
    cmd: '/bin/bash',
    args: ['-c', `${HOME}/.local/bin/cloudflared tunnel --no-autoupdate --url http://localhost:${PORT} >/tmp/cf.log 2>&1`],
    detached: true,
  })

  // Warm the workspace in the background: run `npm install` in every repo at
  // once, detached, so dependencies are landing while you're already in the
  // editor. node + npm ship in the base image, so there's nothing to set up.
  step('Kicking off background warm-up (npm install in every repo)')
  await box.runCommand({
    cmd: '/bin/bash',
    args: [
      '-c',
      `cd ${HOME}/ws
       for d in */; do ( cd "$d" && [ -f package.json ] && npm install && echo "npm install: $d ✓" ) & done
       wait
       echo done`,
    ],
    detached: true,
  })
  ok('running in background')

  // When I just want the output, .output() waits for the command and returns
  // everything it printed. Poll cf.log for the public URL the tunnel printed.
  step('Waiting for the public URL')
  let url = ''
  for (let i = 0; i < 45 && !url; i++) {
    const grep = await box.runCommand({
      cmd: '/bin/bash',
      args: ['-c', `grep -Eo 'https://[a-z0-9-]+\\.trycloudflare\\.com' /tmp/cf.log | head -1`],
    })
    url = (await grep.output()).trim()
    if (!url) await sleep(1000)
  }
  const probe = await box.runCommand({
    cmd: '/bin/bash',
    args: ['-c', `curl -s -o /dev/null -w '%{http_code}' http://localhost:${PORT}/login || echo 000`],
  })
  const health = (await probe.output()).trim()

  const line = cyan('─'.repeat(64))
  console.log(`\n${line}`)
  console.log(`  ${bold('Your workspace is live')} — ${green(`${folders.length} repos`)}, git authed, zero clicks`)
  console.log(
    `  ${dim('booted + provisioned in')} ${yellow(`${((Date.now() - t0) / 1000).toFixed(1)}s`)}` +
      `  ${dim('· editor health')} ${health.startsWith('2') ? green(health) : yellow(health)}`,
  )
  console.log(`\n  ${bold('OPEN')}     ${cyan(url || '(no URL yet — check /tmp/cf.log)')}`)
  console.log(`  ${bold('PASSWORD')} ${PASSWORD}\n`)
  console.log(dim(`  npm installs are finishing in the background across all repos`))
  console.log(dim(`  tear down: Sandbox.get(client, '${box.sandboxId}').then((s) => s.kill())`))
  console.log(line)
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`)
  await box.kill().catch(() => {})
  process.exit(1)
}

process.exit(0) // detached streams leave an HTTP/2 handle open; exit cleanly.
