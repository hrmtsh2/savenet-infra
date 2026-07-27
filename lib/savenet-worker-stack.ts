import * as cdk from "aws-cdk-lib"
import * as events from "aws-cdk-lib/aws-events"
import * as targets from "aws-cdk-lib/aws-events-targets"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaEvents from "aws-cdk-lib/aws-lambda-event-sources"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import * as sqs from "aws-cdk-lib/aws-sqs"
import { Construct } from "constructs"
import * as path from "path"

export class SaveNetWorkerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)
    const deadLetterQueue = new sqs.Queue(this, "AgentDeadLetterQueue", { retentionPeriod: cdk.Duration.days(14) })
    const jobs = new sqs.Queue(this, "AgentJobs", {
      visibilityTimeout: cdk.Duration.minutes(6),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
    })
    const workerAuthSecret = new secretsmanager.Secret(this, "WorkerAuthSecret", {
      description: "Shared token authorising the SaveNet background worker",
      generateSecretString: {
        generateStringKey: "token",
        secretStringTemplate: JSON.stringify({}),
        excludePunctuation: true,
      },
    })
    const worker = new NodejsFunction(this, "AgentWorker", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "../lambda/worker.js"),
      timeout: cdk.Duration.minutes(5),
      environment: {
        SAVENET_APP_URL: "https://savenet.am1.tech",
        CRON_SECRET_SECRET_ARN: workerAuthSecret.secretArn,
      },
    })
    workerAuthSecret.grantRead(worker)
    worker.addEventSource(new lambdaEvents.SqsEventSource(jobs, { batchSize: 1 }))
    new events.Rule(this, "DigestSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.SqsQueue(jobs, { message: events.RuleTargetInput.fromObject({ type: "dispatch-workers" }) })],
    })
    new cdk.CfnOutput(this, "AgentJobsQueueUrl", { value: jobs.queueUrl })
    new cdk.CfnOutput(this, "WorkerAuthSecretArn", { value: workerAuthSecret.secretArn })
  }
}
