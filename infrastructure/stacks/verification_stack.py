from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    aws_stepfunctions as sfn,
    aws_stepfunctions_tasks as tasks,
    aws_lambda as _lambda,
    aws_iam as iam,
    aws_logs as logs,
    aws_cloudwatch as cloudwatch,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
)
from constructs import Construct
from pathlib import Path


BACKEND_DIR = str(Path(__file__).resolve().parent.parent.parent / "backend")


class VerificationStack(Stack):
    """Step Functions workflow for the transcript verification pipeline."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        transcript_bucket: s3.IBucket,
        transcripts_table: dynamodb.ITable,
        verifications_table: dynamodb.ITable,
        audit_table: dynamodb.ITable,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        env_name = self.node.try_get_context("env") or "dev"

        # Shared Lambda layer
        shared_layer = _lambda.LayerVersion(
            self,
            "SharedLayerVerification",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/shared"),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_11],
            description="Shared utilities for verification pipeline",
        )

        common_env = {
            "TRANSCRIPT_BUCKET": transcript_bucket.bucket_name,
            "TRANSCRIPTS_TABLE": transcripts_table.table_name,
            "VERIFICATIONS_TABLE": verifications_table.table_name,
            "AUDIT_TABLE": audit_table.table_name,
            "ENV": env_name,
        }

        bedrock_policy = iam.PolicyStatement(
            actions=["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
            resources=["*"],
        )
        textract_policy = iam.PolicyStatement(
            actions=[
                "textract:StartDocumentAnalysis",
                "textract:GetDocumentAnalysis",
                "textract:DetectDocumentText",
                "textract:AnalyzeDocument",
            ],
            resources=["*"],
        )

        # Lambda functions for each step
        extract_fn = _lambda.Function(
            self,
            "PipelineExtractFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/extract"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(300),
            memory_size=1024,
        )
        extract_fn.add_to_role_policy(textract_policy)
        extract_fn.add_to_role_policy(bedrock_policy)
        transcript_bucket.grant_read_write(extract_fn)
        transcripts_table.grant_read_write_data(extract_fn)
        audit_table.grant_read_write_data(extract_fn)

        verify_fn = _lambda.Function(
            self,
            "PipelineVerifyFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/verify"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(120),
            memory_size=1024,
        )
        verify_fn.add_to_role_policy(bedrock_policy)
        transcript_bucket.grant_read(verify_fn)
        transcripts_table.grant_read_write_data(verify_fn)
        verifications_table.grant_read_write_data(verify_fn)
        audit_table.grant_read_write_data(verify_fn)

        report_fn = _lambda.Function(
            self,
            "PipelineReportFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/report"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(60),
            memory_size=512,
        )
        report_fn.add_to_role_policy(bedrock_policy)
        transcript_bucket.grant_read_write(report_fn)
        transcripts_table.grant_read_write_data(report_fn)
        verifications_table.grant_read_data(report_fn)
        audit_table.grant_read_write_data(report_fn)

        # Step Functions tasks
        extract_task = tasks.LambdaInvoke(
            self,
            "ExtractTranscript",
            lambda_function=extract_fn,
            output_path="$.Payload",
            retry_on_service_exceptions=True,
        )

        verify_task = tasks.LambdaInvoke(
            self,
            "VerifyTranscript",
            lambda_function=verify_fn,
            output_path="$.Payload",
            retry_on_service_exceptions=True,
        )

        report_task = tasks.LambdaInvoke(
            self,
            "GenerateReport",
            lambda_function=report_fn,
            output_path="$.Payload",
            retry_on_service_exceptions=True,
        )

        # Error handling
        extraction_error = sfn.Fail(
            self,
            "ExtractionFailed",
            cause="Transcript extraction failed",
            error="ExtractionError",
        )

        verification_error = sfn.Fail(
            self,
            "VerificationFailed",
            cause="Transcript verification failed",
            error="VerificationError",
        )

        success = sfn.Succeed(self, "VerificationComplete")

        # Build the workflow
        definition = (
            extract_task
            .add_catch(extraction_error, errors=["States.ALL"])
            .next(
                verify_task
                .add_catch(verification_error, errors=["States.ALL"])
                .next(
                    report_task
                    .add_catch(verification_error, errors=["States.ALL"])
                    .next(success)
                )
            )
        )

        workflow_log_group = logs.LogGroup(
            self,
            "VerificationWorkflowLogs",
            log_group_name=f"/aws/states/msbon-verification-{env_name}",
            retention=logs.RetentionDays.ONE_MONTH,
            removal_policy=RemovalPolicy.DESTROY,
        )

        self.state_machine = sfn.StateMachine(
            self,
            "VerificationWorkflow",
            state_machine_name=f"msbon-verification-{env_name}",
            definition_body=sfn.DefinitionBody.from_chainable(definition),
            timeout=Duration.minutes(10),
            state_machine_type=sfn.StateMachineType.EXPRESS,
            logs=sfn.LogOptions(
                destination=workflow_log_group,
                level=sfn.LogLevel.ALL,
                include_execution_data=True,
            ),
            tracing_enabled=True,
        )

        # CloudWatch alarms — Lambda error rates
        for fn, name in [
            (extract_fn, "Extract"),
            (verify_fn, "Verify"),
            (report_fn, "Report"),
        ]:
            cloudwatch.Alarm(
                self,
                f"{name}LambdaErrorAlarm",
                alarm_name=f"msbon-{name.lower()}-errors-{env_name}",
                alarm_description=f"MSBON {name} Lambda error rate elevated",
                metric=fn.metric_errors(period=Duration.minutes(5)),
                threshold=3,
                evaluation_periods=1,
                comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
                treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
            )

        # CloudWatch alarm — Step Functions execution failures
        cloudwatch.Alarm(
            self,
            "WorkflowFailureAlarm",
            alarm_name=f"msbon-workflow-failures-{env_name}",
            alarm_description="MSBON verification workflow execution failures",
            metric=self.state_machine.metric_failed(period=Duration.minutes(5)),
            threshold=2,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
