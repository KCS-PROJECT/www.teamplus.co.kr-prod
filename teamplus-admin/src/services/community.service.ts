import { api } from './api-client';
import type {
  TeamPost,
  TeamPostComment,
  TeamPostAttachment,
  TeamPostLike,
  TeamEvent,
  TeamEventRegistration,
  CommunityStats,
} from '../types';

/**
 * 커뮤니티 - 클럽 게시글/댓글/이벤트 API 래퍼
 */

// ===== Posts =====

export const getClubPosts = async (
  clubId: string,
  params?: { limit?: number; postType?: string }
): Promise<TeamPost[]> => {
  return api.get<TeamPost[]>(`/teams/${clubId}/community/posts`, { params });
};

export const getClubPostDetail = async (
  clubId: string,
  postId: string,
): Promise<TeamPost> => {
  return api.get(`/teams/${clubId}/community/posts/${postId}`);
};

export const createClubPost = async (
  clubId: string,
  payload: {
    title: string;
    content: string;
    postType?: string;
    targetLevel?: string;
    isPinned?: boolean;
    attachments?: {
      fileUrl: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }[];
  },
): Promise<TeamPost> => {
  return api.post(`/teams/${clubId}/community/posts`, payload);
};

export const updateClubPost = async (
  clubId: string,
  postId: string,
  payload: {
    title?: string;
    content?: string;
    postType?: string;
    targetLevel?: string;
    isPinned?: boolean;
  },
): Promise<TeamPost> => {
  return api.patch(`/teams/${clubId}/community/posts/${postId}`, payload);
};

export const deleteClubPost = async (
  clubId: string,
  postId: string,
): Promise<void> => {
  return api.delete(`/teams/${clubId}/community/posts/${postId}`);
};

// ===== Likes =====

export const toggleLike = async (
  clubId: string,
  postId: string,
): Promise<{ liked: boolean; likeCount: number }> => {
  return api.post(`/teams/${clubId}/community/posts/${postId}/like`);
};

export const getPostLikes = async (
  clubId: string,
  postId: string,
): Promise<TeamPostLike[]> => {
  return api.get(`/teams/${clubId}/community/posts/${postId}/likes`);
};

// ===== Attachments =====

export const addAttachment = async (
  clubId: string,
  postId: string,
  payload: {
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  },
): Promise<TeamPostAttachment> => {
  return api.post(`/teams/${clubId}/community/posts/${postId}/attachments`, payload);
};

export const deleteAttachment = async (
  clubId: string,
  attachmentId: string,
): Promise<void> => {
  return api.delete(`/teams/${clubId}/community/attachments/${attachmentId}`);
};

// ===== Comments =====

export const addClubPostComment = async (
  clubId: string,
  postId: string,
  payload: { content: string },
): Promise<TeamPostComment> => {
  return api.post(`/teams/${clubId}/community/posts/${postId}/comments`, payload);
};

export const updateComment = async (
  clubId: string,
  commentId: string,
  payload: { content: string },
): Promise<TeamPostComment> => {
  return api.patch(`/teams/${clubId}/community/comments/${commentId}`, payload);
};

export const deleteComment = async (
  clubId: string,
  commentId: string,
): Promise<void> => {
  return api.delete(`/teams/${clubId}/community/comments/${commentId}`);
};

// ===== Events =====

export const getClubEvents = async (
  clubId: string,
): Promise<TeamEvent[]> => {
  return api.get(`/teams/${clubId}/community/events`);
};

export const getClubEventDetail = async (
  clubId: string,
  eventId: string,
): Promise<TeamEvent & { registrations: TeamEventRegistration[] }> => {
  return api.get(`/teams/${clubId}/community/events/${eventId}`);
};

export const createClubEvent = async (
  clubId: string,
  payload: {
    title: string;
    description?: string;
    eventType: string;
    targetLevel?: string;
    capacity?: number;
    startAt: string;
    endAt: string;
    priceMode?: string;
    priceAmount?: number;
    status?: string;
  },
): Promise<TeamEvent> => {
  return api.post(`/teams/${clubId}/community/events`, payload);
};

export const updateClubEvent = async (
  clubId: string,
  eventId: string,
  payload: Partial<{
    title: string;
    description: string;
    eventType: string;
    targetLevel: string;
    capacity: number;
    startAt: string;
    endAt: string;
    priceMode: string;
    priceAmount: number;
    status: string;
  }>,
): Promise<TeamEvent> => {
  return api.patch(`/teams/${clubId}/community/events/${eventId}`, payload);
};

export const deleteClubEvent = async (
  clubId: string,
  eventId: string,
): Promise<void> => {
  return api.delete(`/teams/${clubId}/community/events/${eventId}`);
};

export const registerClubEvent = async (
  clubId: string,
  eventId: string,
  payload: { memberId: string; memo?: string },
): Promise<TeamEventRegistration> => {
  return api.post(`/teams/${clubId}/community/events/${eventId}/register`, payload);
};

export const cancelClubEventRegistration = async (
  clubId: string,
  eventId: string,
  payload: { memberId: string },
): Promise<TeamEventRegistration> => {
  return api.post(`/teams/${clubId}/community/events/${eventId}/cancel`, payload);
};

// ===== Statistics =====

export const getCommunityStats = async (
  clubId: string,
): Promise<CommunityStats> => {
  return api.get(`/teams/${clubId}/community/stats`);
};

export const communityService = {
  // Posts
  getClubPosts,
  getClubPostDetail,
  createClubPost,
  updateClubPost,
  deleteClubPost,
  // Likes
  toggleLike,
  getPostLikes,
  // Attachments
  addAttachment,
  deleteAttachment,
  // Comments
  addClubPostComment,
  updateComment,
  deleteComment,
  // Events
  getClubEvents,
  getClubEventDetail,
  createClubEvent,
  updateClubEvent,
  deleteClubEvent,
  registerClubEvent,
  cancelClubEventRegistration,
  // Stats
  getCommunityStats,
};

export default communityService;
