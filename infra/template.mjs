import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ref = (Ref) => ({ Ref });
const get = (id, attr) => ({ "Fn::GetAtt": [id, attr] });
const sub = (value) => ({ "Fn::Sub": value });
const editorUrl = {
  "Fn::If": [
    "HasEditorDomain",
    sub("https://${EditorDomain}"),
    sub("https://${EditorDistribution.DomainName}"),
  ],
};
const resource = (Type, Properties, extra = {}) => ({
  Type,
  Properties,
  ...extra,
});
const bucket = () =>
  resource(
    "AWS::S3::Bucket",
    {
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
            Id: "AbortIncompleteUploads",
            Status: "Enabled",
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
          },
        ],
      },
    },
    { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" },
  );
const trust = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};
const allow = (Action, Resource) => ({ Effect: "Allow", Action, Resource });
const origin = (bucketId) => ({
  Id: "s3",
  DomainName: get(bucketId, "RegionalDomainName"),
  OriginAccessControlId: ref("OriginAccess"),
  S3OriginConfig: { OriginAccessIdentity: "" },
});
const distribution = (bucketId, sites = false) =>
  resource("AWS::CloudFront::Distribution", {
    DistributionConfig: {
      Enabled: true,
      Comment: sub(
        `Forma ${sites ? "published sites" : "editor"} — ${"${AWS::StackName}"}`,
      ),
      PriceClass: "PriceClass_100",
      HttpVersion: "http2and3",
      IPV6Enabled: true,
      DefaultRootObject: sites ? undefined : "index.html",
      ...(!sites
        ? {
            CustomErrorResponses: [403, 404].map((code) => ({
              ErrorCode: code,
              ResponseCode: 404,
              ResponsePagePath: "/404.html",
              ErrorCachingMinTTL: 10,
            })),
          }
        : {}),
      Origins: [origin(bucketId)],
      ...(!sites
        ? {
            Aliases: {
              "Fn::If": [
                "HasEditorDomain",
                [ref("EditorDomain")],
                ref("AWS::NoValue"),
              ],
            },
          }
        : {}),
      ViewerCertificate: sites
        ? { CloudFrontDefaultCertificate: true }
        : {
            "Fn::If": [
              "HasEditorDomain",
              {
                AcmCertificateArn: ref("EditorCertificateArn"),
                SslSupportMethod: "sni-only",
                MinimumProtocolVersion: "TLSv1.2_2021",
              },
              { CloudFrontDefaultCertificate: true },
            ],
          },
      DefaultCacheBehavior: {
        TargetOriginId: "s3",
        ViewerProtocolPolicy: "redirect-to-https",
        Compress: true,
        AllowedMethods: ["GET", "HEAD", "OPTIONS"],
        CachedMethods: ["GET", "HEAD"],
        CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
        ResponseHeadersPolicyId: ref(sites ? "SiteHeaders" : "EditorHeaders"),
        FunctionAssociations: [
          {
            EventType: "viewer-request",
            FunctionARN: get(
              sites ? "SiteRouter" : "EditorRouter",
              "FunctionARN",
            ),
          },
        ],
      },
    },
  });
const policy = (bucketId, distributionId) =>
  resource("AWS::S3::BucketPolicy", {
    Bucket: ref(bucketId),
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Deny",
          Principal: "*",
          Action: "s3:*",
          Resource: [get(bucketId, "Arn"), sub(`\${${bucketId}.Arn}/*`)],
          Condition: { Bool: { "aws:SecureTransport": "false" } },
        },
        ...(distributionId
          ? [
              {
                Effect: "Allow",
                Principal: { Service: "cloudfront.amazonaws.com" },
                Action: "s3:GetObject",
                Resource: sub(`\${${bucketId}.Arn}/*`),
                Condition: {
                  ...(bucketId === "SitesBucket"
                    ? {
                        ArnLike: {
                          "AWS:SourceArn": sub(
                            "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/*",
                          ),
                        },
                      }
                    : {
                        StringEquals: {
                          "AWS:SourceArn": sub(
                            `arn:\${AWS::Partition}:cloudfront::\${AWS::AccountId}:distribution/\${${distributionId}}`,
                          ),
                        },
                      }),
                },
              },
            ]
          : []),
      ],
    },
  });

