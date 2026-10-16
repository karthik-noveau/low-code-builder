# Owned domains: local development to live HTTPS

Forma supports two distinct addresses: the platform itself (the branded product pages, dashboard and editor), and each published website. Both support a hostname you already own. No registrar purchase, nameserver migration or new paid hosted zone is required by this implementation. Keep existing email/MX records intact.

## Try the entire flow locally

1. Run `npm run dev:local`, sign in at `http://127.0.0.1:5178`, and create/save a website.
2. In **Your websites**, open **Domains & publish**. Add a hostname such as `www.yourbusiness.test`.
3. Expand **Local DNS simulator**, choose **Apply displayed records locally**, then **Check connection**. Repeat when the certificate and routing records appear. Ownership, HTTPS and routing are separate stages.
4. Once connected, choose **Make primary**, then **Publish website**. Follow **Open local domain preview**. The path under `127.0.0.1:8788/__domains/…/` simulates a hostname without changing your computer's DNS or hosts file.
5. Edit and save in the editor, then publish again. Restore a retained release to roll back, disconnect/reconnect just the hostname, or unpublish every address. **Remove connection** releases the local quota while preserving drafts/releases.

Local mode persists simulated DNS in DynamoDB Local. It does not request public certificates, run CloudFormation, or alter real DNS. No AWS credentials are needed. Local domain exports are rejected by the real DNS-apply script.

## The Forma platform's own domain

First complete the [CI bootstrap and initial default-domain deployment](deployment.md). Download its `deployment-…` artifact to `.build/deployment.json`. This provides `EditorDefaultHost` for your actual distribution. Example hostnames below must be replaced with your own.

With an authorized AWS CLI session in the intended account:

```sh
export AWS_ACCOUNT_ID=YOUR_12_DIGIT_ACCOUNT_ID
export FORMA_STACK=forma-production
export EDITOR_DOMAIN=studio.yourdomain.com
npm run aws:editor-domain                   # generate certificate template only
npm run aws:editor-domain -- --request      # request the certificate in us-east-1
npm run aws:editor-domain -- --check        # display status and export DNS records
```

The certificate stack takes a short time to expose the validation CNAME. Run `--check` again if it is still initializing. Add the exported certificate CNAME using your DNS panel or the provider tool below. It is safe to create the routing record toward the existing default distribution while waiting; the new hostname will become usable only after the certificate/alias deployment finishes. Choose a new subdomain for a migration to avoid interrupting an existing website.

When `--check` reports `ISSUED`, set **both** `EDITOR_DOMAIN` and the printed `EDITOR_CERTIFICATE_ARN` in the corresponding GitHub environment and deploy again. The app's HTTPS alias, OAuth callback/logout origin, API CORS, canonical links and sitemap switch together. Set the hostname's CNAME to `EditorDefaultHost`; for an apex/root hostname use ALIAS A/AAAA or DNS-provider CNAME flattening. The deployment's public HTTPS checks require this routing record to exist. Keep the validation CNAME permanently for ACM renewal. See [AWS's CloudFront certificate requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html).

If the job fails at its final DNS/HTTPS smoke check, inspect `.build/deployment.json` in the always-uploaded deployment artifact, fix DNS, and rerun. Do not delete the data stack to fix DNS. An old editor origin is no longer a valid OAuth callback after switching; users should enter through the configured hostname.

## A published website's domain

On the deployed platform:

1. Sign in, open the saved website's **Domains & publish**, and add the exact hostname. `yourdomain.com` and `www.yourdomain.com` are separate connections; the initial quota is two per site.
2. Add its random `_forma` TXT record and choose **Check connection**. Only verified ownership can claim a hostname across workspaces or start its hosting resources.
3. Copy the ACM CNAME when it appears. In AWS the API creates a small CloudFormation stack in `us-east-1` containing only a non-exportable public ACM certificate and a standard CloudFront distribution. Checks retrieve its progress; no always-running worker polls DNS. DNS validation/edge deployment can take several minutes.
4. Add the routing record to the displayed CloudFront target. Use DNS-only/unproxied mode. For a root domain, use Route 53 ALIAS A/AAAA (`Z2FDTNDATAQYW2`) or your provider's apex CNAME flattening. If the provider lacks flattening, connect `www` instead.
5. Choose **Check connection**. Forma verifies current ownership and a valid HTTPS response identifying the exact website/connection. A resolving IP alone is not accepted. Once connected, select **Make primary** and **Publish website**.

