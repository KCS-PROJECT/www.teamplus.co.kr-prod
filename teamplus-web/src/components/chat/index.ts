/**
 * Chat Components - TEAMPLUS Design System
 *
 * Complete set of chat components following Design 7 Principles:
 * - No gradients, no backdrop-blur
 * - Solid colors only
 * - Human-made design feel
 */

// Avatar
export { Avatar, AvatarGroup } from './Avatar';

// Message Components
export {
  MessageBubble,
  TypingIndicator,
  ReadReceipt,
  ImagePlaceholder,
  type Message
} from './MessageBubble';

// Input Components
export { ChatInput, ChatHeader } from './ChatInput';

// Room View (메시지 목록 + 입력창 공용 컴포넌트 — 페이지/시트 임베드용)
export { ChatRoomView } from './ChatRoomView';

// Dividers
export { DateDivider, SystemMessage, UnreadDivider } from './DateDivider';
