/** A domain uses only an ACM public certificate and a standard, usage-priced CDN. */
export function domainTemplate(input: {
  hostname: string;
  bucketDomain: string;
  originAccessId: string;
  routerArn: string;
  headersPolicyId: string;
  stack: string;
}) {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description:
      "Forma owned-domain HTTPS delivery. Deploy in us-east-1 for CloudFront certificates.",
    Resources: {
      Certificate: {
        Type: "AWS::CertificateManager::Certificate",
        Properties: {
          DomainName: input.hostname,
          ValidationMethod: "DNS",
          CertificateExport: "DISABLED",
          DomainValidationOptions: [{ DomainName: input.hostname }],
          Tags: [{ Key: "FormaStack", Value: input.stack }],
        },
      },
      Distribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          Tags: [{ Key: "FormaStack", Value: input.stack }],
          DistributionConfig: {
            Enabled: true,
            Aliases: [input.hostname],
            Comment: `Forma domain ${input.hostname}`,
            PriceClass: "PriceClass_100",
            HttpVersion: "http2and3",
            IPV6Enabled: true,
            Origins: [
              {
                Id: "sites",
                DomainName: input.bucketDomain,
                OriginAccessControlId: input.originAccessId,
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            ViewerCertificate: {
              AcmCertificateArn: { Ref: "Certificate" },
              SslSupportMethod: "sni-only",
              MinimumProtocolVersion: "TLSv1.2_2021",
            },
            DefaultCacheBehavior: {
              TargetOriginId: "sites",
              ViewerProtocolPolicy: "redirect-to-https",
              Compress: true,
              AllowedMethods: ["GET", "HEAD"],
              CachedMethods: ["GET", "HEAD"],
              CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
              ResponseHeadersPolicyId: input.headersPolicyId,
              FunctionAssociations: [
                { EventType: "viewer-request", FunctionARN: input.routerArn },
              ],
            },
          },
        },
      },
    },
    Outputs: {
      Target: { Value: { "Fn::GetAtt": ["Distribution", "DomainName"] } },
      DistributionId: { Value: { Ref: "Distribution" } },
      CertificateArn: { Value: { Ref: "Certificate" } },
    },
  };
}
