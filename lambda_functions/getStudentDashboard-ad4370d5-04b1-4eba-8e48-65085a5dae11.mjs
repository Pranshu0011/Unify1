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

    // Flexible email extraction
    const userEmail = claims.email || 
                      claims['cognito:username'] || 
                      claims.username || 
                      claims.sub;

    if (!userEmail) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: "No email found in token",
          availableClaims: Object.keys(claims)
        })
      };
    }

    console.log('Processing dashboard for user:', userEmail);

    // Find user by email in Unify-Users table
    const userParams = {
      TableName: USERS_TABLE,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": { S: userEmail }
      }
    };

    const [userResult, allChapters] = await Promise.all([
      dynamo.send(new ScanCommand(userParams)),
      dynamo.send(new ScanCommand({
        TableName: CHAPTERS_TABLE,
        FilterExpression: "attribute_not_exists(#status) OR #status <> :archived",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":archived": { S: "archived" } }
      }))
    ]);

    if (!userResult.Items || userResult.Items.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "User not found" })
      };
    }

    const user = userResult.Items[0];
    // registeredChapters is stored as an array in your schema
    const registeredChapters = user.registeredChapters?.SS || user.registeredChapters?.L?.map(item => item.S) || [];
    
    // Extract attendedEvents set
    const attendedEvents = user.attendedEvents?.SS || user.attendedEvents?.L?.map(item => item.S) || [];

    // Fetch events attended
    let eventsAttended = 0;
    try {
      const { ScanCommand } = await import("@aws-sdk/client-dynamodb");
      const eventRegs = await dynamo.send(new ScanCommand({
        TableName: "EventPayments",
        FilterExpression: "userId = :userId AND (paymentStatus = :completed OR paymentStatus = :na)",
        ExpressionAttributeValues: {
          ":userId": { S: user.userId.S },
          ":completed": { S: "COMPLETED" },
          ":na": { S: "NA" }
        }
      }));
      eventsAttended = eventRegs.Items ? eventRegs.Items.length : 0;
    } catch (err) {
      console.log('Event payments scan issue:', err.message);
    }

    // Fetch recent activity
    let recentActivities = [];
    try {
      const activitiesResult = await dynamo.send(new ScanCommand({
        TableName: "Activities",
        FilterExpression: "userId = :userId OR (attribute_not_exists(userId) AND chapterId IN (:chapters))",
        ExpressionAttributeValues: {
          ":userId": { S: user.userId.S },
          ":chapters": { L: registeredChapters.map(c => ({ S: c })) }
        }
      }));
      recentActivities = (activitiesResult.Items || [])
        .sort((a, b) => new Date(b.timestamp.S).getTime() - new Date(a.timestamp.S).getTime())
        .slice(0, 5)
        .map(a => ({
          id: a.activityId.S,
          message: a.message.S,
          timestamp: a.timestamp.S,
          type: a.type.S
        }));
    } catch (err) {
      console.log('Activities scan issue:', err.message);
    }

    const chapterNameSet = new Set(registeredChapters);
    const registeredChapterDetails = (allChapters.Items || [])
      .filter((chapter) => chapterNameSet.has(chapter.chapterName?.S || ''))
      .map((chapter) => ({
        id: chapter.chapterId?.S || '',
        name: chapter.chapterName?.S || 'Unknown Chapter',
        headName: chapter.headName?.S || 'Not assigned',
        memberCount: Number(chapter.memberCount?.N || 0),
        school: chapter.school?.S || '',
        tags: normalizeTags(chapter.tags)
      }));

    const dashboardData = {
      registeredChaptersCount: registeredChapters.length,
      totalAvailableChapters: allChapters.Items?.length || 0,
      eventsAttended,
      attendedEvents,
      registeredChapters: registeredChapters.map(chapter => ({
        name: chapter,
        registeredAt: user.createdAt?.S || new Date().toISOString()
      })),
      chapters: registeredChapterDetails,
      recentActivities,
      userEmail: userEmail,
      userName: user.name?.S || 'Unknown User'
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(dashboardData)
    };

  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: "Failed to fetch dashboard data",
        details: error.message 
      })
    };
  }
};
