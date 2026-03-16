from aws_cdk import (
    Stack,
    RemovalPolicy,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
)
from constructs import Construct


class StorageStack(Stack):
    """S3 buckets and DynamoDB tables for transcript verification."""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        env = self.node.try_get_context("env") or "dev"

        # S3 bucket for transcripts (raw PDFs, extracted text, reports)
        self.transcript_bucket = s3.Bucket(
            self,
            "TranscriptBucket",
            bucket_name=f"msbon-transcripts-{env}",
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            cors=[
                s3.CorsRule(
                    allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                    allowed_origins=["*"],
                    allowed_headers=["*"],
                )
            ],
        )

        # DynamoDB: Transcript metadata
        self.transcripts_table = dynamodb.Table(
            self,
            "TranscriptsTable",
            table_name=f"msbon-transcripts-{env}",
            partition_key=dynamodb.Attribute(
                name="transcriptId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # DynamoDB: Verification results
        self.verifications_table = dynamodb.Table(
            self,
            "VerificationsTable",
            table_name=f"msbon-verifications-{env}",
            partition_key=dynamodb.Attribute(
                name="verificationId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="transcriptId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        self.verifications_table.add_global_secondary_index(
            index_name="by-transcript",
            partition_key=dynamodb.Attribute(
                name="transcriptId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
        )

        # DynamoDB: Human review actions
        self.reviews_table = dynamodb.Table(
            self,
            "ReviewsTable",
            table_name=f"msbon-reviews-{env}",
            partition_key=dynamodb.Attribute(
                name="reviewId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="transcriptId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        self.reviews_table.add_global_secondary_index(
            index_name="by-transcript",
            partition_key=dynamodb.Attribute(
                name="transcriptId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp", type=dynamodb.AttributeType.STRING
            ),
        )

        # DynamoDB: Audit log (immutable trail)
        self.audit_table = dynamodb.Table(
            self,
            "AuditTable",
            table_name=f"msbon-audit-log-{env}",
            partition_key=dynamodb.Attribute(
                name="transcriptId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestampEvent", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
