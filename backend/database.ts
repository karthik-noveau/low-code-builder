import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { config, local } from "./config";

export const rawDb = new DynamoDBClient({
  region: config.region,
  ...(local
    ? {
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: "formaLocal",
          secretAccessKey: "localOnly",
        },
      }
    : {}),
});
export const db = DynamoDBDocumentClient.from(rawDb, {
  marshallOptions: { removeUndefinedValues: true },
});
export const siteKey = (owner: string, id: string) => ({
  pk: `USER#${owner}`,
  sk: `SITE#${id}`,
});
export async function getItem<T>(
  pk: string,
  sk: string,
): Promise<T | undefined> {
  return (
    await db.send(
      new GetCommand({
        TableName: config.table,
        Key: { pk, sk },
        ConsistentRead: true,
      }),
    )
  ).Item as T | undefined;
}
export async function putItem(item: Record<string, unknown>) {
  await db.send(new PutCommand({ TableName: config.table, Item: item }));
}
export async function deleteItem(pk: string, sk: string) {
  await db.send(
    new DeleteCommand({ TableName: config.table, Key: { pk, sk } }),
  );
}
export async function queryItems<T>(
  pk: string,
  prefix: string,
  limit = 100,
): Promise<T[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: config.table,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
      ConsistentRead: true,
      Limit: limit,
    }),
  );
  return (result.Items || []) as T[];
}
export async function initializeDatabase() {
  if (!local) throw new Error("Local initialization cannot run against AWS.");
  try {
    await rawDb.send(new DescribeTableCommand({ TableName: config.table }));
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "ResourceNotFoundException")
      throw error;
    await rawDb.send(
      new CreateTableCommand({
        TableName: config.table,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
      }),
    );
  }
}
