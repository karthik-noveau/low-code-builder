import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { bootstrapTemplate, resolveOidcSubject } from "../infra/bootstrap.mjs";

const stack = process.env.FORMA_STACK,
  repository = process.env.GITHUB_REPOSITORY,
  environment = process.env.FORMA_ENVIRONMENT,
  region = process.env.AWS_REGION;
if (
  !/^forma-[a-z0-9-]{1,40}$/.test(stack || "") ||
  !/^[\w.-]+\/[\w.-]+$/.test(repository || "") ||
  !["development", "production"].includes(environment) ||
  !region
)
  throw new Error(
    "Set FORMA_STACK, GITHUB_REPOSITORY, FORMA_ENVIRONMENT (development/production), and AWS_REGION.",
  );
const subject = resolveOidcSubject(
  repository,
  environment,
  process.env.GITHUB_OIDC_SUBJECT,
);
await mkdir(".build", { recursive: true });
await writeFile(
  ".build/bootstrap.json",
  JSON.stringify(bootstrapTemplate(), null, 2),
);
if (!process.argv.includes("--apply")) {
  console.log(
    `Prepared .build/bootstrap.json for ${stack}, ${repository}, ${environment}, ${region}. Re-run with --apply using an authorized AWS CLI session to create the bootstrap.`,
  );
  process.exit(0);
}
const aws = (...args) =>
  execFileSync("aws", [...args, "--region", region], { encoding: "utf8" });
const identity = JSON.parse(aws("sts", "get-caller-identity"));
const expectedAccount = process.env.AWS_ACCOUNT_ID;
if (
  !/^\d{12}$/.test(expectedAccount || "") ||
  identity.Account !== expectedAccount
)
  throw new Error(
    "Set AWS_ACCOUNT_ID to the intended account. The signed-in account must match before provisioning.",
  );
// Reuse the account-wide GitHub identity provider rather than creating a conflicting provider.
const provider = `arn:aws:iam::${identity.Account}:oidc-provider/token.actions.githubusercontent.com`;
const providers = JSON.parse(aws("iam", "list-open-id-connect-providers"));
let existingProvider = providers.OpenIDConnectProviderList?.some(
  (item) => item.Arn === provider,
)
  ? provider
  : "";
try {
  const prior = JSON.parse(
    aws(
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      `${stack}-bootstrap`,
    ),
  ).Stacks[0];
  existingProvider =
    prior.Parameters?.find(
      (item) => item.ParameterKey === "ExistingOidcProviderArn",
    )?.ParameterValue || "";
} catch (error) {
  if (!String(error.stderr).includes("does not exist")) throw error;
}

aws(
  "cloudformation",
  "deploy",
  "--stack-name",
  `${stack}-bootstrap`,
  "--template-file",
  ".build/bootstrap.json",
  "--capabilities",
  "CAPABILITY_NAMED_IAM",
  "--no-fail-on-empty-changeset",
  "--parameter-overrides",
  `AppStack=${stack}`,
  `Repository=${repository}`,
  `Environment=${environment}`,
  `ExistingOidcProviderArn=${existingProvider}`,
  `RepositorySubject=${subject}`,
);
const outputs = JSON.parse(
  aws(
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    `${stack}-bootstrap`,
  ),
).Stacks[0].Outputs;
const values = Object.fromEntries(
  outputs.map((item) => [item.OutputKey, item.OutputValue]),
);
const vars = {
  AWS_ACCOUNT_ID: identity.Account,
  AWS_REGION: region,
  FORMA_STACK: stack,
  ARTIFACT_BUCKET: values.ArtifactBucket,
  AWS_DEPLOY_ROLE: values.DeployRoleArn,
  CF_EXECUTION_ROLE: values.ExecutionRoleArn,
};
await writeFile(
  ".build/github-environment.json",
  JSON.stringify({ repository, environment, variables: vars }, null, 2),
);
console.log(
  `Bootstrap ready. GitHub environment configuration is in .build/github-environment.json. Protect the production environment before enabling AWS_DEPLOY_ENABLED=true at repository level.`,
);
if (process.argv.includes("--configure-github")) {
  for (const [name, value] of Object.entries(vars))
    execFileSync(
      "gh",
      [
        "variable",
        "set",
        name,
        "--repo",
        repository,
        "--env",
        environment,
        "--body",
        value,
      ],
      { stdio: "inherit" },
    );
  console.log(
    "Environment variables configured. Deployment remains opt-in through AWS_DEPLOY_ENABLED.",
  );
}
