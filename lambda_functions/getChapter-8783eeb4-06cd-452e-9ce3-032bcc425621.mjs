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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS"
};

export const handler = async (event) => {
  console.log('Lambda function started');
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // Extract user information from JWT claims
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    console.log('JWT Claims:', claims);
    
    const userEmail = claims?.email;
    const userName = claims?.name;
    console.log('User info:', { userEmail, userName });

    console.log('Starting DynamoDB scan...');
    
    const params = {
      TableName: "Chapters"
    };
    
    const data = await dynamo.send(new ScanCommand(params));
    console.log('DynamoDB scan completed, items found:', data.Items?.length || 0);
    
    // DIAGNOSTIC: Log the EXACT structure of your DynamoDB items
    if (data.Items && data.Items.length > 0) {
      console.log('=== DIAGNOSTIC INFO ===');
      console.log('First item structure:', JSON.stringify(data.Items[0], null, 2));
      console.log('All items raw data:', JSON.stringify(data.Items, null, 2));
      console.log('Item keys in first item:', Object.keys(data.Items[0] || {}));
      console.log('======================');
    }
    
    // Enhanced transformation logic
    const chapters = (data.Items || []).map((item, index) => {
      console.log(`Processing item ${index}:`, JSON.stringify(item, null, 2));
      
      const id = item.id?.S || 
                 item.ID?.S || 
                 item.chapterId?.S || 
                 item.chapter_id?.S ||
                 item.pk?.S ||
                 `chapter-${index}`;
      
      const name = item.name?.S || 
                   item.Name?.S || 
                   item.chapterName?.S || 
                   item.chapter_name?.S ||
                   item.title?.S ||
                   'Unknown Chapter';
      
      const chapterHead = item.chapterHead?.S || 
                          item.ChapterHead?.S || 
                          item.chapter_head?.S ||
                          item.head?.S ||
                          item.leader?.S ||
                          'Not assigned';
      
      const description = item.description?.S || 
                          item.Description?.S || 
                          item.desc?.S ||
                          item.about?.S ||
                          '';
      
      const status = item.status?.S || 
                     item.Status?.S || 
                     item.state?.S ||
                     'active';
      
      const transformedItem = {
        id,
        name,
        chapterHead,
        description,
        school: item.school?.S || '',
        tags: normalizeTags(item.tags),
        status
      };
      
      console.log(`Transformed item ${index}:`, transformedItem);
      return transformedItem;
    });
    
    console.log('Final transformed chapters:', JSON.stringify(chapters, null, 2));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        chapters,
        debug: {
          itemCount: data.Items?.length || 0,
          rawItemKeys: data.Items?.[0] ? Object.keys(data.Items[0]) : [],
          userInfo: { userEmail, userName }
        }
      })
    };
    
  } catch (error) {
    console.error("Error fetching chapters:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: "Failed to fetch chapters", 
        details: error.message,
        stack: error.stack
      })
    };
  }
};
