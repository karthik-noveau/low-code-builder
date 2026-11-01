/**
 * Hosted collaborators: the person an owner adds is found in the stack's
 * Cognito user pool by email, or created there, and Cognito emails them a
 * temporary password. Their `sub` is the id site access is keyed by, the
 * same claim the API reads from their token.
 */
import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { config, HttpError, insist } from "./config";

let client: CognitoIdentityProviderClient | undefined;
const cognito = () =>
  (client ??= new CognitoIdentityProviderClient({ region: config.region }));
const sub = (attributes: AttributeType[] | undefined) =>
  attributes?.find((a) => a.Name === "sub")?.Value;

async function find(pool: string, email: string) {
  const found = await cognito().send(
    new ListUsersCommand({
      UserPoolId: pool,
      // email() allows no quotes or backslashes, so this can't break out.
      Filter: `email = "${email}"`,
      Limit: 1,
    }),
  );
  return sub(found.Users?.[0]?.Attributes);
}
/** The collaborator's user id, inviting them to the pool if they're new. */
export async function cognitoUser(email: string) {
  const pool = process.env.USER_POOL_ID || "";
  insist(pool, 503, "Invitations need the stack's user pool (USER_POOL_ID).");
  insist(!/["\\]/.test(email), 422, "Enter a valid email address.");
  try {
    const existing = await find(pool, email);
    if (existing) return { id: existing, invited: false };
    const created = await cognito().send(
      new AdminCreateUserCommand({
        UserPoolId: pool,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      }),
    );
    const id = sub(created.User?.Attributes);
    insist(id, 502, "The user pool didn't return the new user.");
    return { id, invited: true };
  } catch (error) {
    // Someone else invited them a moment ago.
    if ((error as { name?: string }).name === "UsernameExistsException") {
      const id = await find(pool, email).catch(() => undefined);
      if (id) return { id, invited: false };
    }
    if (error instanceof HttpError) throw error;
    console.error("invite_failed", String(error).slice(0, 200));
    throw new HttpError(502, "Couldn’t invite that person. Try again.");
  }
}
