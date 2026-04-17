import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({ region: "ap-south-1" });

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

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,OPTIONS"
      },
      body: ''
    };
  }

  try {
    const params = {
      TableName: "Chapters",
      // Optional: Filter out archived chapters
      // FilterExpression: "#status <> :archived",
      // ExpressionAttributeNames: { "#status": "status" },
      // ExpressionAttributeValues: { ":archived": { S: "archived" } }
    };
    
    const data = await dynamo.send(new ScanCommand(params));
    
    console.log('Raw DynamoDB data:', JSON.stringify(data.Items, null, 2));
    
    // Transform DynamoDB items using CORRECT field names
    const chapters = (data.Items || []).map(item => ({
      id: item.chapterId?.S || 'unknown',           // Fixed: chapterId not id
      name: item.chapterName?.S || 'Unknown Chapter', // Fixed: chapterName not name
      chapterHead: item.headName?.S || 'Not assigned', // Fixed: headName not chapterHead
      headEmail: item.headEmail?.S || '',             // Added: headEmail field
      description: item.description?.S || '',        // This field doesn't exist in your data
      school: item.school?.S || '',
      tags: normalizeTags(item.tags),
      status: item.status?.S || 'active',
      memberCount: item.memberCount?.N || '0',       // Added: memberCount (Number type)
      createdAt: item.createdAt?.S || '',            // Added: createdAt
      updatedAt: item.updatedAt?.S || ''             // Added: updatedAt
    }));
    
    console.log('Transformed chapters:', chapters);
    
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,OPTIONS"
      },
      body: JSON.stringify({ chapters })
    };
  } catch (error) {
    console.error("Error fetching chapters:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ 
        error: "Failed to fetch chapters", 
        details: error.message 
      })
    };
  }
};
