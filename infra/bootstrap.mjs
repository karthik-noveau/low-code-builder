import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const ref = (Ref) => ({ Ref });
const sub = (value) => ({ "Fn::Sub": value });
const get = (name, attr) => ({ "Fn::GetAtt": [name, attr] });
const allow = (Action, Resource) => ({ Effect: "Allow", Action, Resource });
const trust = (service) => ({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: service },
      Action: "sts:AssumeRole",
    },
  ],
});

export function resolveOidcSubject(repository, environment, supplied) {
  const legacy = `repo:${repository}:environment:${environment}`;
  if (!supplied || supplied === legacy) return legacy;
  const match = supplied.match(
    /^repo:([A-Za-z0-9_.-]+)@\d+\/([A-Za-z0-9_.-]+)@\d+:environment:(development|production)$/,
  );
  if (
    !match ||
    `${match[1]}/${match[2]}` !== repository ||
    match[3] !== environment
  )
    throw new Error(
      "GITHUB_OIDC_SUBJECT must match this exact repository and environment, with optional immutable owner/repository IDs.",
    );
  return supplied;
}

export function bootstrapTemplate() {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description:
      "One-time Forma CI bootstrap: private artifacts, GitHub OIDC and scoped deployment roles. No fixed compute.",
    Parameters: {
      AppStack: { Type: "String", AllowedPattern: "^forma-[a-z0-9-]{1,40}$" },
      Repository: {
        Type: "String",
        AllowedPattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
      },
      Environment: {
        Type: "String",
        AllowedValues: ["development", "production"],
      },
      ExistingOidcProviderArn: { Type: "String", Default: "" },
      RepositorySubject: {
        Type: "String",
        Default: "",
        AllowedPattern:
          "^$|^repo:[A-Za-z0-9_.-]+(@[0-9]+)?/[A-Za-z0-9_.-]+(@[0-9]+)?:environment:(development|production)$",
      },
    },
    Conditions: {
      CreateOidc: { "Fn::Equals": [ref("ExistingOidcProviderArn"), ""] },
      HasRepositorySubject: {
        "Fn::Not": [{ "Fn::Equals": [ref("RepositorySubject"), ""] }],
      },
    },
    Resources: {
      Artifacts: {
        Type: "AWS::S3::Bucket",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
            ],
          },
          OwnershipControls: {
            Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
          },
          LifecycleConfiguration: {
            Rules: [
              {
                Id: "IncompleteUploads",
                Status: "Enabled",
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
              },
            ],
          },
        },
      },
      ArtifactPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: ref("Artifacts"),
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:*",
                Resource: [get("Artifacts", "Arn"), sub("${Artifacts.Arn}/*")],
                Condition: { Bool: { "aws:SecureTransport": "false" } },
              },
            ],
          },
        },
      },
      GitHubOidc: {
        Type: "AWS::IAM::OIDCProvider",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Condition: "CreateOidc",
        Properties: {
          Url: "https://token.actions.githubusercontent.com",
          ClientIdList: ["sts.amazonaws.com"],
        },
      },
      ExecutionRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: sub("${AppStack}-deployment-execution"),
          AssumeRolePolicyDocument: trust("cloudformation.amazonaws.com"),
          Policies: [
            {
              PolicyName: "forma-resources",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  allow("s3:*", [
                    sub("arn:${AWS::Partition}:s3:::${AppStack}-*"),
                    sub("arn:${AWS::Partition}:s3:::${AppStack}-*/*"),
                  ]),
                  allow("s3:GetObject", sub("${Artifacts.Arn}/*")),
                  allow(
                    "dynamodb:*",
                    sub(
                      "arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${AppStack}-*",
                    ),
                  ),
                  allow(
                    "lambda:*",
                    sub(
                      "arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${AppStack}-*",
                    ),
                  ),
                  allow(
                    "logs:*",
                    sub(
                      "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/${AppStack}-*",
                    ),
                  ),
                  allow(
                    "sqs:*",
                    sub(
                      "arn:${AWS::Partition}:sqs:${AWS::Region}:${AWS::AccountId}:${AppStack}-*",
                    ),
                  ),
                  allow(
                    [
                      "iam:CreateRole",
                      "iam:GetRole",
                      "iam:DeleteRole",
                      "iam:PutRolePolicy",
                      "iam:GetRolePolicy",
                      "iam:DeleteRolePolicy",
                      "iam:ListRolePolicies",
                      "iam:ListAttachedRolePolicies",
                      "iam:UpdateAssumeRolePolicy",
                      "iam:TagRole",
                      "iam:UntagRole",
                    ],
                    sub(
                      "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/${AppStack}-*",
                    ),
                  ),
                  {
                    ...allow(
                      "iam:PassRole",
                      sub(
                        "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/${AppStack}-*",
                      ),
                    ),
                    Condition: {
                      StringEquals: {
                        "iam:PassedToService": [
                          "lambda.amazonaws.com",
                          "cloudformation.amazonaws.com",
                        ],
                      },
                    },
                  },
                  // These services assign identifiers at creation, so bootstrap access cannot use the later stack outputs.
                  allow(
                    [
                      "cloudfront:CreateDistribution",
                      "cloudfront:CreateFunction",
                      "cloudfront:CreateKeyValueStore",
                      "cloudfront:CreateOriginAccessControl",
                      "cloudfront:CreateResponseHeadersPolicy",
                      "cloudfront:ListDistributions",
                      "cloudfront:ListFunctions",
                      "cloudfront:ListKeyValueStores",
                      "cloudfront:ListOriginAccessControls",
                      "cloudfront:ListResponseHeadersPolicies",
                    ],
                    "*",
                  ),
                  allow(
                    [
                      "cloudfront:GetDistribution",
                      "cloudfront:GetDistributionConfig",
                      "cloudfront:UpdateDistribution",
                      "cloudfront:DeleteDistribution",
                      "cloudfront:DescribeFunction",
                      "cloudfront:GetFunction",
                      "cloudfront:UpdateFunction",
                      "cloudfront:PublishFunction",
                      "cloudfront:DeleteFunction",
                      "cloudfront:DescribeKeyValueStore",
                      "cloudfront:UpdateKeyValueStore",
                      "cloudfront:DeleteKeyValueStore",
                      "cloudfront:GetOriginAccessControl",
                      "cloudfront:GetOriginAccessControlConfig",
                      "cloudfront:UpdateOriginAccessControl",
                      "cloudfront:DeleteOriginAccessControl",
                      "cloudfront:GetResponseHeadersPolicy",
                      "cloudfront:GetResponseHeadersPolicyConfig",
                      "cloudfront:UpdateResponseHeadersPolicy",
                      "cloudfront:DeleteResponseHeadersPolicy",
                      "cloudfront:TagResource",
                      "cloudfront:UntagResource",
                      "cloudfront:ListTagsForResource",
                    ],
                    sub(
                      "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:*",
                    ),
                  ),
                  allow(
                    "cognito-idp:*",
                    sub(
                      "arn:${AWS::Partition}:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/*",
                    ),
                  ),
                  allow(
                    [
                      "cognito-idp:CreateUserPool",
                      "cognito-idp:DescribeUserPoolDomain",
                    ],
                    "*",
                  ),
                  allow(
                    [
                      "apigateway:GET",
                      "apigateway:POST",
                      "apigateway:PUT",
                      "apigateway:PATCH",
                      "apigateway:DELETE",
                    ],
                    [
                      sub(
                        "arn:${AWS::Partition}:apigateway:${AWS::Region}::/apis",
                      ),
                      sub(
                        "arn:${AWS::Partition}:apigateway:${AWS::Region}::/apis/*",
                      ),
                    ],
                  ),
                  allow(
                    [
                      "lambda:CreateEventSourceMapping",
                      "lambda:GetEventSourceMapping",
                      "lambda:UpdateEventSourceMapping",
                      "lambda:DeleteEventSourceMapping",
                      "lambda:ListEventSourceMappings",
                    ],
                    "*",
                  ),
                ],
              },
            },
          ],
        },
      },
      DeployRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: sub("${AppStack}-github-deploy"),
          MaxSessionDuration: 3600,
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  Federated: {
                    "Fn::If": [
                      "CreateOidc",
                      ref("GitHubOidc"),
                      ref("ExistingOidcProviderArn"),
                    ],
                  },
                },
                Action: "sts:AssumeRoleWithWebIdentity",
                Condition: {
                  StringEquals: {
                    "token.actions.githubusercontent.com:aud":
                      "sts.amazonaws.com",
                    "token.actions.githubusercontent.com:sub": {
                      "Fn::If": [
                        "HasRepositorySubject",
                        ref("RepositorySubject"),
                        sub("repo:${Repository}:environment:${Environment}"),
                      ],
                    },
                  },
                },
              },
            ],
          },
          Policies: [
            {
              PolicyName: "deploy-forma",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  allow(
                    [
                      "s3:PutObject",
                      "s3:GetObject",
                      "s3:ListBucket",
                      "s3:GetBucketLocation",
                    ],
                    [
                      get("Artifacts", "Arn"),
                      sub("${Artifacts.Arn}/*"),
                      sub("arn:${AWS::Partition}:s3:::${AppStack}-*"),
                      sub("arn:${AWS::Partition}:s3:::${AppStack}-*/*"),
                    ],
                  ),
                  allow(
                    [
                      "cloudformation:CreateStack",
                      "cloudformation:UpdateStack",
                      "cloudformation:DescribeStacks",
                      "cloudformation:DescribeStackEvents",
                      "cloudformation:CreateChangeSet",
                      "cloudformation:DescribeChangeSet",
                      "cloudformation:DeleteChangeSet",
                      "cloudformation:ExecuteChangeSet",
                      "cloudformation:GetTemplate",
                    ],
                    sub(
                      "arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/${AppStack}/*",
                    ),
                  ),
                  allow(
                    [
                      "cloudformation:ValidateTemplate",
                      "cloudformation:GetTemplateSummary",
                    ],
                    "*",
                  ),
                  {
                    ...allow("iam:PassRole", get("ExecutionRole", "Arn")),
                    Condition: {
                      StringEquals: {
                        "iam:PassedToService": "cloudformation.amazonaws.com",
                      },
                    },
                  },
                  allow(
                    [
                      "cloudfront:CreateInvalidation",
                      "cloudfront:GetDistribution",
                    ],
                    sub(
                      "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/*",
                    ),
                  ),
                ],
              },
            },
          ],
        },
      },
    },
    Outputs: {
      ArtifactBucket: { Value: ref("Artifacts") },
      DeployRoleArn: { Value: get("DeployRole", "Arn") },
      ExecutionRoleArn: { Value: get("ExecutionRole", "Arn") },
      Region: { Value: ref("AWS::Region") },
      AppStack: { Value: ref("AppStack") },
    },
  };
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await mkdir(".build", { recursive: true });
  await writeFile(
    ".build/bootstrap.json",
    JSON.stringify(bootstrapTemplate(), null, 2),
  );
  console.log("Generated .build/bootstrap.json. No AWS resources created.");
}
