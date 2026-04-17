// index.mjs - Node.js 22 ES Module format for AWS Lambda
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const bedrockClient = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || 'us-east-1' });
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0';

// Helper: Extract user email from JWT token
const getUserEmailFromToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = Buffer.from(paddedPayload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decodedPayload);
    return parsed.email || parsed['cognito:username'] || parsed.username;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

// Helper: Get user by email
const getUserByEmail = async (email) => {
  try {
    const result = await dynamoDB.send(new ScanCommand({
      TableName: 'Unify-Users',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email }
    }));
    return result.Items?.length > 0 ? result.Items[0] : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

// Helper: Build map of email -> userId for quick headId resolution
const getUserIdMapByEmails = async (emails) => {
  try {
    const normalized = Array.from(new Set((emails || []).filter(Boolean).map((e) => String(e).trim().toLowerCase())));
    if (normalized.length === 0) return new Map();

    const result = await dynamoDB.send(new ScanCommand({
      TableName: 'Unify-Users',
      ProjectionExpression: 'userId, email'
    }));

    const map = new Map();
    for (const user of result.Items || []) {
      const email = user?.email ? String(user.email).trim().toLowerCase() : '';
      if (email && normalized.includes(email) && user?.userId) {
        map.set(email, user.userId);
      }
    }
    return map;
  } catch (error) {
    console.error('Error resolving user IDs by email:', error);
    return new Map();
  }
};

// Helper: Get chapter by name
const getChapterByName = async (chapterName) => {
  try {
    const result = await dynamoDB.send(new ScanCommand({
      TableName: 'Chapters',
      FilterExpression: 'chapterName = :chapterName',
      ExpressionAttributeValues: { ':chapterName': chapterName }
    }));
    return result.Items?.length > 0 ? result.Items[0] : null;
  } catch (error) {
    console.error('Error getting chapter:', error);
    return null;
  }
};

// Helper: Get chapter by ID
const getChapterById = async (chapterId) => {
  try {
    const result = await dynamoDB.send(new GetCommand({
      TableName: 'Chapters',
      Key: { chapterId }
    }));
    return result.Item || null;
  } catch (error) {
    console.error('Error getting chapter by ID:', error);
    return null;
  }
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
};

const toSafeString = (value) => String(value || '').trim();

const formatChapterForModel = (chapter, joinedChapterIds, joinedChapterNames, preferredSchools, preferredTags) => {
  const chapterTags = normalizeTags(chapter.tags);
  const school = toSafeString(chapter.school);
  const overlappingTags = chapterTags.filter((tag) => preferredTags.has(tag));
  const sameSchool = !!school && preferredSchools.has(school);
  const memberCount = Number(chapter.memberCount || 0);
  const alreadyJoined = joinedChapterIds.has(chapter.chapterId) || joinedChapterNames.has(chapter.chapterName);

  let score = 0;
  if (sameSchool) score += 5;
  score += overlappingTags.length * 3;
  if (chapter.registrationOpen) score += 1;
  score += Math.min(memberCount / 50, 2);

  const reasons = [];
  if (sameSchool) reasons.push(`Matches your interest in ${school}`);
  if (overlappingTags.length > 0) reasons.push(`Shared topics: ${overlappingTags.slice(0, 3).join(', ')}`);
  if (memberCount > 0) reasons.push(`${memberCount} students already joined`);
  if (chapter.registrationOpen) reasons.push('Registration is open now');

  return {
    chapterId: chapter.chapterId,
    chapterName: chapter.chapterName,
    headName: chapter.headName || 'Not assigned',
    school,
    tags: chapterTags,
    memberCount,
    registrationOpen: !!chapter.registrationOpen,
    score,
    reasons: reasons.slice(0, 3),
    alreadyJoined
  };
};

const buildRecommendationContext = async (user) => {
  const [allChaptersResult, approvedResult] = await Promise.all([
    dynamoDB.send(new ScanCommand({
      TableName: 'Chapters',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'active' }
    })),
    dynamoDB.send(new ScanCommand({
      TableName: 'RegistrationRequests',
      FilterExpression: 'userId = :userId AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':userId': user.userId,
        ':status': 'approved'
      }
    }))
  ]);

  const joinedChapterIds = new Set((approvedResult.Items || []).map((item) => item.chapterId).filter(Boolean));
  const joinedChapterNames = new Set(
    Array.from(user.registeredChapters || []).map((name) => toSafeString(name)).filter(Boolean)
  );

  const joinedChapters = (allChaptersResult.Items || []).filter(
    (chapter) => joinedChapterIds.has(chapter.chapterId) || joinedChapterNames.has(chapter.chapterName)
  );

  const preferredSchools = new Set(
    joinedChapters.map((chapter) => toSafeString(chapter.school)).filter(Boolean)
  );
  const preferredTags = new Set(joinedChapters.flatMap((chapter) => normalizeTags(chapter.tags)));

  const rankedCandidates = (allChaptersResult.Items || [])
    .map((chapter) => formatChapterForModel(chapter, joinedChapterIds, joinedChapterNames, preferredSchools, preferredTags))
    .filter((chapter) => !chapter.alreadyJoined)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (Number(b.registrationOpen) !== Number(a.registrationOpen)) {
        return Number(b.registrationOpen) - Number(a.registrationOpen);
      }
      return b.memberCount - a.memberCount;
    });

  return {
    preferredSchools: Array.from(preferredSchools),
    preferredTags: Array.from(preferredTags),
    joinedChapters: joinedChapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      chapterName: chapter.chapterName,
      school: toSafeString(chapter.school),
      tags: normalizeTags(chapter.tags)
    })),
    rankedCandidates
  };
};