The primary setting chooses the address shown by Forma; it does not redirect the other connected hostname/default address. Save editor changes before publishing from this page. All addresses use the same active release; a failed build leaves the previous complete release available. Root-relative assets work on every bound hostname without relying on the default distribution.

Checks are on demand. A missing ownership record discovered by a check disables delivery on that hostname. This is not a continuous DNS monitoring service. Keep TXT and validation CNAME records in place. Wildcards, internal names, IP addresses, provider-owned hostnames, paths and ports are rejected.

## Apply DNS with an existing provider

Choose **Download DNS records** in the workspace, or use `.build/editor-dns.json` from the editor-certificate tool. Preview the plan before applying it:

```sh
npm run dns:configure -- --records /path/to/forma-dns-export.json --provider route53
# Review .build/dns-plan.json, then use the existing public hosted-zone ID:
npm run dns:configure -- --records /path/to/forma-dns-export.json --provider route53 --zone ZONE_ID --apply
```

Route 53 apply uses the authorized AWS CLI session and requires matching `AWS_ACCOUNT_ID`. For Cloudflare:

```sh
npm run dns:configure -- --records /path/to/forma-dns-export.json --provider cloudflare
# Supply CLOUDFLARE_API_TOKEN in the environment, with zone-read and DNS-edit
# permissions limited to the intended zone. Do not commit or paste the token.
npm run dns:configure -- --records /path/to/forma-dns-export.json --provider cloudflare --zone ZONE_ID --apply
```

The script creates only missing, allowlisted ownership/ACM/CloudFront records in the supplied existing zone. Identical records are skipped; conflicts stop the operation rather than replacing an existing website or email setup. Route 53 changes are submitted as one CREATE-only batch. Cloudflare creates records individually; after a partial failure, rerun to create only the remainder. Credentials and tokens are never saved in the plan. Other providers can use the same exported records manually. Some DNS panels expect the host relative to the zone instead of the full name; verify the resulting full hostname.

## Remove, transfer, and recover

- **Disconnect:** disables content on this hostname, clears it as primary, and retains HTTPS resources for reconnecting. The default URL and website data remain.
- **Unpublish:** removes the website's publication pointer so every address and direct release URL stops serving it after edge propagation. Previously downloaded/cached files cannot be recalled.
- **Remove connection:** disables routing and deletes that connection's CloudFront/certificate stack. AWS removal is asynchronous; use **Check connection** until it disappears. Only then is the quota/hostname claim released. Remove obsolete DNS routing records in your provider afterward. Drafts and retained releases remain.
- **Transfer:** remove the old connection before claiming it in a different workspace. A new TXT proof cannot overwrite an already claimed hostname. Contact the installation's operator if the previous workspace is inaccessible.
- **Failed provisioning:** inspect the named `forma-…-domain-…` CloudFormation stack in `us-east-1`, correct permissions/DNS/quota conflicts and use **Retry provisioning**. A hostname already attached to another CloudFront distribution must be released there. Check restrictive CAA records if ACM cannot issue a certificate.

The domain stack is independently managed. Remove custom-domain connections before tearing down the main platform stack, since distributions reference its shared function, headers policy and private origin. Retained main-stack data continues to incur storage usage until deliberately removed.

## Cost and limits

This adds no instance, load balancer, NAT gateway, dedicated IP TLS, provisioned database capacity, scheduled DNS polling or CloudFront subscription plan. Delivery, edge operations and stored bytes remain usage charges. Non-exportable ACM public certificates integrated with CloudFront have no additional certificate charge under [ACM pricing](https://aws.amazon.com/certificate-manager/pricing/). Domain registration/renewal and your DNS provider's plan remain separate; Route 53 hosted zones have their own fees, so the scripts reuse an existing zone. This is not a zero-cost or hard-spending-cap promise.

Each connected hostname currently gets a standard distribution, so growth is bounded by your AWS certificate/distribution/function-association quotas. Two connections/site is an application guardrail, not a guarantee of account capacity. Use the development environment to verify account permissions, real DNS propagation, certificate renewal prerequisites, and edge behavior before production promotion.
