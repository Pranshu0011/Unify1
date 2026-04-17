import {
  DynamoDBClient,
  ScanCommand
} from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({ region: "ap-south-1" });
const USERS_TABLE = "Unify-Users";
const CHAPTERS_TABLE = "Chapters";

const normalizeTags = (tagsAttribute) => {
  if (!tagsAttribute) return [];
  const rawTags = tagsAttribute.SS || tagsAttribute.L?.map((item) => item.S) || [];
  return Array.from(
    new Set(
      rawTags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    
    if (!claims) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "No authorization claims found" })
      };
    }

    const userEmail = claims.email || 
                      claims['cognito:username'] || 
                      claims.username || 
                      claims.sub;

    if (!userEmail) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: "No email found in token"
        })
      };
    }

    // Get all chapters and user data in parallel
    const [allChapters, userResult] = await Promise.all([
      dynamo.send(new ScanCommand({
        TableName: CHAPTERS_TABLE,
        FilterExpression: "attribute_not_exists(#status) OR #status <> :archived",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":archived": { S: "archived" } }
      })),
      dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": { S: userEmail } }
      }))
    ]);

    // Get user's registered chapters
    let registeredChapterNames = new Set();
    if (userResult.Items && userResult.Items.length > 0) {
      const user = userResult.Items[0];
      const registeredChapters = user.registeredChapters?.SS || user.registeredChapters?.L?.map(item => item.S) || [];
      registeredChapterNames = new Set(registeredChapters);
    }

    // Filter out chapters student is already registered for
    const availableChapters = (allChapters.Items || [])
      .filter(chapter => {
        const chapterName = chapter.chapterName?.S;
        return chapterName && !registeredChapterNames.has(chapterName);
      })
      .map(chapter => ({
        id: chapter.chapterId?.S || 'unknown',
        name: chapter.chapterName?.S || 'Unknown Chapter',
        chapterHead: chapter.headName?.S || "Not assigned",
        headEmail: chapter.headEmail?.S || "",
        description: "", // Not available in your schema
        school: chapter.school?.S || "",
        tags: normalizeTags(chapter.tags),
        status: chapter.status?.S || "active",
        memberCount: chapter.memberCount?.N || "0",
        isRegistered: false
      }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ chapters: availableChapters })
    };

  } catch (error) {
    console.error("Error fetching available chapters:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: "Failed to fetch available chapters",
        details: error.message 
      })
    };
  }
};
