#!/usr/bin/env python3
import aws_cdk as cdk
from stacks.storage_stack import StorageStack
from stacks.verification_stack import VerificationStack
from stacks.api_stack import ApiStack
from stacks.frontend_stack import FrontendStack

app = cdk.App()

env = cdk.Environment(region="us-east-1")

# Storage: S3 + DynamoDB
storage = StorageStack(app, "MsbonStorage", env=env)

# Verification pipeline: Step Functions + Lambda
verification = VerificationStack(
    app,
    "MsbonVerification",
    transcript_bucket=storage.transcript_bucket,
    transcripts_table=storage.transcripts_table,
    verifications_table=storage.verifications_table,
    audit_table=storage.audit_table,
    env=env,
)

# API: API Gateway + Lambda handlers
api = ApiStack(
    app,
    "MsbonApi",
    transcript_bucket=storage.transcript_bucket,
    transcripts_table=storage.transcripts_table,
    verifications_table=storage.verifications_table,
    reviews_table=storage.reviews_table,
    audit_table=storage.audit_table,
    verification_state_machine=verification.state_machine,
    env=env,
)

# Frontend: S3 + CloudFront
frontend = FrontendStack(app, "MsbonFrontend", env=env)

app.synth()
