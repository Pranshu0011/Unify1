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

    // Find user by email
    const userParams = {
      TableName: USERS_TABLE,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": { S: userEmail }
      }
    };

    const userResult = await dynamo.send(new ScanCommand(userParams));

    if (!userResult.Items || userResult.Items.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ chapters: [] })
      };
    }

    const user = userResult.Items[0];
    const registeredChapterNames = user.registeredChapters?.SS || user.registeredChapters?.L?.map(item => item.S) || [];

    if (registeredChapterNames.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ chapters: [] })
      };
    }

    // Get chapter details for registered chapters using chapterName field
    const chapterParams = {
      TableName: CHAPTERS_TABLE
    };

    const [allChaptersResult, allUsersResult] = await Promise.all([
      dynamo.send(new ScanCommand(chapterParams)),
      dynamo.send(new ScanCommand({
        TableName: USERS_TABLE,
        ProjectionExpression: "userId, email"
      }))
    ]);
    
    // Get all users to resolve head emails to head IDs (sub)
    const userMap = {}; // lowercase email -> userId (sub)
    allUsersResult.Items?.forEach(u => {
      if (u.email?.S && u.userId?.S) {
        userMap[u.email.S.toLowerCase()] = u.userId.S;
      }
    });
 
    // Filter chapters that the user is registered for
    const userChapters = (allChaptersResult.Items || [])
      .filter(chapter => registeredChapterNames.includes(chapter.chapterName?.S))
      .map(chapter => {
        const hEmail = (chapter.headEmail?.S || "").toLowerCase();
        return {
          id: chapter.chapterId?.S || 'unknown',
          name: chapter.chapterName?.S || 'Unknown Chapter',
          registeredAt: user.createdAt?.S || new Date().toISOString(),
          studentName: user.name?.S || 'Unknown',
          chapterHead: chapter.headName?.S || "Not assigned",
          headEmail: chapter.headEmail?.S || "", // Keep original case for display
          headId: userMap[hEmail] || chapter.headEmail?.S || "", // Use sub, fallback to original email
          school: chapter.school?.S || "",
          tags: normalizeTags(chapter.tags),
          status: chapter.status?.S || "active",
          memberCount: chapter.memberCount?.N || "0"
        };
      });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ chapters: userChapters })
    };

  } catch (error) {
    console.error("Error fetching student chapters:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: "Failed to fetch registered chapters",
        details: error.message 
      })
    };
  }
};
