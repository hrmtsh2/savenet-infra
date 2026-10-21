const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager")

const secrets = new SecretsManagerClient({})
let cronSecret

async function getCronSecret() {
  if (cronSecret) return cronSecret
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.CRON_SECRET_SECRET_ARN }))
  const value = JSON.parse(result.SecretString || "{}")
  if (!value.token) throw new Error("Worker authentication secret has no token value")
  cronSecret = value.token
  return cronSecret
}

async function trigger(path) {
  const token = await getCronSecret()
  const response = await fetch(`${process.env.SAVENET_APP_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(110_000),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.slice(0, 500)}`)
  console.log(`${path}: ${body}`)
}

exports.handler = async (event) => {
  for (const record of event.Records) {
    const job = JSON.parse(record.body)
    if (job.type !== "dispatch-workers") {
      console.warn("Ignoring unknown SaveNet job", job.type)
      continue
    }
    await trigger("/api/internal/agent-worker")
    await trigger("/api/internal/digest-worker")
    await trigger("/api/internal/deleted-post-worker")
  }
}
