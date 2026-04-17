// src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://y0fr6gasgk.execute-api.ap-south-1.amazonaws.com/dev';
const PAYMENT_API_BASE_URL = import.meta.env.VITE_PAYMENT_API_BASE_URL || API_BASE_URL;

// Helper function to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('idToken');
  console.log('JWT Token exists:', !!token);
  console.log('API Base URL:', API_BASE_URL);
  
  if (token) {
    console.log('Token preview:', token.substring(0, 50) + '...');
    
    // Check if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = Date.now() >= payload.exp * 1000;
      console.log('Token expired:', isExpired);
      if (isExpired) {
        console.warn('Token is expired! User should re-authenticate.');
      }
    } catch (error) {
      console.error('Error checking token expiry:', error);
    }
  } else {
    console.warn('No JWT token found in localStorage');
  }
  
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

// Helper function to handle API responses
const handleResponse = async (response: Response) => {
  console.log(`API Response: ${response.status} ${response.statusText}`, response.url);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error Response:', errorText);
    
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText || 'Unknown error' };
    }
    
    // Log detailed error information for debugging
    console.error('API Error Details:', {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      errorData
    });
    
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('API Success Response:', data);
  return data;
};

export const studentAPI = {
  // Health check
  healthCheck: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      return handleResponse(response);
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  },

  // Dashboard
  getDashboard: async () => {
    const response = await fetch(`${API_BASE_URL}/student/dashboard`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Chapters - using consistent endpoint names with backend
  getAvailableChapters: async () => {
    const response = await fetch(`${API_BASE_URL}/get-chapters`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getMyChapters: async () => {
    const response = await fetch(`${API_BASE_URL}/student/my-chapters`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getRecommendedChapters: async () => {
    const response = await fetch(`${API_BASE_URL}/student/recommendations`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  chatWithRecommendationBot: async (payload: { message: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> }) => {
    const response = await fetch(`${API_BASE_URL}/student/recommendations/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getAllChapters: async () => {
    const response = await fetch(`${API_BASE_URL}/get-chapters`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
  getChapterProfile: async (chapterId: string) => {
    const response = await fetch(`${PAYMENT_API_BASE_URL}/api/chapters/${encodeURIComponent(chapterId)}/profile`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
  // Chapter Registration - consistent with backend expectations
  registerForChapter: async (chapterName: string, studentData: { name: string; email: string; sapId?: string; year?: string }) => {
    const response = await fetch(`${API_BASE_URL}/register-student`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        studentEmail: studentData.email,
        studentName: studentData.name,
        chapterName: chapterName,
        sapId: studentData.sapId,
        year: studentData.year
      }),
    });
    return handleResponse(response);
  },

  leaveChapter: async (chapterId: string) => {
    const response = await fetch(`${API_BASE_URL}/student/chapters/${chapterId}/leave`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Registration Requests
  getPendingRegistrations: async () => {
    const response = await fetch(`${API_BASE_URL}/student/pending-registrations`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Profile
  getProfile: async () => {
    const response = await fetch(`${API_BASE_URL}/student/profile`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
};