export const routerSource = `import cf from 'cloudfront';
const kvs = cf.kvs();
async function handler(event) {
  const request = event.request;
  if (request.method !== 'GET' && request.method !== 'HEAD') return {statusCode: 405};
  const host = (request.headers && request.headers.host ? request.headers.host.value : '').toLowerCase();
  let match;
  if (host && !host.endsWith('.cloudfront.net')) {
    let binding;
    try { binding = JSON.parse(await kvs.get('host:' + host)); } catch (_) { return {statusCode: 404}; }
    if (!/^[a-f0-9-]{36}$/.test(binding.siteId)) return {statusCode: 404};
    if (request.uri === '/.well-known/forma-domain') return {statusCode: 200, headers: {'content-type': {value:'application/json'}, 'cache-control': {value:'no-store'}}, body: JSON.stringify({hostname: host, siteId: binding.siteId, connectionId: binding.connectionId})};
    if (!binding.active) return {statusCode: 404};
    const pinned = /^\\/sites\\/([a-f0-9-]{36})\\/(releases\\/.*)$/.exec(request.uri);
    if (pinned && pinned[1] !== binding.siteId) return {statusCode: 404};
    match = ['', binding.siteId, pinned ? pinned[2] : request.uri.slice(1)];
  } else match = /^\\/sites\\/([a-f0-9-]{36})\\/(.*)$/.exec(request.uri);
  if (!match) return {statusCode: 404};
  let live;
  try { live = await kvs.get(match[1]); } catch (_) { return {statusCode: 404}; }
  const explicit = /^releases\\/([a-f0-9-]{36})\\/(.*)$/.exec(match[2]);
  const file = (explicit ? explicit[2] : match[2]) || 'index.html';
  if (!/^(?:(?:[a-z0-9-]+\\/)?[a-z0-9-]+\\.html|styles\\.css|images\\/[a-f0-9]{64}\\.(?:png|jpeg|gif|webp))$/.test(file)) return {statusCode: 404};
  request.uri = '/sites/' + match[1] + '/releases/' + (explicit ? explicit[1] : live) + '/' + file;
  return request;
}`;
export const editorRouterSource = `function handler(event) {
  var request = event.request;
  if (request.method !== 'GET' && request.method !== 'HEAD') return {statusCode: 405};
  var uri = request.uri;
  if (/^\\/(?:[a-z0-9-]+\\/)*[a-z0-9-]*$/.test(uri)) request.uri = uri.replace(/\\/$/, '') + '/index.html';
  return request;
}`;
export function template() {
  const R = {};
  R.Table = resource(
    "AWS::DynamoDB::Table",
    {
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      OnDemandThroughput: { MaxReadRequestUnits: 50, MaxWriteRequestUnits: 25 },
      TimeToLiveSpecification: { AttributeName: "expires", Enabled: true },
      SSESpecification: { SSEEnabled: true },
    },
    { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" },
  );
  R.DraftsBucket = bucket();
  R.SitesBucket = bucket();
  R.EditorBucket = bucket();
  R.OriginAccess = resource("AWS::CloudFront::OriginAccessControl", {
    OriginAccessControlConfig: {
      Name: sub("${AWS::StackName}-s3"),
      OriginAccessControlOriginType: "s3",
      SigningBehavior: "always",
      SigningProtocol: "sigv4",
    },
  });
  R.EditorRouter = resource("AWS::CloudFront::Function", {
    Name: sub("${AWS::StackName}-pages"),
    AutoPublish: true,
    FunctionCode: editorRouterSource,
    FunctionConfig: {
      Comment: "Static branded pages and workspace routes",
      Runtime: "cloudfront-js-2.0",
    },
  });
  R.Routes = resource("AWS::CloudFront::KeyValueStore", {
    Name: sub("${AWS::StackName}-routes"),
  });
  R.SiteRouter = resource("AWS::CloudFront::Function", {
    Name: sub("${AWS::StackName}-router"),
    AutoPublish: true,
    FunctionCode: routerSource,
    FunctionConfig: {
      Comment: "Atomic static releases, no visitor API calls",
      Runtime: "cloudfront-js-2.0",
      KeyValueStoreAssociations: [{ KeyValueStoreARN: get("Routes", "Arn") }],
    },
  });
  const headers = (site) =>
    resource("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: {
        Name: sub(
          site ? "${AWS::StackName}-sites" : "${AWS::StackName}-editor",
        ),
        SecurityHeadersConfig: {
          ContentTypeOptions: { Override: true },
          FrameOptions: { FrameOption: "DENY", Override: true },
          ReferrerPolicy: {
            ReferrerPolicy: "strict-origin-when-cross-origin",
            Override: true,
          },
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 31536000,
            IncludeSubdomains: true,
            Override: true,
          },
          ...(site
            ? {
                ContentSecurityPolicy: {
                  Override: true,
                  ContentSecurityPolicy:
                    "default-src 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self' https:; form-action 'self' https:; base-uri 'self'; frame-ancestors 'none'",
                },
              }
            : {}),
        },
        // Applied on the viewer response. S3's immutable headers still drive the edge cache.
        CustomHeadersConfig: {
          Items: [
            {
              Header: "Cache-Control",
              Value: "public,max-age=0,must-revalidate",
              Override: true,
            },
          ],
        },
      },
    });
  R.SiteHeaders = headers(true);
  R.EditorHeaders = headers(false);
  R.EditorDistribution = distribution("EditorBucket");
  // W1030 cannot infer that the empty optional ARN is unreachable in this
  // branch. EditorDomainNeedsCertificate requires both hostname and certificate.
  R.EditorDistribution.Metadata = {
    "cfn-lint": { config: { ignore_checks: ["W1030"] } },
  };
  R.SiteDistribution = distribution("SitesBucket", true);
  R.DraftsPolicy = policy("DraftsBucket");
  R.SitesPolicy = policy("SitesBucket", "SiteDistribution");
  R.EditorPolicy = policy("EditorBucket", "EditorDistribution");
  R.Users = resource(
    "AWS::Cognito::UserPool",
    {
      UserPoolName: sub("${AWS::StackName}-users"),
      UserPoolTier: "LITE",
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      UsernameConfiguration: { CaseSensitive: false },
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: false,
        },
      },
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
      },
      MfaConfiguration: "OFF",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    },
    { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" },
  );
  R.UserDomain = resource("AWS::Cognito::UserPoolDomain", {
    Domain: sub("${AWS::StackName}-${AWS::AccountId}"),
    UserPoolId: ref("Users"),
  });
  R.UserClient = resource("AWS::Cognito::UserPoolClient", {
    UserPoolId: ref("Users"),
    GenerateSecret: false,
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthFlows: ["code"],
    AllowedOAuthScopes: ["openid", "email"],
    SupportedIdentityProviders: ["COGNITO"],
    CallbackURLs: [{ "Fn::Join": ["", [editorUrl, "/"]] }],
    LogoutURLs: [{ "Fn::Join": ["", [editorUrl, "/"]] }],
    PreventUserExistenceErrors: "ENABLED",
    EnableTokenRevocation: true,
    AccessTokenValidity: 1,
    IdTokenValidity: 1,
    RefreshTokenValidity: 1,
    TokenValidityUnits: {
      AccessToken: "hours",
      IdToken: "hours",
      RefreshToken: "days",
    },
  });
  R.DeadLetters = resource("AWS::SQS::Queue", {
    SqsManagedSseEnabled: true,
    MessageRetentionPeriod: 604800,
  });
  R.PublishQueue = resource("AWS::SQS::Queue", {
    SqsManagedSseEnabled: true,
    VisibilityTimeout: 360,
    MessageRetentionPeriod: 86400,
    RedrivePolicy: {
      deadLetterTargetArn: get("DeadLetters", "Arn"),
      maxReceiveCount: 3,
    },
  });
  R.ApiLogs = resource("AWS::Logs::LogGroup", {
    LogGroupName: sub("/aws/lambda/${AWS::StackName}-api"),
    RetentionInDays: 7,
  });
  R.WorkerLogs = resource("AWS::Logs::LogGroup", {
    LogGroupName: sub("/aws/lambda/${AWS::StackName}-publisher"),
    RetentionInDays: 7,
  });
  const dbActions = [
    "dynamodb:GetItem",
    "dynamodb:Query",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem",
  ];
  R.DomainExecutionRole = resource("AWS::IAM::Role", {
    RoleName: sub("${AWS::StackName}-domains"),
    AssumeRolePolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "cloudformation.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    },
    Policies: [
      {
        PolicyName: "domain-resources",
        PolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              ...allow(["cloudfront:CreateDistribution"], "*"),
              Condition: {
                StringEquals: {
                  "aws:RequestTag/FormaStack": ref("AWS::StackName"),
                },
              },
            },
            {
              ...allow(
                ["cloudfront:TagResource"],
                sub(
                  "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/*",
                ),
              ),
              Condition: {
                StringEquals: {
                  "aws:RequestTag/FormaStack": ref("AWS::StackName"),
                },
              },
            },
            {
              ...allow(
                [
                  "cloudfront:GetDistribution",
                  "cloudfront:GetDistributionConfig",
                  "cloudfront:UpdateDistribution",
                  "cloudfront:DeleteDistribution",
                  "cloudfront:ListTagsForResource",
                  "cloudfront:UntagResource",
                ],
                sub(
                  "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/*",
                ),
              ),
              Condition: {
                StringEquals: {
                  "aws:ResourceTag/FormaStack": ref("AWS::StackName"),
                },
              },
            },
            {
              ...allow("acm:RequestCertificate", "*"),
              Condition: {
                StringEquals: {
                  "aws:RequestTag/FormaStack": ref("AWS::StackName"),
                  "aws:RequestedRegion": "us-east-1",
                },
              },
            },
            {
              ...allow(
                "acm:AddTagsToCertificate",
                sub(
                  "arn:${AWS::Partition}:acm:us-east-1:${AWS::AccountId}:certificate/*",
                ),
              ),
              Condition: {
                StringEquals: {
                  "aws:RequestTag/FormaStack": ref("AWS::StackName"),
                },
              },
            },
            allow(
              ["acm:DescribeCertificate", "acm:ListTagsForCertificate"],
              sub(
                "arn:${AWS::Partition}:acm:us-east-1:${AWS::AccountId}:certificate/*",
              ),
            ),
            {
              ...allow(
                ["acm:DeleteCertificate", "acm:RemoveTagsFromCertificate"],
                sub(
                  "arn:${AWS::Partition}:acm:us-east-1:${AWS::AccountId}:certificate/*",
                ),
              ),
              Condition: {
                StringEquals: {
                  "aws:ResourceTag/FormaStack": ref("AWS::StackName"),
                },
              },
            },
          ],
        },
      },
    ],
  });
  R.ApiRole = resource("AWS::IAM::Role", {
    RoleName: sub("${AWS::StackName}-api"),
    AssumeRolePolicyDocument: trust,
    Policies: [
      {
        PolicyName: "api",
        PolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            allow(
              [
                "cloudformation:CreateStack",
                "cloudformation:UpdateStack",
                "cloudformation:DeleteStack",
                "cloudformation:DescribeStacks",
                "cloudformation:DescribeStackResource",
                "cloudformation:DescribeStackEvents",
              ],
              sub(
                "arn:${AWS::Partition}:cloudformation:us-east-1:${AWS::AccountId}:stack/${AWS::StackName}-domain-*/*",
              ),
            ),
            {
              ...allow("iam:PassRole", get("DomainExecutionRole", "Arn")),
              Condition: {
                StringEquals: {
                  "iam:PassedToService": "cloudformation.amazonaws.com",
                },
              },
            },
            allow(
              "acm:DescribeCertificate",
              sub(
                "arn:${AWS::Partition}:acm:us-east-1:${AWS::AccountId}:certificate/*",
              ),
            ),
            allow(
              [
                "cloudfront-keyvaluestore:DescribeKeyValueStore",
                "cloudfront-keyvaluestore:UpdateKeys",
              ],
              get("Routes", "Arn"),
            ),
            allow(dbActions, get("Table", "Arn")),
            allow(
              ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
              sub("${DraftsBucket.Arn}/*"),
            ),
            allow("sqs:SendMessage", get("PublishQueue", "Arn")),
            allow(
              ["logs:CreateLogStream", "logs:PutLogEvents"],
              get("ApiLogs", "Arn"),
            ),
          ],
        },
      },
    ],
  });
  R.WorkerRole = resource("AWS::IAM::Role", {
    RoleName: sub("${AWS::StackName}-publisher"),
    AssumeRolePolicyDocument: trust,
    Policies: [
      {
        PolicyName: "publisher",
        PolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            allow(dbActions, get("Table", "Arn")),
            allow("s3:GetObject", sub("${DraftsBucket.Arn}/*")),
            allow(
              ["s3:PutObject", "s3:DeleteObject"],
              sub("${SitesBucket.Arn}/*"),
            ),
            // Per-release visitor action configs, read by the API's public inbox route.
            allow(
              ["s3:PutObject", "s3:DeleteObject"],
              sub("${DraftsBucket.Arn}/inbox/*"),
            ),
            allow(
              [
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes",
              ],
              get("PublishQueue", "Arn"),
            ),
            allow(
              [
                "cloudfront-keyvaluestore:DescribeKeyValueStore",
                "cloudfront-keyvaluestore:GetKey",
                "cloudfront-keyvaluestore:UpdateKeys",
              ],
              get("Routes", "Arn"),
            ),
            allow(
              ["logs:CreateLogStream", "logs:PutLogEvents"],
              get("WorkerLogs", "Arn"),
            ),
          ],
        },
      },
    ],
  });
  const environment = {
    FORMA_MODE: "aws",
    FORMA_STACK: ref("AWS::StackName"),
    DOMAIN_EXECUTION_ROLE: get("DomainExecutionRole", "Arn"),
    SITE_BUCKET_DOMAIN: get("SitesBucket", "RegionalDomainName"),
    ORIGIN_ACCESS_ID: ref("OriginAccess"),
    SITE_ROUTER_ARN: get("SiteRouter", "FunctionARN"),
    SITE_HEADERS_ID: ref("SiteHeaders"),
    TABLE_NAME: ref("Table"),
    DRAFTS_BUCKET: ref("DraftsBucket"),
    SITES_BUCKET: ref("SitesBucket"),
    QUEUE_URL: ref("PublishQueue"),
    KVS_ARN: get("Routes", "Arn"),
    SITE_ORIGIN: sub("https://${SiteDistribution.DomainName}"),
    API_ORIGIN: get("Api", "ApiEndpoint"),
    ASSET_DIR: "/var/task/images",
  };
  const fn = (worker) =>
    resource("AWS::Lambda::Function", {
      FunctionName: sub(
        worker ? "${AWS::StackName}-publisher" : "${AWS::StackName}-api",
      ),
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      Handler: worker ? "lambda.worker" : "lambda.handler",
      Timeout: worker ? 60 : 25,
      MemorySize: worker ? 512 : 256,
      Role: get(worker ? "WorkerRole" : "ApiRole", "Arn"),
      Environment: { Variables: environment },
      Code: { S3Bucket: ref("ArtifactBucket"), S3Key: ref("ArtifactKey") },
    });
  R.ApiFunction = fn(false);
  R.Publisher = fn(true);
  R.QueueTrigger = resource("AWS::Lambda::EventSourceMapping", {
    EventSourceArn: get("PublishQueue", "Arn"),
    FunctionName: ref("Publisher"),
    BatchSize: 1,
    FunctionResponseTypes: ["ReportBatchItemFailures"],
    ScalingConfig: { MaximumConcurrency: 2 },
  });
  R.Api = resource("AWS::ApiGatewayV2::Api", {
    Name: sub("${AWS::StackName}-api"),
    ProtocolType: "HTTP",
    CorsConfiguration: {
      AllowOrigins: [editorUrl],
      AllowMethods: ["GET", "POST", "PUT", "OPTIONS"],
      AllowHeaders: ["authorization", "content-type", "if-match"],
      ExposeHeaders: ["x-draft-version"],
      MaxAge: 600,
    },
  });
  R.Integration = resource("AWS::ApiGatewayV2::Integration", {
    ApiId: ref("Api"),
    IntegrationType: "AWS_PROXY",
    IntegrationUri: get("ApiFunction", "Arn"),
    PayloadFormatVersion: "2.0",
    TimeoutInMillis: 29000,
  });
  R.Authorizer = resource("AWS::ApiGatewayV2::Authorizer", {
    ApiId: ref("Api"),
    Name: "Cognito",
    AuthorizerType: "JWT",
    IdentitySource: ["$request.header.Authorization"],
    JwtConfiguration: {
      Audience: [ref("UserClient")],
      Issuer: sub("https://cognito-idp.${AWS::Region}.amazonaws.com/${Users}"),
    },
  });
  for (const [index, route] of [
    "GET /sites",
    "POST /sites",
    "GET /sites/{id}",
    "GET /sites/{id}/draft",
    "PUT /sites/{id}/draft",
    "GET /sites/{id}/releases",
    "GET /sites/{id}/domains",
    "POST /sites/{id}/domains",
    "POST /sites/{id}/domains/{domainId}/check",
    "POST /sites/{id}/domains/{domainId}/retry",
    "POST /sites/{id}/domains/{domainId}/disconnect",
    "POST /sites/{id}/domains/{domainId}/primary",
    "POST /sites/{id}/domains/{domainId}/remove",
    "POST /sites/{id}/publish",
    "POST /sites/{id}/rollback",
    "POST /sites/{id}/unpublish",
    "GET /sites/{id}/inbox",
    "POST /sites/{id}/inbox/{requestId}",
  ].entries()) {
    R[`Route${index}`] = resource("AWS::ApiGatewayV2::Route", {
      ApiId: ref("Api"),
      RouteKey: route,
      Target: sub("integrations/${Integration}"),
      AuthorizationType: "JWT",
      AuthorizerId: ref("Authorizer"),
      AuthorizationScopes: ["openid"],
    });
  }
  R.Health = resource("AWS::ApiGatewayV2::Route", {
    ApiId: ref("Api"),
    RouteKey: "GET /health",
    Target: sub("integrations/${Integration}"),
    AuthorizationType: "NONE",
  });
  // Visitor action forms on published sites post here without a token.
  R.InboxRoute = resource("AWS::ApiGatewayV2::Route", {
    ApiId: ref("Api"),
    RouteKey: "POST /inbox/{id}",
    Target: sub("integrations/${Integration}"),
    AuthorizationType: "NONE",
  });
  // After an order, booking or RSVP, visitors are sent here to see how to pay.
  R.InboxPaymentRoute = resource("AWS::ApiGatewayV2::Route", {
    ApiId: ref("Api"),
    RouteKey: "GET /inbox/{id}/requests/{requestId}",
    Target: sub("integrations/${Integration}"),
    AuthorizationType: "NONE",
  });
  R.Stage = resource("AWS::ApiGatewayV2::Stage", {
    ApiId: ref("Api"),
    StageName: "$default",
    AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingBurstLimit: 10, ThrottlingRateLimit: 5 },
    // The public form route gets its own budget so visitors can't starve the editor API.
    RouteSettings: {
      "POST /inbox/{id}": { ThrottlingBurstLimit: 5, ThrottlingRateLimit: 2 },
      "GET /inbox/{id}/requests/{requestId}": {
        ThrottlingBurstLimit: 5,
        ThrottlingRateLimit: 2,
      },
    },
  });
  R.Invoke = resource("AWS::Lambda::Permission", {
    Action: "lambda:InvokeFunction",
    FunctionName: ref("ApiFunction"),
    Principal: "apigateway.amazonaws.com",
    SourceArn: sub(
      "arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*",
    ),
  });
  const outputs = {
    EditorBucket: ref("EditorBucket"),
    EditorDistribution: ref("EditorDistribution"),
    EditorDefaultHost: get("EditorDistribution", "DomainName"),
    EditorUrl: editorUrl,
    SiteUrl: sub("https://${SiteDistribution.DomainName}"),
    ApiUrl: get("Api", "ApiEndpoint"),
    UserPoolId: ref("Users"),
    ClientId: ref("UserClient"),
    Issuer: sub("https://cognito-idp.${AWS::Region}.amazonaws.com/${Users}"),
    AuthDomain: sub(
      "https://${UserDomain}.auth.${AWS::Region}.amazoncognito.com",
    ),
    TableName: ref("Table"),
    DeadLetterQueueUrl: ref("DeadLetters"),
  };
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description:
      "Forma usage-based website builder: no fixed compute, private drafts, static releases.",
    Parameters: {
      ArtifactBucket: { Type: "String" },
      ArtifactKey: { Type: "String" },
      EditorDomain: {
        Type: "String",
        Default: "",
        AllowedPattern: "^$|^[a-z0-9][a-z0-9.-]+[a-z0-9]$",
      },
      EditorCertificateArn: {
        Type: "String",
        Default: "",
        AllowedPattern:
          "^$|^arn:aws:acm:us-east-1:[0-9]{12}:certificate/[a-f0-9-]+$",
      },
    },
    Conditions: {
      HasEditorDomain: {
        "Fn::Not": [{ "Fn::Equals": [ref("EditorDomain"), ""] }],
      },
    },
    Rules: {
      EditorDomainNeedsCertificate: {
        Assertions: [
          {
            Assert: {
              "Fn::Or": [
                {
                  "Fn::And": [
                    { "Fn::Equals": [ref("EditorDomain"), ""] },
                    { "Fn::Equals": [ref("EditorCertificateArn"), ""] },
                  ],
                },
                {
                  "Fn::And": [
                    {
                      "Fn::Not": [{ "Fn::Equals": [ref("EditorDomain"), ""] }],
                    },
                    {
                      "Fn::Not": [
                        { "Fn::Equals": [ref("EditorCertificateArn"), ""] },
                      ],
                    },
                  ],
                },
              ],
            },
            AssertDescription:
              "Supply both EditorDomain and its issued us-east-1 certificate ARN, or leave both empty.",
          },
        ],
      },
    },
    Resources: R,
    Outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, Value]) => [name, { Value }]),
    ),
  };
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await mkdir(".build", { recursive: true });
  await writeFile(".build/stack.json", JSON.stringify(template(), null, 2));
  console.log("Generated .build/stack.json. No AWS resources were created.");
}
