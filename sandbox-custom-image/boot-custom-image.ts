// Boot a Depot sandbox from a custom image built by Depot CI.
//
// ../.depot/workflows/build-sandbox-image.yml installs ffmpeg, ripgrep, and
// pandoc on a Depot CI sandbox and snapshots the result to the Depot registry.
// This script boots that snapshot with the Sandbox SDK and proves the tools are
// already there — against a control sandbox on the stock base image, which has
// to install them at boot.
//
//   DEPOT_TOKEN=...                                                               \
//   SANDBOX_IMAGE=<org-id>.registry.depot.dev/depot/snapshots/sandbox-toolbox:v1  \
//     pnpm start
//
// The SDK surface on display (all documented at
// https://depot.dev/docs/api/sandbox-sdk-reference):
//   Sandbox.create({runtime: {imageRef}})  — boot a VM from a custom image
//   sandbox.runCommand()                   — run a command; await .output()
//   sandbox.kill()                         — tear it down immediately

import {createClient, Sandbox, type CreateSandboxOpts} from '@depot/sandbox'

const need = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

const IMAGE = need('SANDBOX_IMAGE')
const client = createClient({token: need('DEPOT_TOKEN'), orgID: process.env.DEPOT_ORG_ID})

const TOOLS = ['ffmpeg', 'rg', 'pandoc']

// A snapshot inherits its CI sandbox's disk (150 GiB on depot-ubuntu-latest) and
// a sandbox can grow a disk but never shrink one, so the SDK's 100 GiB default
// fails with "disk shrinking is not supported". Both boxes get it, for a fair race.
const DISK_GB = 150

const paint = (code: string) => (s: string | number) => `\x1b[${code}m${s}\x1b[0m`
const bold = paint('1')
const dim = paint('2')
const green = paint('32')
const red = paint('31')
const yellow = paint('33')
const cyan = paint('36')
const step = (s: string) => console.log(`\n${cyan('▸')} ${bold(s)}`)
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

// runCommand executes argv directly with no shell, so `&&` needs bash. output()
// collects stdout and waits; wait() then resolves from what it already read.
const sh = async (box: Sandbox, script: string): Promise<string> => {
  const cmd = await box.runCommand({cmd: '/bin/bash', args: ['-c', script]})
  const out = await cmd.output('stdout')
  const {exitCode} = await cmd.wait()
  if (exitCode !== 0) throw new Error(`command exited ${exitCode}: ${script.split('\n')[0]}`)
  return out.trim()
}

// `exit 0` so a missing tool is an absent line, not a failed command.
const whichTools = (box: Sandbox) =>
  sh(box, `${TOOLS.map((t) => `command -v ${t} >/dev/null && echo ${t}`).join('; ')}; exit 0`)

type Booted = {box: Sandbox; bootMs: number}

const boot = async (label: string, opts: CreateSandboxOpts): Promise<Booted> => {
  const t0 = Date.now()
  const box = await Sandbox.create(client, opts)
  const bootMs = Date.now() - t0
  console.log(`  ${green('✓')} ${label} ${dim(box.sandboxId)} booted in ${yellow(secs(bootMs))}`)
  return {box, bootMs}
}

console.log(bold(`\n  Booting a sandbox from a Depot CI snapshot, against the stock base image.`))
console.log(dim(`  image: ${IMAGE}`))

step('Booting both sandboxes in parallel')
// allSettled, not all: a plain Promise.all would leave the other sandbox running.
const settled = await Promise.allSettled([
  boot('custom', {name: 'toolbox-custom', runtime: {imageRef: IMAGE}, resources: {diskGb: DISK_GB}, timeoutMinutes: 15}),
  boot('base  ', {name: 'toolbox-base', resources: {diskGb: DISK_GB}, timeoutMinutes: 15}),
])
const failure = settled.find((r) => r.status === 'rejected')
if (failure) {
  for (const r of settled) if (r.status === 'fulfilled') await r.value.box.kill().catch(() => {})
  throw failure.reason
}
const [custom, base] = settled.map((r) => (r as PromiseFulfilledResult<Booted>).value)

try {
  step('Checking which tools each image ships with')
  const [customHas, baseHas] = await Promise.all([whichTools(custom.box), whichTools(base.box)])
  const customSet = new Set(customHas.split('\n').filter(Boolean))
  const baseSet = new Set(baseHas.split('\n').filter(Boolean))

  const mark = (present: boolean) => (present ? green('present') : red('missing'))
  console.log(`\n  ${dim('tool'.padEnd(10))}${dim('custom image'.padEnd(16))}${dim('base image')}`)
  for (const tool of TOOLS) {
    const present = mark(customSet.has(tool)).padEnd(16 + 9)
    console.log(`  ${tool.padEnd(10)}${present}${mark(baseSet.has(tool))}`)
  }

  step('Installing the same tools on the base sandbox, for the comparison')
  const t0 = Date.now()
  await sh(base.box, 'sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg ripgrep pandoc')
  const installMs = Date.now() - t0
  console.log(`  ${green('✓')} done in ${yellow(secs(installMs))}`)

  const line = cyan('─'.repeat(64))
  console.log(`\n${line}`)
  if (TOOLS.every((t) => customSet.has(t))) {
    console.log(`  ${bold('The snapshot booted ready to work')} — all ${TOOLS.length} tools already on PATH`)
  } else {
    console.log(`  ${bold(yellow('Some tools were missing from the custom image'))} — see the table above`)
  }
  console.log(
    `  ${dim('custom')} ${yellow(secs(custom.bootMs))} to usable` +
      `   ${dim('·')}   ${dim('base')} ${yellow(secs(base.bootMs + installMs))} ` +
      dim(`(${secs(base.bootMs)} boot + ${secs(installMs)} install)`),
  )
  console.log(line)
} finally {
  step('Tearing down')
  await Promise.all([custom.box.kill(), base.box.kill()])
  console.log(`  ${green('✓')} both sandboxes killed`)
}

process.exit(0)
