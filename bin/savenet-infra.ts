#!/usr/bin/env node
import * as cdk from "aws-cdk-lib"
import { SaveNetWorkerStack } from "../lib/savenet-worker-stack"

const app = new cdk.App()
new SaveNetWorkerStack(app, "SaveNetWorkerStack")
