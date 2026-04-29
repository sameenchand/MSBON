from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_lambda as _lambda,
    aws_apigatewayv2 as apigwv2,
    aws_iam as iam,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
    aws_stepfunctions as sfn,
)
from aws_cdk.aws_apigatewayv2_integrations import HttpLambdaIntegration
from constructs import Construct
from pathlib import Path


BACKEND_DIR = str(Path(__file__).resolve().parent.parent.parent / "backend")


class ApiStack(Stack):
    """API Gateway + Lambda functions for the transcript verification API."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        transcript_bucket: s3.IBucket,
        transcripts_table: dynamodb.ITable,
        verifications_table: dynamodb.ITable,
        reviews_table: dynamodb.ITable,
        audit_table: dynamodb.ITable,
        verification_state_machine: sfn.IStateMachine,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        env_name = self.node.try_get_context("env") or "dev"

        # Shared Lambda layer for common utilities
        shared_layer = _lambda.LayerVersion(
            self,
            "SharedLayer",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/shared"),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_11],
            description="Shared utilities for MSBON lambdas",
        )

        # Common environment variables for all Lambdas
        common_env = {
            "TRANSCRIPT_BUCKET": transcript_bucket.bucket_name,
            "TRANSCRIPTS_TABLE": transcripts_table.table_name,
            "VERIFICATIONS_TABLE": verifications_table.table_name,
            "REVIEWS_TABLE": reviews_table.table_name,
            "AUDIT_TABLE": audit_table.table_name,
            "STATE_MACHINE_ARN": verification_state_machine.state_machine_arn,
            "ENV": env_name,
        }

        # Common IAM policy for Bedrock access
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

        # --- Lambda Functions ---

        upload_fn = _lambda.Function(
            self,
            "UploadFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/upload"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=256,
        )

        extract_fn = _lambda.Function(
            self,
            "ExtractFunction",
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

        verify_fn = _lambda.Function(
            self,
            "VerifyFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/verify"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(120),
            memory_size=1024,
        )
        verify_fn.add_to_role_policy(bedrock_policy)

        report_fn = _lambda.Function(
            self,
            "ReportFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/report"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(60),
            memory_size=512,
        )
        report_fn.add_to_role_policy(bedrock_policy)

        review_fn = _lambda.Function(
            self,
            "ReviewFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/review"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=256,
        )

        audit_fn = _lambda.Function(
            self,
            "AuditFunction",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.handler",
            code=_lambda.Code.from_asset(f"{BACKEND_DIR}/lambdas/audit"),
            layers=[shared_layer],
            environment=common_env,
            timeout=Duration.seconds(30),
            memory_size=256,
        )

        # Grant permissions
        for fn in [upload_fn, extract_fn, verify_fn, report_fn, review_fn, audit_fn]:
            transcript_bucket.grant_read_write(fn)
            transcripts_table.grant_read_write_data(fn)
            verifications_table.grant_read_write_data(fn)
            reviews_table.grant_read_write_data(fn)
            audit_table.grant_read_write_data(fn)

        verification_state_machine.grant_start_execution(upload_fn)

        # --- HTTP API Gateway ---
        self.api = apigwv2.HttpApi(
            self,
            "MsbonApi",
            api_name=f"msbon-api-{env_name}",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_origins=["*"],
                allow_methods=[
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.PUT,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allow_headers=["*"],
            ),
        )

        # Use payload format 1.0 so handlers can read httpMethod/path (REST-style fields)
        v1 = apigwv2.PayloadFormatVersion.VERSION_1_0

        # Routes
        self.api.add_routes(
            path="/transcripts",
            methods=[apigwv2.HttpMethod.POST, apigwv2.HttpMethod.GET],
            integration=HttpLambdaIntegration("UploadIntegration", upload_fn, payload_format_version=v1),
        )
        self.api.add_routes(
            path="/transcripts/{transcriptId}",
            methods=[apigwv2.HttpMethod.GET],
            integration=HttpLambdaIntegration("GetTranscriptIntegration", upload_fn, payload_format_version=v1),
        )
        self.api.add_routes(
            path="/transcripts/{transcriptId}/verify",
            methods=[apigwv2.HttpMethod.POST],
            integration=HttpLambdaIntegration("VerifyIntegration", upload_fn, payload_format_version=v1),
        )
        self.api.add_routes(
            path="/verifications/{transcriptId}",
            methods=[apigwv2.HttpMethod.GET],
            integration=HttpLambdaIntegration("GetVerificationIntegration", verify_fn, payload_format_version=v1),
        )
        self.api.add_routes(
            path="/reviews",
            methods=[apigwv2.HttpMethod.POST],
            integration=HttpLambdaIntegration("CreateReviewIntegration", review_fn, payload_format_version=v1),
        )
        self.api.add_routes(
            path="/reviews/{transcriptId}",
            methods=[apigwv2.HttpMethod.GET],
            integration=HttpLambdaIntegration("GetReviewsIntegration", review_fn, payload_format_version=v1),
        )
        self.api.add_routes(
            path="/audit/{transcriptId}",
            methods=[apigwv2.HttpMethod.GET],
            integration=HttpLambdaIntegration("GetAuditIntegration", audit_fn, payload_format_version=v1),
        )

        # Throttle the default stage: 100 req/s sustained, burst up to 50
        cfn_stage = self.api.default_stage.node.default_child  # type: ignore[union-attr]
        cfn_stage.default_route_settings = apigwv2.CfnStage.RouteSettingsProperty(
            throttling_burst_limit=50,
            throttling_rate_limit=100,
        )

        CfnOutput(self, "ApiUrl", value=self.api.url or "", description="API Gateway HTTP URL")

        # Store references for other stacks
        self.extract_fn = extract_fn
        self.verify_fn = verify_fn
        self.report_fn = report_fn