const invokeRecommendationModel = async ({ user, context, mode, message, history }) => {
  const candidateSlice = context.rankedCandidates.slice(0, 8).map((chapter) => ({
    chapterId: chapter.chapterId,
    chapterName: chapter.chapterName,
    school: chapter.school,
    tags: chapter.tags,
    memberCount: chapter.memberCount,
    registrationOpen: chapter.registrationOpen,
    reasons: chapter.reasons,
    score: chapter.score
  }));

  const systemText = mode === 'chat'
    ? `You are Unify's chapter recommendation assistant. Use only the provided chapter data from DynamoDB. Recommend chapters based on school and tags. Be concise, useful, and conversational. Return valid JSON with keys: answer, recommendedChapterIds.`
    : `You are Unify's chapter recommendation ranker. Use only the provided chapter data from DynamoDB. Rank chapters for the student based on school and tags. Return valid JSON with keys: recommendations where each recommendation has chapterId and reasons.`;

  const promptPayload = {
    student: {
      name: user.name,
      email: user.email,
      schoolSignals: context.preferredSchools,
      tagSignals: context.preferredTags,
      joinedChapters: context.joinedChapters
    },
    candidateChapters: candidateSlice,
    userMessage: message || '',
    conversationHistory: history || []
  };

  const response = await bedrockClient.send(new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    system: [{ text: systemText }],
    messages: [
      {
        role: 'user',
        content: [{ text: JSON.stringify(promptPayload) }]
      }
    ],
    inferenceConfig: {
      maxTokens: 800,
      temperature: 0.2
    }
  }));

  const text = response?.output?.message?.content
    ?.map((item) => item.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Empty model response');
  }

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const jsonText = jsonStart >= 0 && jsonEnd >= jsonStart ? text.slice(jsonStart, jsonEnd + 1) : text;
  return JSON.parse(jsonText);
};

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (
    event.httpMethod === 'OPTIONS' ||
    event.requestContext?.http?.method === 'OPTIONS'
  ) {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'No authorization header' }) };
    }

    const token = authHeader.replace('Bearer ', '');
    const userEmail = getUserEmailFromToken(token);
    console.log('Extracted user email:', userEmail);
    
    if (!userEmail) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Unified API Gateway v1/v2 path and method resolution
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    let path =
      event.resource ||
      (event.routeKey ? event.routeKey.replace(/^[A-Z]+\s+/, '') : undefined) ||
      (event.rawPath ? event.rawPath.replace(/^\/[^/]+/, '') : undefined);

    if (!path && event.rawPath) path = event.rawPath;

    const pathParameters = event.pathParameters || {};
    const queryStringParameters = event.queryStringParameters || {};

    console.log('Processing request:', httpMethod, path);

    // Route handling
    switch (true) {
      case httpMethod === 'POST' && path === '/register-student':
        return await registerStudentForChapter(JSON.parse(event.body), userEmail, headers);
      
      case httpMethod === 'GET' && path === '/get-chapters':
        return await getAvailableChapters(userEmail, headers);
      
      case httpMethod === 'GET' && path === '/student/my-chapters':
        return await getMyChapters(userEmail, headers);
      
      case httpMethod === 'GET' && path === '/student/dashboard':
        return await getStudentDashboard(userEmail, headers);
      
      case httpMethod === 'GET' && path === '/student/recommendations':
        return await getRecommendedChapters(userEmail, headers);

      case httpMethod === 'POST' && path === '/student/recommendations/chat':
        return await chatWithRecommendationBot(userEmail, JSON.parse(event.body || '{}'), headers);
      
      case httpMethod === 'GET' && path === '/student/pending-registrations':
        return await getPendingRegistrations(userEmail, headers);
      
      case httpMethod === 'DELETE' && path === '/student/chapters/{chapterId}/leave':
        return await leaveChapter(userEmail, pathParameters.chapterId, headers);
      
      default:
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint not found' }) };
    }
  } catch (error) {
    console.error('Lambda error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};

// Register student for a chapter
const registerStudentForChapter = async (body, userEmail, headers) => {
  try {
    const { chapterName, studentName, studentEmail } = body;

    // Verify the requesting user matches the student email
    if (userEmail !== studentEmail) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Access denied. Can only register yourself.' })
      };
    }

    // Get user details
    const user = await getUserByEmail(studentEmail);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Get chapter details
    const chapter = await getChapterByName(chapterName);
    if (!chapter) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Chapter not found' })
      };
    }

    // Check if chapter registration is open
    if (!chapter.registrationOpen) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Registration is closed for this chapter' })
      };
    }

    // Check if user already has an active registration (pending or approved)
    const existingResult = await dynamoDB.send(new ScanCommand({
      TableName: 'RegistrationRequests',
      FilterExpression: 'userId = :userId AND chapterId = :chapterId AND (#status = :pending OR #status = :approved)',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': user.userId,
        ':chapterId': chapter.chapterId,
        ':pending': 'pending',
        ':approved': 'approved'
      }
    }));

    if (existingResult.Items && existingResult.Items.length > 0) {
      const existingRequest = existingResult.Items[0];
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Registration request already exists with status: ${existingRequest.status}` 
        })
      };
    }

    // Create a registration request
    const registrationId = `${user.userId}-${chapter.chapterId}-${Date.now()}`;
    const registrationRequest = {
      registrationId,
      userId: user.userId,
      studentName: user.name,
      studentEmail: user.email,
      chapterId: chapter.chapterId,
      chapterName: chapter.chapterName,
      status: 'pending',
      appliedAt: new Date().toISOString(),
      sapId: user.sapId || null,
      year: user.year || null
    };

    await dynamoDB.send(new PutCommand({
      TableName: 'RegistrationRequests',
      Item: registrationRequest
    }));

    // Create an activity record
    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const activity = {
      activityId,
      chapterId: chapter.chapterId,
      type: 'registration',
      message: `New registration request from ${user.name}`,
      timestamp: new Date().toISOString(),
      userId: user.userId,
      metadata: { registrationId }
    };

    await dynamoDB.send(new PutCommand({
      TableName: 'Activities',
      Item: activity
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Registration request submitted successfully. Awaiting chapter head approval.',
        registrationId,
        chapterName,
        studentName,
        status: 'pending'
      })
    };
  } catch (error) {
    console.error('Error registering student:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to register for chapter', details: error.message })
    };
  }
};

// Get all available chapters
const getAvailableChapters = async (userEmail, headers) => {
  try {
    const result = await dynamoDB.send(new ScanCommand({
      TableName: 'Chapters',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'active' }
    }));
    // Add registration status and transform data for frontend
    const chapters = (result.Items || []).map(chapter => ({
      id: chapter.chapterId,
      name: chapter.chapterName,
      description: `Managed by ${chapter.headName}`,
      school: chapter.school || '',
      category: 'General',
      adminId: chapter.chapterId,
      adminName: chapter.headName,
      isRegistrationOpen: chapter.registrationOpen || false,
      memberCount: chapter.memberCount || 0,
      requirements: ['Active participation', 'Regular attendance'],
      benefits: ['Skill development', 'Networking opportunities'],
      meetingSchedule: 'Weekly meetings',
      contactEmail: chapter.headEmail,
      tags: normalizeTags(chapter.tags),
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ chapters }) };
  } catch (error) {
    console.error('Error getting chapters:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch chapters', details: error.message })
    };
  }
};

// Get student's registered chapters
const getMyChapters = async (userEmail, headers) => {
  try {
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Get approved registration requests for this user
    const approvedResult = await dynamoDB.send(new ScanCommand({
      TableName: 'RegistrationRequests',
      FilterExpression: 'userId = :userId AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': user.userId,
        ':status': 'approved'
      }
    }));

    const approvedRegistrations = approvedResult.Items || [];
    
    if (approvedRegistrations.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ chapters: [] })
      };
    }

    // Get details for each approved chapter
    const chapterPromises = approvedRegistrations.map(async (request) => {
      const chapter = await getChapterById(request.chapterId);
      if (chapter) {
        return {
          ...chapter,
          joinedAt: request.appliedAt,
          approvedAt: request.processedAt
        };
      }
      return null;
    });

    const chapters = await Promise.all(chapterPromises);
    const validChapters = chapters.filter(chapter => chapter !== null);

    const headEmails = validChapters
      .map((chapter) => chapter?.headEmail)
      .filter(Boolean);
    const headIdByEmail = await getUserIdMapByEmails(headEmails);

    const formattedChapters = validChapters.map(chapter => ({
      id: chapter.chapterId,
      name: chapter.chapterName,
      description: `Managed by ${chapter.headName}`,
      memberCount: chapter.memberCount || 0,
      school: chapter.school || '',
      tags: normalizeTags(chapter.tags),
      headName: chapter.headName,
      headEmail: chapter.headEmail,
      headId: chapter.headId || headIdByEmail.get(String(chapter.headEmail || '').trim().toLowerCase()) || null,
      status: chapter.status,
      joinedAt: chapter.joinedAt,
      approvedAt: chapter.approvedAt
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ chapters: formattedChapters }) };
  } catch (error) {
    console.error('Error getting my chapters:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch registered chapters', details: error.message })
    };
  }
};

// Get student dashboard data
const getStudentDashboard = async (userEmail, headers) => {
  try {
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    const registeredChapters = user.registeredChapters ? Array.from(user.registeredChapters) : [];
    
    // Fetch events attended
    let eventsAttended = 0;
    try {
      const eventRegs = await dynamoDB.send(new ScanCommand({
        TableName: 'EventPayments',
        FilterExpression: 'userId = :userId AND (paymentStatus = :completed OR paymentStatus = :na)',
        ExpressionAttributeValues: {
          ':userId': user.userId,
          ':completed': 'COMPLETED',
          ':na': 'NA'
        }
      }));
      eventsAttended = eventRegs.Items ? eventRegs.Items.length : 0;
    } catch (err) {
      console.log('Event payments scan issue:', err.message);
    }

    // Fetch recent activities
    let recentActivities = [];
    try {
      const activitiesResult = await dynamoDB.send(new ScanCommand({
        TableName: 'Activities',
        FilterExpression: 'userId = :userId OR (attribute_not_exists(userId) AND chapterId IN (:chapters))',
        ExpressionAttributeValues: {
          ':userId': user.userId,
          ':chapters': registeredChapters.length > 0 ? registeredChapters : ['NONE']
        }
      }));
      recentActivities = (activitiesResult.Items || [])
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5)
        .map(a => ({
          id: a.activityId,
          message: a.message,
          timestamp: a.timestamp,
          type: a.type
        }));
    } catch (err) {
      console.log('Activities scan issue:', err.message);
    }

    // Get chapter details
    const chapterPromises = registeredChapters.map(async (chapterName) => {
      return await getChapterByName(chapterName);
    });

    const chapters = await Promise.all(chapterPromises);
    const validChapters = chapters.filter(chapter => chapter !== null);

    const dashboardData = {
      student: {
        name: user.name,
        email: user.email,
        sapId: user.sapId,
        year: user.year,
        registeredChaptersCount: registeredChapters.length,
        attendedEvents: user.attendedEvents || []
      },
      chapters: validChapters.map(chapter => ({
        id: chapter.chapterId,
        name: chapter.chapterName,
        headName: chapter.headName,
        memberCount: chapter.memberCount || 0,
        school: chapter.school || '',
        tags: normalizeTags(chapter.tags)
      })),
      stats: {
        totalChapters: registeredChapters.length,
        upcomingEvents: 0,
        completedEvents: eventsAttended,
        eventsAttended: eventsAttended
      },
      recentActivities
    };

    return { statusCode: 200, headers, body: JSON.stringify(dashboardData) };
  } catch (error) {
    console.error('Error getting dashboard:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch dashboard data', details: error.message })
    };
  }
};

const getRecommendedChapters = async (userEmail, headers) => {
  try {
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    const context = await buildRecommendationContext(user);
    let recommendations = context.rankedCandidates.slice(0, 5);
    let recommendationStrategy = context.preferredSchools.length > 0 || context.preferredTags.length > 0
      ? 'bedrock-nova-micro-school-tag-ranking'
      : 'bedrock-nova-micro-popular-open-chapters';

    try {
      const modelResult = await invokeRecommendationModel({
        user,
        context,
        mode: 'rank'
      });

      if (Array.isArray(modelResult?.recommendations) && modelResult.recommendations.length > 0) {
        const modelMap = new Map(
          (modelResult.recommendations || []).map((item) => [item.chapterId, item])
        );

        const reranked = context.rankedCandidates
          .filter((chapter) => modelMap.has(chapter.chapterId))
          .map((chapter) => {
            const modelChapter = modelMap.get(chapter.chapterId) || {};
            return {
              ...chapter,
              reasons: Array.isArray(modelChapter.reasons) && modelChapter.reasons.length > 0
                ? modelChapter.reasons.slice(0, 3)
                : chapter.reasons
            };
          });

        if (reranked.length > 0) {
          recommendations = reranked.slice(0, 5);
        }
      }
    } catch (modelError) {
      console.warn('Bedrock ranking failed, falling back to heuristic ranking:', modelError.message);
      recommendationStrategy = 'heuristic-fallback';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        recommendations,
        strategy: recommendationStrategy,
        profileSignals: {
          schools: context.preferredSchools,
          tags: context.preferredTags
        }
      })
    };
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch recommendations', details: error.message })
    };
  }
};

const chatWithRecommendationBot = async (userEmail, body, headers) => {
  try {
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    const message = toSafeString(body?.message);
    const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];

    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }

    const context = await buildRecommendationContext(user);
    let recommendations = context.rankedCandidates.slice(0, 5);
    let answer = `My top chapter picks for you right now are ${recommendations.map((item) => item.chapterName).join(', ')}.`;

    try {
      const modelResult = await invokeRecommendationModel({
        user,
        context,
        mode: 'chat',
        message,
        history
      });

      if (Array.isArray(modelResult?.recommendedChapterIds) && modelResult.recommendedChapterIds.length > 0) {
        const idSet = new Set(modelResult.recommendedChapterIds);
        const botRecommendations = context.rankedCandidates.filter((chapter) => idSet.has(chapter.chapterId));
        if (botRecommendations.length > 0) {
          recommendations = botRecommendations.slice(0, 5);
        }
      }

      if (typeof modelResult?.answer === 'string' && modelResult.answer.trim()) {
        answer = modelResult.answer.trim();
      }
    } catch (modelError) {
      console.warn('Bedrock chatbot failed, using fallback message:', modelError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        answer,
        recommendations,
        strategy: 'bedrock-nova-micro-chat'
      })
    };
  } catch (error) {
    console.error('Error chatting with recommendation bot:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to chat with recommendation bot', details: error.message })
    };
  }
};

// Leave a chapter
const leaveChapter = async (userEmail, chapterId, headers) => {
  try {
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Get chapter details
    const chapter = await getChapterById(chapterId);
    if (!chapter) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Chapter not found' })
      };
    }

    // Check if user has an approved registration for this chapter
    const existingResult = await dynamoDB.send(new ScanCommand({
      TableName: 'RegistrationRequests',
      FilterExpression: 'userId = :userId AND chapterId = :chapterId AND #status = :approvedStatus',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': user.userId,
        ':chapterId': chapterId,
        ':approvedStatus': 'approved'
      }
    }));

    if (!existingResult.Items || existingResult.Items.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Not currently a member of this chapter' })
      };
    }

    const registrationRequest = existingResult.Items[0];

    // Delete the registration request completely so user can re-register
    await dynamoDB.send(new UpdateCommand({
      TableName: 'RegistrationRequests',
      Key: { registrationId: registrationRequest.registrationId },
      UpdateExpression: 'SET #status = :status, processedAt = :processedAt, processedBy = :processedBy',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'left',
        ':processedAt': new Date().toISOString(),
        ':processedBy': user.email
      }
    }));

    // Update user's registered chapters in Users table (remove from set)
    const currentChapters = user.registeredChapters ? Array.from(user.registeredChapters) : [];
    const updatedChapters = currentChapters.filter(name => name !== chapter.chapterName);

    await dynamoDB.send(new UpdateCommand({
      TableName: 'Unify-Users',
      Key: { userId: user.userId },
      UpdateExpression: 'SET registeredChapters = :chapters, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':chapters': updatedChapters,
        ':updatedAt': new Date().toISOString()
      }
    }));

    // Update chapter member count (ensure it doesn't go below 0)
    await dynamoDB.send(new UpdateCommand({
      TableName: 'Chapters',
      Key: { chapterId },
      UpdateExpression: 'SET memberCount = if_not_exists(memberCount, :zero) - :dec, updatedAt = :updatedAt',
      ConditionExpression: 'memberCount > :zero',
      ExpressionAttributeValues: {
        ':dec': 1,
        ':zero': 0,
        ':updatedAt': new Date().toISOString()
      }
    })).catch(async (error) => {
      // If condition fails, set memberCount to 0
      if (error.name === 'ConditionalCheckFailedException') {
        await dynamoDB.send(new UpdateCommand({
          TableName: 'Chapters',
          Key: { chapterId },
          UpdateExpression: 'SET memberCount = :zero, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':updatedAt': new Date().toISOString()
          }
        }));
      } else {
        throw error;
      }
    });

    // Create activity record
    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const activity = {
      activityId,
      chapterId: chapter.chapterId,
      type: 'member_left',
      message: `${user.name} left the chapter`,
      timestamp: new Date().toISOString(),
      userId: user.userId,
      metadata: { registrationId: registrationRequest.registrationId }
    };

    await dynamoDB.send(new PutCommand({
      TableName: 'Activities',
      Item: activity
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Successfully left chapter',
        chapterName: chapter.chapterName
      })
    };
  } catch (error) {
    console.error('Error leaving chapter:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to leave chapter', details: error.message })
    };
  }
};

const getPendingRegistrations = async (userEmail, headers) => {
  try {
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Get all registration requests for this user
    const params = {
      TableName: 'RegistrationRequests',
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': user.userId
      }
    };

    const result = await dynamoDB.send(new ScanCommand(params));
    const requests = result.Items || [];

    // Format the registration requests
    const formattedRequests = requests.map(request => ({
      registrationId: request.registrationId,
      chapterId: request.chapterId,
      chapterName: request.chapterName,
      status: request.status,
      appliedAt: request.appliedAt,
      processedAt: request.processedAt || null,
      processedBy: request.processedBy || null,
      notes: request.notes || null
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        registrations: formattedRequests,
        totalCount: formattedRequests.length,
        pendingCount: formattedRequests.filter(r => r.status === 'pending').length,
        approvedCount: formattedRequests.filter(r => r.status === 'approved').length,
        rejectedCount: formattedRequests.filter(r => r.status === 'rejected').length,
        leftCount: formattedRequests.filter(r => r.status === 'left').length,
        kickedCount: formattedRequests.filter(r => r.status === 'kicked').length
      })
    };
  } catch (error) {
    console.error('Error getting pending registrations:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch registration requests' })
    };
  }
};
